-- =============================================================================
-- CircleUp: Customer-Specific Coupons, Redemption History & Announcement Bar
-- =============================================================================
-- Additive migration. Do NOT run destructively; safe to re-run (idempotent DDL).
-- =============================================================================

-- 1. Extend public.coupons with customer-specific assignment & issue reason
alter table public.coupons
  add column if not exists assigned_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists assigned_customer_email text,
  add column if not exists issue_reason text;

create index if not exists idx_coupons_assigned_customer_id
  on public.coupons (assigned_customer_id)
  where assigned_customer_id is not null;

create index if not exists idx_coupons_assigned_customer_email
  on public.coupons (lower(assigned_customer_email))
  where assigned_customer_email is not null;

-- 2. Extend public.site_settings with optional coupon-linked announcement bar & schedule
alter table public.site_settings
  add column if not exists announcement_coupon_code text not null default '',
  add column if not exists announcement_starts_at timestamptz,
  add column if not exists announcement_ends_at timestamptz;

-- 3. Create public.coupon_redemptions for auditable redemption history
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid references public.coupons(id) on delete set null,
  coupon_code text not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_email text,
  customer_name text,
  discount_paise integer not null check (discount_paise >= 0),
  order_total_paise integer not null check (order_total_paise >= 0),
  redeemed_at timestamptz not null default now()
);

create unique index if not exists idx_coupon_redemptions_order_code_unique
  on public.coupon_redemptions (order_id, upper(coupon_code));

create index if not exists idx_coupon_redemptions_coupon_id_redeemed_at
  on public.coupon_redemptions (coupon_id, redeemed_at desc);

create index if not exists idx_coupon_redemptions_redeemed_at
  on public.coupon_redemptions (redeemed_at desc);

alter table public.coupon_redemptions enable row level security;

-- Revoke direct client access; backend service_role reads/writes exclusively.
revoke all on table public.coupon_redemptions from anon, authenticated;

-- 4. Update process_storefront_checkout to enforce customer restrictions,
--    product applicability, and record coupon_redemptions atomically.
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
  v_claimed_status text;
  v_idem_claimed boolean := false;
  v_idem_attempt integer := 0;
  v_order_number text;
  v_order_id uuid;
  v_order_inserted boolean := false;
  v_created_at timestamptz;
  v_constraint_name text;
  v_attempt integer;
  v_item record;
  v_agg record;
  v_serial text;
  v_qty integer;
  v_item_size text;
  v_product record;
  v_product_map jsonb := '{}'::jsonb;
  v_subtotal bigint := 0;
  v_eligible_subtotal bigint := 0;
  v_discount bigint := 0;
  v_delivery_fee bigint := 0;
  v_total_amount bigint := 0;
  v_discounted_subtotal bigint := 0;
  v_coupon record;
  v_coupon_applied boolean := false;
  v_coupon_customer_usage bigint := 0;
  v_new_stock integer;
  v_new_status text;
  v_items_json jsonb := '[]'::jsonb;
  v_response_payload jsonb;
begin
  -- 0. VALIDATE & ATOMICALLY CLAIM IDEMPOTENCY KEY
  if p_key_hash is null or length(trim(p_key_hash)) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'IDEMPOTENCY_KEY_REQUIRED',
      'message', 'A valid Idempotency-Key header is required.'
    )::text;
  end if;

  while v_idem_attempt < 3 loop
    v_idem_attempt := v_idem_attempt + 1;

    insert into public.checkout_idempotency_keys (
      key_hash, fingerprint, status, customer_id, order_id, created_at, expires_at
    )
    values (
      p_key_hash, p_fingerprint, 'PROCESSING', p_customer_id, null,
      pg_catalog.now(), pg_catalog.now() + interval '24 hours'
    )
    on conflict (key_hash) do update
    set
      status = 'PROCESSING',
      expires_at = pg_catalog.now() + interval '24 hours'
    where
      public.checkout_idempotency_keys.key_hash = p_key_hash
      and public.checkout_idempotency_keys.fingerprint = p_fingerprint
      and public.checkout_idempotency_keys.status in ('PENDING', 'FAILED')
    returning status into v_claimed_status;

    if found then
      v_idem_claimed := true;
      exit;
    end if;

    select *
    into v_existing_idem
    from public.checkout_idempotency_keys
    where key_hash = p_key_hash
    for update;

    if not found then
      continue;
    end if;

    if v_existing_idem.fingerprint <> p_fingerprint then
      raise exception '%', jsonb_build_object(
        'code', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        'message', 'An idempotency key cannot be reused for a different checkout request payload.'
      )::text;
    end if;

    if v_existing_idem.status = 'COMMITTED' then
      return v_existing_idem.response_payload;
    end if;

    if v_existing_idem.status = 'PROCESSING' then
      raise exception '%', jsonb_build_object(
        'code', 'IDEMPOTENCY_KEY_IN_PROGRESS',
        'message', 'A checkout request with this idempotency key is already in progress.'
      )::text;
    end if;

    update public.checkout_idempotency_keys
    set
      status = 'PROCESSING',
      expires_at = pg_catalog.now() + interval '24 hours'
    where key_hash = p_key_hash
      and fingerprint = p_fingerprint
      and status in ('PENDING', 'FAILED')
    returning status into v_claimed_status;

    if found then
      v_idem_claimed := true;
      exit;
    end if;
  end loop;

  if not v_idem_claimed then
    raise exception '%', jsonb_build_object(
      'code', 'IDEMPOTENCY_KEY_CLAIM_FAILED',
      'message', 'Unable to claim checkout idempotency key. Please retry.'
    )::text;
  end if;

  -- 1. VALIDATE PAYMENT METHOD
  if p_payment_method in ('COD', 'CASH_ON_DELIVERY') then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_METHOD_DISALLOWED',
      'message', 'Cash on Delivery is no longer available. Please use online checkout.'
    )::text;
  end if;

  if p_payment_method not in ('RAZORPAY', 'ONLINE_UPI', 'WHATSAPP_UPI') then
    raise exception '%', jsonb_build_object(
      'code', 'INVALID_PAYMENT_METHOD',
      'message', 'Unsupported payment method: ' || coalesce(p_payment_method, 'null')
    )::text;
  end if;

  -- 2. VALIDATE CUSTOMER & ITEMS INPUT
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

  -- 3. VALIDATE EACH ITEM LINE
  for v_item in
    select
      upper(trim(value->>'serialNumber')) as serial_number,
      coalesce((value->>'quantity')::integer, 1) as quantity,
      trim(coalesce(value->>'size', '')) as size
    from pg_catalog.jsonb_array_elements(p_items)
  loop
    if v_item.serial_number is null or length(v_item.serial_number) = 0 or v_item.quantity <= 0 or v_item.quantity > 10 then
      raise exception '%', jsonb_build_object(
        'code', 'INVALID_ORDER_ITEM',
        'message', 'Each item must have a valid serialNumber and quantity between 1 and 10.'
      )::text;
    end if;
  end loop;

  -- 4. AGGREGATE DUPLICATE SERIAL NUMBERS & RESERVE INVENTORY IN SORTED LOCK ORDER
  for v_agg in
    select
      upper(trim(value->>'serialNumber')) as serial_number,
      sum(coalesce((value->>'quantity')::integer, 1))::integer as total_quantity
    from pg_catalog.jsonb_array_elements(p_items)
    group by upper(trim(value->>'serialNumber'))
    order by upper(trim(value->>'serialNumber')) asc
  loop
    v_serial := v_agg.serial_number;
    v_qty := v_agg.total_quantity;

    if v_qty <= 0 or v_qty > 10 then
      raise exception '%', jsonb_build_object(
        'code', 'INVALID_ORDER_ITEM',
        'message', 'Total quantity for product "' || v_serial || '" must be between 1 and 10.'
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

    if v_product.status not in ('ACTIVE', 'AVAILABLE', 'PUBLISHED') or v_product.stock < v_qty then
      raise exception '%', jsonb_build_object(
        'code', 'OUT_OF_STOCK',
        'message', 'Item "' || v_product.name || '" (' || v_serial || ') is no longer available in the requested quantity.'
      )::text;
    end if;

    v_new_stock := v_product.stock - v_qty;
    v_new_status := case when v_new_stock = 0 then 'SOLD_OUT' else v_product.status end;

    update public.products
    set
      stock = v_new_stock,
      status = v_new_status,
      updated_at = pg_catalog.now()
    where id = v_product.id;

    v_product_map := v_product_map || pg_catalog.jsonb_build_object(
      v_serial,
      pg_catalog.jsonb_build_object(
        'id', v_product.id,
        'serialNumber', v_product.serial_number,
        'name', v_product.name,
        'price', v_product.price,
        'image', case
          when v_product.images is not null and pg_catalog.array_length(v_product.images, 1) > 0
          then v_product.images[1]
          else ''
        end
      )
    );
  end loop;

  -- Build itemized order lines from locked product snapshots
  for v_item in
    select
      upper(trim(value->>'serialNumber')) as serial_number,
      coalesce((value->>'quantity')::integer, 1) as quantity,
      trim(coalesce(value->>'size', '')) as size
    from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_serial := v_item.serial_number;
    v_qty := v_item.quantity;
    v_item_size := v_item.size;

    v_subtotal := v_subtotal + (((v_product_map->v_serial->>'price')::bigint) * v_qty);
    v_items_json := v_items_json || pg_catalog.jsonb_build_object(
      'productId', v_product_map->v_serial->>'id',
      'serialNumber', v_product_map->v_serial->>'serialNumber',
      'name', v_product_map->v_serial->>'name',
      'price', (v_product_map->v_serial->>'price')::bigint,
      'quantity', v_qty,
      'size', case when v_item_size != '' then v_item_size else 'One Size' end,
      'image', v_product_map->v_serial->>'image'
    );
  end loop;

  -- 5. COUPON VALIDATION (CUSTOMER RESTRICTION, SCHEDULE, LIMITS, APPLICABILITY) & DISCOUNT CALCULATION
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

    if v_coupon.assigned_customer_id is not null then
      if p_customer_id is null or p_customer_id <> v_coupon.assigned_customer_id then
        raise exception '%', jsonb_build_object(
          'code', 'COUPON_NOT_ELIGIBLE',
          'message', 'Coupon "' || v_coupon.code || '" is restricted to a specific customer account.'
        )::text;
      end if;
    end if;

    if v_coupon.assigned_customer_email is not null and length(trim(v_coupon.assigned_customer_email)) > 0 then
      if lower(trim(p_customer->>'email')) <> lower(trim(v_coupon.assigned_customer_email)) then
        raise exception '%', jsonb_build_object(
          'code', 'COUPON_NOT_ELIGIBLE',
          'message', 'Coupon "' || v_coupon.code || '" is restricted to a specific customer account.'
        )::text;
      end if;
    end if;

    if v_coupon.starts_at is not null and v_coupon.starts_at > pg_catalog.now() then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_NOT_ACTIVE',
        'message', 'Coupon "' || v_coupon.code || '" is not yet active.'
      )::text;
    end if;

    if v_coupon.ends_at is not null and v_coupon.ends_at < pg_catalog.now() then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_EXPIRED',
        'message', 'Coupon "' || v_coupon.code || '" has expired.'
      )::text;
    end if;

    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_MAX_USES_REACHED',
        'message', 'Coupon "' || v_coupon.code || '" has reached its maximum global usage limit.'
      )::text;
    end if;

    if v_coupon.per_customer_limit is not null then
      select count(*)
      into v_coupon_customer_usage
      from public.orders as prior_order
      where upper(trim(prior_order.promo_code)) = upper(trim(v_coupon.code))
        and prior_order.status <> 'CANCELLED'
        and (
          (p_customer_id is not null and prior_order.customer_id = p_customer_id)
          or lower(trim(prior_order.customer_email)) = lower(trim(p_customer->>'email'))
        );

      if v_coupon_customer_usage >= v_coupon.per_customer_limit then
        raise exception '%', jsonb_build_object(
          'code', 'COUPON_CUSTOMER_LIMIT_REACHED',
          'message', 'Coupon "' || v_coupon.code || '" has reached its per-customer usage limit.'
        )::text;
      end if;
    end if;

    if v_coupon.min_order_paise is not null and v_subtotal < v_coupon.min_order_paise then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_MIN_ORDER_UNMET',
        'message', 'Coupon "' || v_coupon.code || '" requires a minimum order subtotal of ₹' || (v_coupon.min_order_paise / 100)::text || '.'
      )::text;
    end if;

    v_eligible_subtotal := v_subtotal;
    if v_coupon.applies_to = 'SPECIFIC_PRODUCTS' then
      if v_coupon.applicable_product_ids is null or coalesce(pg_catalog.array_length(v_coupon.applicable_product_ids, 1), 0) = 0 then
        raise exception '%', jsonb_build_object(
          'code', 'COUPON_NOT_APPLICABLE',
          'message', 'Coupon "' || v_coupon.code || '" has no eligible products configured.'
        )::text;
      end if;

      select coalesce(sum(((elem->>'price')::bigint) * ((elem->>'quantity')::integer)), 0)
      into v_eligible_subtotal
      from pg_catalog.jsonb_array_elements(v_items_json) as elem
      where (elem->>'productId') = any(v_coupon.applicable_product_ids);

      if v_eligible_subtotal <= 0 then
        raise exception '%', jsonb_build_object(
          'code', 'COUPON_NOT_APPLICABLE',
          'message', 'Coupon "' || v_coupon.code || '" does not apply to the items in your bag.'
        )::text;
      end if;
    elsif v_coupon.applies_to is not null and v_coupon.applies_to <> 'ALL' then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_UNSUPPORTED_SCOPE',
        'message', 'Coupon "' || v_coupon.code || '" uses an unsupported applicability scope (' || v_coupon.applies_to || ').'
      )::text;
    end if;

    if v_coupon.discount_type = 'PERCENTAGE' then
      -- Match couponService.validateCoupon integer truncation division
      v_discount := (v_eligible_subtotal * v_coupon.discount_value) / 100;
      if v_coupon.max_discount_paise is not null and v_discount > v_coupon.max_discount_paise then
        v_discount := v_coupon.max_discount_paise;
      end if;
    elsif v_coupon.discount_type = 'FLAT' then
      v_discount := v_coupon.discount_value;
    else
      raise exception '%', jsonb_build_object(
        'code', 'UNSUPPORTED_COUPON_TYPE',
        'message', 'Discount type ' || v_coupon.discount_type || ' is not supported.'
      )::text;
    end if;

    if v_discount > v_eligible_subtotal then
      v_discount := v_eligible_subtotal;
    end if;
    if v_discount > v_subtotal then
      v_discount := v_subtotal;
    end if;

    update public.coupons
    set usage_count = usage_count + 1
    where code = v_coupon.code;

    v_coupon_applied := true;
  end if;

  -- 6. SHIPPING & FINAL TOTALS
  v_discounted_subtotal := v_subtotal - v_discount;
  v_delivery_fee := public.calculate_storefront_delivery_fee(
    v_discounted_subtotal,
    pg_catalog.jsonb_array_length(p_items)
  );
  v_total_amount := v_discounted_subtotal + v_delivery_fee;

  -- 7. INSERT ORDER WITH RETRY LOOP ON COLLISION
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
        order_number, customer_id, customer_name, customer_email, customer_phone,
        total_amount, subtotal, discount_amount, shipping_amount, status, payment_status,
        payment_method, shipping_address, promo_code, notes,
        guest_access_token_hash, guest_access_expires_at, created_at, updated_at
      )
      values (
        v_order_number, p_customer_id, trim(p_customer->>'name'), lower(trim(p_customer->>'email')),
        trim(p_customer->>'phone'), v_total_amount, v_subtotal, v_discount, v_delivery_fee,
        'PENDING', 'PENDING', p_payment_method, p_shipping_address,
        case when p_promo_code is not null and trim(p_promo_code) != '' then upper(trim(p_promo_code)) else null end,
        p_notes, p_guest_access_token_hash, p_guest_access_expires_at, pg_catalog.now(), pg_catalog.now()
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

  -- 8. INSERT ORDER ITEMS
  for v_item in select * from pg_catalog.jsonb_array_elements(v_items_json) loop
    insert into public.order_items (
      order_id, product_id, serial_number, name, price, quantity, size, image_url
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

  -- 8b. RECORD COUPON REDEMPTION AUDIT ENTRY
  if v_coupon_applied then
    insert into public.coupon_redemptions (
      coupon_id, coupon_code, order_id, order_number,
      customer_id, customer_email, customer_name,
      discount_paise, order_total_paise, redeemed_at
    )
    values (
      v_coupon.id, v_coupon.code, v_order_id, v_order_number,
      p_customer_id, lower(trim(p_customer->>'email')), trim(p_customer->>'name'),
      v_discount::integer, v_total_amount::integer, pg_catalog.now()
    )
    on conflict (order_id, upper(coupon_code)) do nothing;
  end if;

  -- 9. ASSEMBLE RESPONSE & COMMIT IDEMPOTENCY
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
