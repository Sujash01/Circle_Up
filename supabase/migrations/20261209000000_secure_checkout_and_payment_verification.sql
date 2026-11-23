-- ==============================================================================
-- CircleUp Security Hardening Migration: Phase 1
-- Migration: 20261209000000_secure_checkout_and_payment_verification.sql
-- 
-- Resolves Phase 1 Critical Security Vulnerabilities:
-- 1. Unsorted product row locking deadlock (SQLSTATE 40P01)
-- 2. Razorpay payment verification replay, cross-order hijack, and missing server verification
-- 3. Database-level payment ID uniqueness with preflight assertion
-- 4. Order-to-gateway binding via storefront_attach_razorpay_order_id
-- 5. Transactionally safe webhook idempotency logging
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT ASSERTION & UNIQUE INDEX ON razorpay_payment_id
-- ------------------------------------------------------------------------------
do $$
declare
  v_dup_count integer;
  v_dup_samples text;
begin
  select count(*), string_agg(razorpay_payment_id || ' (' || cnt::text || ')', ', ')
  into v_dup_count, v_dup_samples
  from (
    select razorpay_payment_id, count(*) as cnt
    from public.orders
    where razorpay_payment_id is not null
    group by razorpay_payment_id
    having count(*) > 1
  ) dups;

  if v_dup_count > 0 then
    raise exception 'PREFLIGHT_FAILED: Cannot create unique index uq_orders_razorpay_payment_id because % duplicate razorpay_payment_id values exist in public.orders: %', v_dup_count, v_dup_samples;
  end if;
end $$;

create unique index if not exists uq_orders_razorpay_payment_id
on public.orders(razorpay_payment_id)
where razorpay_payment_id is not null;

-- ------------------------------------------------------------------------------
-- 2. TRANSACTIONALLY SAFE WEBHOOK EVENT LEDGER
-- ------------------------------------------------------------------------------
create table if not exists public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  order_number text,
  payment_id text,
  status text not null check (status in ('PROCESSING', 'PROCESSED', 'FAILED')),
  payload jsonb,
  error_message text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  processed_at timestamptz
);

alter table public.razorpay_webhook_events add column if not exists lease_expires_at timestamptz;
alter table public.razorpay_webhook_events add column if not exists payment_id text;

create index if not exists idx_razorpay_webhook_events_order_number
on public.razorpay_webhook_events(order_number);

alter table public.razorpay_webhook_events enable row level security;
revoke all on public.razorpay_webhook_events from public, anon, authenticated;
grant all on public.razorpay_webhook_events to service_role;

-- ------------------------------------------------------------------------------
-- 3. WEBHOOK CLAIM AND FINALIZE RPCs (WITH RECOVERABLE LEASES)
-- ------------------------------------------------------------------------------
drop function if exists public.razorpay_claim_webhook_event(text, text, text, jsonb);

create or replace function public.razorpay_claim_webhook_event(
  p_event_id text,
  p_event_type text,
  p_order_number text,
  p_payment_id text default null,
  p_payload jsonb default null,
  p_lease_seconds integer default 120
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing record;
  v_now timestamptz := timezone('utc'::text, now());
  v_lease_duration interval := (coalesce(p_lease_seconds, 120) || ' seconds')::interval;
begin
  select * into v_existing
  from public.razorpay_webhook_events
  where event_id = p_event_id
  for update;

  if found then
    -- Safeguard 3: Immutable event identity check
    if v_existing.order_number is not null and p_order_number is not null and v_existing.order_number <> p_order_number then
      raise exception '%', jsonb_build_object(
        'code', 'IMMUTABLE_EVENT_CONFLICT',
        'message', 'Webhook event ' || p_event_id || ' is bound to order ' || v_existing.order_number || ', cannot claim for order ' || p_order_number
      )::text;
    end if;

    if v_existing.status = 'PROCESSED' then
      return 'ALREADY_PROCESSED';
    elsif v_existing.status = 'PROCESSING' and (v_existing.lease_expires_at is null or v_existing.lease_expires_at > v_now) then
      -- Active processing lease held by another worker
      return 'CONCURRENTLY_PROCESSING';
    end if;

    -- Recoverable lease renewal for abandoned PROCESSING or retried FAILED event
    update public.razorpay_webhook_events
    set
      status = 'PROCESSING',
      payment_id = coalesce(p_payment_id, payment_id),
      payload = coalesce(p_payload, payload),
      error_message = null,
      lease_expires_at = v_now + v_lease_duration,
      created_at = v_now
    where event_id = p_event_id;

    return 'CLAIMED';
  end if;

  insert into public.razorpay_webhook_events (
    event_id, event_type, order_number, payment_id, status, payload, lease_expires_at, created_at
  ) values (
    p_event_id, p_event_type, p_order_number, p_payment_id, 'PROCESSING', p_payload, v_now + v_lease_duration, v_now
  );

  return 'CLAIMED';
end;
$$;

create or replace function public.razorpay_finalize_webhook_event(
  p_event_id text,
  p_status text,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.razorpay_webhook_events
  set
    status = p_status,
    error_message = p_error_message,
    lease_expires_at = null,
    processed_at = timezone('utc'::text, now())
  where event_id = p_event_id;
end;
$$;

revoke all on function public.razorpay_claim_webhook_event(text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.razorpay_claim_webhook_event(text, text, text, text, jsonb, integer) to service_role;
revoke all on function public.razorpay_finalize_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.razorpay_finalize_webhook_event(text, text, text) to service_role;

-- ------------------------------------------------------------------------------
-- 4. ATTACH RAZORPAY ORDER ID RPC
-- ------------------------------------------------------------------------------
create or replace function public.storefront_attach_razorpay_order_id(
  p_order_number text,
  p_razorpay_order_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_status text;
  v_current_rzp_order_id text;
begin
  select id, status, razorpay_order_id into v_order_id, v_status, v_current_rzp_order_id
  from public.orders
  where order_number = upper(trim(p_order_number))
  for update;

  if not found then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_NOT_FOUND',
      'message', 'Order ' || p_order_number || ' was not found.'
    )::text;
  end if;

  if v_status in ('CANCELLED', 'RETURNED', 'REFUNDED') then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_ALREADY_CANCELLED',
      'message', 'Cannot attach Razorpay order ID to an inactive order.'
    )::text;
  end if;

  if v_current_rzp_order_id is not null and v_current_rzp_order_id <> p_razorpay_order_id then
    raise exception '%', jsonb_build_object(
      'code', 'RAZORPAY_ORDER_ID_CONFLICT',
      'message', 'Order is already bound to a different Razorpay order ID.'
    )::text;
  end if;

  update public.orders
  set
    razorpay_order_id = p_razorpay_order_id,
    updated_at = timezone('utc'::text, now())
  where id = v_order_id;

  return true;
end;
$$;

revoke all on function public.storefront_attach_razorpay_order_id(text, text) from public;
grant execute on function public.storefront_attach_razorpay_order_id(text, text) to service_role;

-- ------------------------------------------------------------------------------
-- 5. REWRITE: process_storefront_checkout (DETERMINISTIC ROW LOCKING)
-- ------------------------------------------------------------------------------
create or replace function public.process_storefront_checkout(
  p_key_hash text,
  p_fingerprint text,
  p_customer_id uuid,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_items jsonb,
  p_payment_method text,
  p_promo_code text default null,
  p_notes text default null,
  p_guest_access_token_hash text default null,
  p_guest_access_expires_at timestamptz default null,
  p_order_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_idem record;
  v_order_number text;
  v_order_id uuid;
  v_order_inserted boolean := false;
  v_created_at timestamptz;
  v_constraint_name text;
  v_attempt integer;
  v_item record;
  v_serial text;
  v_qty integer;
  v_item_size text;
  v_product record;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_delivery_fee bigint := 0;
  v_total_amount bigint := 0;
  v_discounted_subtotal bigint := 0;
  v_coupon record;
  v_coupon_customer_usage bigint := 0;
  v_new_stock integer;
  v_new_status text;
  v_items_json jsonb := '[]'::jsonb;
  v_response_payload jsonb;
begin
  -- ----------------------------------------------------------------------------
  -- 0. PRE-CHECK IDEMPOTENCY KEY
  -- ----------------------------------------------------------------------------
  if p_key_hash is null or length(trim(p_key_hash)) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'IDEMPOTENCY_KEY_REQUIRED',
      'message', 'A valid Idempotency-Key header is required.'
    )::text;
  end if;

  select *
  into v_existing_idem
  from public.checkout_idempotency_keys
  where key_hash = p_key_hash;

  if found then
    if v_existing_idem.fingerprint <> p_fingerprint then
      raise exception '%', jsonb_build_object(
        'code', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        'message', 'An idempotency key cannot be reused for a different checkout request payload.'
      )::text;
    end if;

    if v_existing_idem.status = 'COMMITTED' then
      return v_existing_idem.response_payload;
    end if;
  end if;

  -- ----------------------------------------------------------------------------
  -- 1. CLAIM IDEMPOTENCY KEY
  -- ----------------------------------------------------------------------------
  insert into public.checkout_idempotency_keys (
    key_hash,
    fingerprint,
    status,
    customer_id,
    order_id,
    created_at,
    expires_at
  )
  values (
    p_key_hash,
    p_fingerprint,
    'PROCESSING',
    p_customer_id,
    null,
    pg_catalog.now(),
    pg_catalog.now() + interval '24 hours'
  )
  on conflict (key_hash) do update
  set
    status = 'PROCESSING',
    expires_at = pg_catalog.now() + interval '24 hours'
  where
    public.checkout_idempotency_keys.key_hash = p_key_hash;

  -- ----------------------------------------------------------------------------
  -- 2. VALIDATE PAYMENT METHOD
  -- ----------------------------------------------------------------------------
  if p_payment_method in ('COD', 'CASH_ON_DELIVERY') then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_METHOD_DISALLOWED',
      'message', 'Cash on Delivery is no longer available. Please use online checkout.'
    )::text;
  end if;

  if p_payment_method not in ('RAZORPAY', 'ONLINE_UPI') then
    raise exception '%', jsonb_build_object(
      'code', 'INVALID_PAYMENT_METHOD',
      'message', 'Unsupported payment method: ' || coalesce(p_payment_method, 'null')
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 3. VALIDATE CUSTOMER & ITEMS INPUT
  -- ----------------------------------------------------------------------------
  if p_customer is null or
     p_customer->>'name' is null or length(trim(p_customer->>'name')) = 0 or
     p_customer->>'email' is null or length(trim(p_customer->>'email')) = 0 or
     p_customer->>'phone' is null or length(trim(p_customer->>'phone')) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'INVALID_CUSTOMER_INFO',
      'message', 'Customer name, email, and phone are strictly required.'
    )::text;
  end if;

  if p_items is null or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'EMPTY_ORDER_ITEMS',
      'message', 'Order must contain at least one item.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 4. VALIDATE & RESERVE INVENTORY DETERMINISTICALLY (SORTED LOCK ACQUISITION)
  -- ----------------------------------------------------------------------------
  for v_item in
    select
      upper(trim(value->>'serialNumber')) as serial_number,
      coalesce((value->>'quantity')::integer, 1) as quantity,
      trim(coalesce(value->>'size', '')) as size
    from pg_catalog.jsonb_array_elements(p_items)
    order by upper(trim(value->>'serialNumber')) asc
  loop
    v_serial := v_item.serial_number;
    v_qty := v_item.quantity;
    v_item_size := v_item.size;

    if v_serial is null or length(v_serial) = 0 or v_qty <= 0 or v_qty > 10 then
      raise exception '%', jsonb_build_object(
        'code', 'INVALID_ORDER_ITEM',
        'message', 'Each item must have a valid serialNumber and quantity between 1 and 10.'
      )::text;
    end if;

    select *
    into v_product
    from public.products
    where serial_number = v_serial
    for update;

    if not found then
      raise exception '%', jsonb_build_object(
        'code', 'PRODUCT_NOT_FOUND',
        'message', 'Product with serial number ' || v_serial || ' was not found.'
      )::text;
    end if;

    if v_product.status <> 'ACTIVE' or v_product.stock < v_qty then
      raise exception '%', jsonb_build_object(
        'code', 'OUT_OF_STOCK',
        'message', 'Item "' || v_product.name || '" (' || v_serial || ') is no longer available in the requested quantity.'
      )::text;
    end if;

    v_new_stock := v_product.stock - v_qty;
    v_new_status := case when v_new_stock = 0 then 'SOLD_OUT' else 'ACTIVE' end;

    update public.products
    set
      stock = v_new_stock,
      status = v_new_status,
      updated_at = pg_catalog.now()
    where id = v_product.id;

    v_subtotal := v_subtotal + (v_product.price * v_qty);

    v_items_json := v_items_json || pg_catalog.jsonb_build_object(
      'productId', v_product.id,
      'serialNumber', v_product.serial_number,
      'name', v_product.name,
      'price', v_product.price,
      'quantity', v_qty,
      'size', case when v_item_size <> '' then v_item_size else null end,
      'slug', v_product.slug,
      'image', case when pg_catalog.cardinality(v_product.images) > 0 then v_product.images[1] else null end
    );
  end loop;

  -- ----------------------------------------------------------------------------
  -- 5. COUPON VALIDATION & DISCOUNT CALCULATION
  -- ----------------------------------------------------------------------------
  if p_promo_code is not null and trim(p_promo_code) != '' then
    select *
    into v_coupon
    from public.coupons
    where code = upper(trim(p_promo_code))
    for update;

    if not found then
      raise exception '%', jsonb_build_object(
        'code', 'INVALID_COUPON',
        'message', 'Coupon code "' || p_promo_code || '" does not exist.'
      )::text;
    end if;

    if v_coupon.is_active is not true then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_INACTIVE',
        'message', 'Coupon "' || v_coupon.code || '" is inactive.'
      )::text;
    end if;

    if v_coupon.expires_at is not null and v_coupon.expires_at < pg_catalog.now() then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_EXPIRED',
        'message', 'Coupon "' || v_coupon.code || '" has expired.'
      )::text;
    end if;

    if v_coupon.max_uses is not null and v_coupon.usage_count >= v_coupon.max_uses then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_MAX_USES_REACHED',
        'message', 'Coupon "' || v_coupon.code || '" has reached its maximum global usage limit.'
      )::text;
    end if;

    if v_coupon.min_order_amount is not null and v_subtotal < v_coupon.min_order_amount then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_MIN_ORDER_UNMET',
        'message', 'Coupon "' || v_coupon.code || '" requires a minimum order subtotal of ₹' || (v_coupon.min_order_amount / 100)::text || '.'
      )::text;
    end if;

    if v_coupon.discount_type = 'PERCENTAGE' then
      v_discount := (v_subtotal * v_coupon.discount_value) / 100;
      if v_coupon.max_discount_amount is not null and v_discount > v_coupon.max_discount_amount then
        v_discount := v_coupon.max_discount_amount;
      end if;
    elsif v_coupon.discount_type = 'FLAT' then
      v_discount := v_coupon.discount_value;
      if v_discount > v_subtotal then
        v_discount := v_subtotal;
      end if;
    else
      raise exception '%', jsonb_build_object(
        'code', 'UNSUPPORTED_COUPON_TYPE',
        'message', 'Discount type ' || v_coupon.discount_type || ' is not supported.'
      )::text;
    end if;

    update public.coupons
    set usage_count = usage_count + 1
    where code = v_coupon.code;
  end if;

  -- ----------------------------------------------------------------------------
  -- 6. SHIPPING & FINAL TOTALS
  -- ----------------------------------------------------------------------------
  v_discounted_subtotal := v_subtotal - v_discount;
  if v_discounted_subtotal >= 100000 then
    v_delivery_fee := 0;
  else
    v_delivery_fee := 15000;
  end if;

  v_total_amount := v_discounted_subtotal + v_delivery_fee;

  -- ----------------------------------------------------------------------------
  -- 7. INSERT ORDER WITH RETRY LOOP ON COLLISION
  -- ----------------------------------------------------------------------------
  v_attempt := 0;
  while v_attempt < 5 loop
    v_attempt := v_attempt + 1;

    if p_order_number is not null and trim(p_order_number) != '' and v_attempt = 1 then
      v_order_number := upper(trim(p_order_number));
    else
      v_order_number := 'ORD-' || to_char(pg_catalog.now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    end if;

    begin
      insert into public.orders (
        order_number,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        total_amount,
        subtotal,
        discount_amount,
        shipping_amount,
        status,
        payment_status,
        payment_method,
        shipping_address,
        promo_code,
        notes,
        guest_access_token_hash,
        guest_access_expires_at,
        created_at,
        updated_at
      )
      values (
        v_order_number,
        p_customer_id,
        trim(p_customer->>'name'),
        lower(trim(p_customer->>'email')),
        trim(p_customer->>'phone'),
        v_total_amount,
        v_subtotal,
        v_discount,
        v_delivery_fee,
        'PENDING',
        'PENDING',
        p_payment_method,
        p_shipping_address,
        case when p_promo_code is not null and trim(p_promo_code) != '' then upper(trim(p_promo_code)) else null end,
        p_notes,
        p_guest_access_token_hash,
        p_guest_access_expires_at,
        pg_catalog.now(),
        pg_catalog.now()
      )
      returning id, created_at into v_order_id, v_created_at;

      v_order_inserted := true;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_attempt >= 5 then
        raise exception '%', jsonb_build_object(
          'code', 'ORDER_NUMBER_COLLISION',
          'message', 'Failed to allocate unique order number after multiple attempts.'
        )::text;
      end if;
    end;
  end loop;

  -- ----------------------------------------------------------------------------
  -- 8. INSERT ORDER ITEMS
  -- ----------------------------------------------------------------------------
  for v_item in select * from pg_catalog.jsonb_array_elements(v_items_json) loop
    insert into public.order_items (
      order_id,
      product_id,
      serial_number,
      name,
      price,
      quantity,
      size,
      image_url
    )
    values (
      v_order_id,
      (v_item.value->>'productId')::uuid,
      v_item.value->>'serialNumber',
      v_item.value->>'name',
      (v_item.value->>'price')::bigint,
      (v_item.value->>'quantity')::integer,
      v_item.value->>'size',
      v_item.value->>'image'
    );
  end loop;

  -- ----------------------------------------------------------------------------
  -- 9. ASSEMBLE RESPONSE & COMMIT IDEMPOTENCY
  -- ----------------------------------------------------------------------------
  v_response_payload := pg_catalog.jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'items', v_items_json,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'deliveryFee', v_delivery_fee,
    'totalAmount', v_total_amount,
    'status', 'PENDING',
    'paymentMethod', p_payment_method,
    'paymentStatus', 'PENDING',
    'promoCode', case when p_promo_code is not null and trim(p_promo_code) != '' then upper(trim(p_promo_code)) else null end,
    'notes', p_notes,
    'createdAt', v_created_at
  );

  update public.checkout_idempotency_keys
  set
    status = 'COMMITTED',
    order_id = v_order_id,
    response_payload = v_response_payload,
    expires_at = pg_catalog.now() + interval '7 days'
  where key_hash = p_key_hash;

  return v_response_payload;
end;
$$;

revoke all on function public.process_storefront_checkout(text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text) from public;
grant execute on function public.process_storefront_checkout(text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text) to service_role;

-- ------------------------------------------------------------------------------
-- 6. REWRITE: storefront_verify_razorpay_payment (SERVER-VERIFIED EVIDENCE & BINDING)
-- ------------------------------------------------------------------------------
-- Explicitly drop legacy overloads to prevent ambiguous function resolution or unhardened fallbacks
drop function if exists public.storefront_verify_razorpay_payment(text, text, text, text);
drop function if exists public.storefront_verify_razorpay_payment(text, text, text, text, bigint);
drop function if exists public.storefront_verify_razorpay_payment(text, text, text, text, bigint, text);

create or replace function public.storefront_verify_razorpay_payment(
  p_order_number text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_verified_amount_paise bigint,
  p_webhook_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_items jsonb;
begin
  if p_order_number is null or length(trim(p_order_number)) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'A valid order number is required for payment verification.'
    )::text;
  end if;

  select *
  into v_order
  from public.orders
  where order_number = upper(trim(p_order_number))
  for update;

  if not found then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_NOT_FOUND',
      'message', 'Order ' || p_order_number || ' was not found.'
    )::text;
  end if;

  -- 1. Ineligible order status check
  if v_order.status in ('CANCELLED', 'RETURNED', 'REFUNDED') then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_ALREADY_CANCELLED',
      'message', 'Cannot verify payment for a cancelled or refunded order.'
    )::text;
  end if;

  -- 2. Idempotent check for already paid orders
  if v_order.payment_status = 'PAID' then
    if v_order.razorpay_payment_id = p_razorpay_payment_id then
      -- Also ensure webhook event is marked PROCESSED if event ID was supplied
      if p_webhook_event_id is not null then
        insert into public.razorpay_webhook_events (
          event_id, event_type, order_number, payment_id, status, processed_at
        ) values (
          p_webhook_event_id, 'payment.captured', v_order.order_number, p_razorpay_payment_id, 'PROCESSED', timezone('utc'::text, now())
        )
        on conflict (event_id) do update
        set
          status = 'PROCESSED',
          order_number = excluded.order_number,
          payment_id = excluded.payment_id,
          lease_expires_at = null,
          error_message = null,
          processed_at = timezone('utc'::text, now());
      end if;

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'productId', oi.product_id,
            'serialNumber', oi.serial_number,
            'name', oi.name,
            'price', oi.price,
            'quantity', oi.quantity,
            'size', oi.size,
            'image', oi.image_url
          )
          order by oi.created_at asc
        ),
        '[]'::jsonb
      ) into v_items
      from public.order_items as oi
      where oi.order_id = v_order.id;

      return jsonb_build_object(
        'order', to_jsonb(v_order),
        'items', v_items
      );
    else
      raise exception '%', jsonb_build_object(
        'code', 'ORDER_ALREADY_PAID_DIFFERENT_PAYMENT',
        'message', 'Order is already marked PAID under a different payment reference.'
      )::text;
    end if;
  end if;

  -- 3. Razorpay order ID binding check
  if v_order.razorpay_order_id is not null and v_order.razorpay_order_id <> p_razorpay_order_id then
    raise exception '%', jsonb_build_object(
      'code', 'RAZORPAY_ORDER_ID_MISMATCH',
      'message', 'Payment provider order ID does not match the bound order reference.'
    )::text;
  end if;

  -- 4. Server-verified payment amount check (Safeguard 2: Mandatory server-verified payment amount - NULL is strictly rejected)
  if p_verified_amount_paise is null then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_AMOUNT_VERIFICATION_REQUIRED',
      'message', 'Payment verification requires server-verified amount in paise. Unverified or NULL amounts are rejected.'
    )::text;
  end if;

  if v_order.total_amount <> p_verified_amount_paise then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_AMOUNT_MISMATCH',
      'message', 'Verified payment amount (' || p_verified_amount_paise || ' paise) does not match internal order total (' || v_order.total_amount || ' paise).'
    )::text;
  end if;

  -- 5. Cross-order payment ID reuse check
  if exists (
    select 1
    from public.orders
    where razorpay_payment_id = p_razorpay_payment_id
      and id <> v_order.id
  ) then
    raise exception '%', jsonb_build_object(
      'code', 'DUPLICATE_PAYMENT_ID',
      'message', 'This payment ID has already been applied to another order.'
    )::text;
  end if;

  -- 6. Transition order to PAID and CONFIRMED
  update public.orders
  set
    payment_status = 'PAID',
    status = case when status = 'PENDING' then 'CONFIRMED' else status end,
    payment_id = p_razorpay_payment_id,
    razorpay_order_id = p_razorpay_order_id,
    razorpay_payment_id = p_razorpay_payment_id,
    razorpay_signature = p_razorpay_signature,
    updated_at = timezone('utc'::text, now())
  where id = v_order.id
  returning * into v_order;

  -- 7. ATOMIC WEBHOOK LEDGER FINALIZATION (Safeguard 3: Commits within the same PostgreSQL transaction)
  if p_webhook_event_id is not null then
    insert into public.razorpay_webhook_events (
      event_id, event_type, order_number, payment_id, status, processed_at
    ) values (
      p_webhook_event_id, 'payment.captured', v_order.order_number, p_razorpay_payment_id, 'PROCESSED', timezone('utc'::text, now())
    )
    on conflict (event_id) do update
    set
      status = 'PROCESSED',
      order_number = excluded.order_number,
      payment_id = excluded.payment_id,
      lease_expires_at = null,
      error_message = null,
      processed_at = timezone('utc'::text, now());
  end if;

  -- 8. Audit log insertion
  insert into public.activity_audit_logs (
    actor_id,
    actor_role,
    actor_email,
    table_name,
    record_id,
    action,
    before_state,
    after_state,
    diff
  )
  values (
    coalesce(v_order.customer_id::text, 'guest'),
    'system',
    v_order.customer_email,
    'orders',
    v_order.id::text,
    'ORDER_PAYMENT_VERIFIED',
    jsonb_build_object('payment_status', 'PENDING', 'status', 'PENDING'),
    jsonb_build_object('payment_status', 'PAID', 'status', v_order.status, 'payment_id', p_razorpay_payment_id),
    jsonb_build_object('razorpay_payment_id', p_razorpay_payment_id, 'razorpay_order_id', p_razorpay_order_id)
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'productId', oi.product_id,
        'serialNumber', oi.serial_number,
        'name', oi.name,
        'price', oi.price,
        'quantity', oi.quantity,
        'size', oi.size,
        'image', oi.image_url
      )
      order by oi.created_at asc
    ),
    '[]'::jsonb
  ) into v_items
  from public.order_items as oi
  where oi.order_id = v_order.id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', v_items
  );
end;
$$;

revoke all on function public.storefront_verify_razorpay_payment(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.storefront_verify_razorpay_payment(text, text, text, text, bigint, text) to service_role;

-- ------------------------------------------------------------------------------
-- 7. MIGRATION VERIFICATION ASSERTION: PRIVILEGES AND SIGNATURES
-- ------------------------------------------------------------------------------
do $$
declare
  v_overload_count integer;
  v_anon_allowed boolean;
begin
  -- Assert exactly ONE function named storefront_verify_razorpay_payment exists in public schema
  select count(*) into v_overload_count
  from pg_proc p
  join pg_namespace n on p.pronamespace = n.oid
  where n.nspname = 'public' and p.proname = 'storefront_verify_razorpay_payment';

  if v_overload_count <> 1 then
    raise exception 'MIGRATION_ASSERTION_FAILED: Expected exactly 1 definition for storefront_verify_razorpay_payment, found %', v_overload_count;
  end if;

  -- Assert execution privilege is NOT granted to anon or public
  select has_function_privilege('anon', 'public.storefront_verify_razorpay_payment(text, text, text, text, bigint, text)', 'EXECUTE')
  into v_anon_allowed;

  if v_anon_allowed then
    raise exception 'MIGRATION_ASSERTION_FAILED: anon role has EXECUTE privilege on storefront_verify_razorpay_payment';
  end if;
end $$;
