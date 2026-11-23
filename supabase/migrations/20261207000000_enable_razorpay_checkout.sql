-- ==============================================================================
-- Migration: 20261207000000_enable_razorpay_checkout.sql
-- Enables direct Razorpay online checkout, removes Cash on Delivery from storefront
-- checkout, and implements atomic payment verification and reservation cancellation RPCs.
-- ==============================================================================

-- 1. Ensure Razorpay columns and indexes exist on public.orders
alter table public.orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text;

create index if not exists idx_orders_razorpay_order_id on public.orders(razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists idx_orders_razorpay_payment_id on public.orders(razorpay_payment_id)
  where razorpay_payment_id is not null;

-- 2. Update process_storefront_checkout to disallow CASH_ON_DELIVERY and support RAZORPAY
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
  v_conflicting_idem record;
  v_claimed_idem record;
  v_order_number text;
  v_order_id uuid;
  v_order_inserted boolean := false;
  v_created_at timestamptz;
  v_whatsapp_number text;
  v_cleaned_whatsapp text;
  v_is_whatsapp_verified boolean;
  v_constraint_name text;
  v_attempt integer;
  v_item record;
  v_serial text;
  v_qty integer;
  v_item_size text;
  v_product record;
  v_missing_serial text;
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
    public.checkout_idempotency_keys.key_hash = p_key_hash
    and public.checkout_idempotency_keys.status in ('PENDING', 'FAILED')
  returning * into v_claimed_idem;

  if not found then
    select *
    into v_conflicting_idem
    from public.checkout_idempotency_keys
    where key_hash = p_key_hash;

    if found and v_conflicting_idem.status = 'COMMITTED' then
      if v_conflicting_idem.fingerprint <> p_fingerprint then
        raise exception '%', jsonb_build_object(
          'code', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
          'message', 'An idempotency key cannot be reused for a different checkout request payload.'
        )::text;
      end if;
      return v_conflicting_idem.response_payload;
    end if;

    if found and v_conflicting_idem.status = 'PROCESSING' and v_conflicting_idem.created_at > pg_catalog.now() - interval '60 seconds' then
      raise exception '%', jsonb_build_object(
        'code', 'CHECKOUT_ALREADY_IN_PROGRESS',
        'message', 'A checkout transaction with this idempotency key is currently processing. Please wait.'
      )::text;
    end if;

    raise exception '%', jsonb_build_object(
      'code', 'CHECKOUT_RESERVATION_FAILED',
      'message', 'Checkout reservation could not be acquired. Please retry.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 2. VALIDATE PAYMENT METHOD (Razorpay is the sole storefront checkout payment method)
  -- ----------------------------------------------------------------------------
  if p_payment_method = 'CASH_ON_DELIVERY' then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_METHOD_DISALLOWED',
      'message', 'Cash on Delivery is no longer available as a checkout option. Please pay securely with Razorpay.'
    )::text;
  elsif p_payment_method not in ('RAZORPAY', 'ONLINE_UPI', 'WHATSAPP_UPI') then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'Invalid payment method: must be RAZORPAY or ONLINE_UPI.'
    )::text;
  end if;

  if p_payment_method = 'WHATSAPP_UPI' then
    select whatsapp_number, is_whatsapp_verified
    into v_whatsapp_number, v_is_whatsapp_verified
    from public.site_settings
    limit 1;

    v_cleaned_whatsapp := pg_catalog.regexp_replace(coalesce(v_whatsapp_number, ''), '\D', '', 'g');

    if coalesce(v_is_whatsapp_verified, false) is not true or
       v_cleaned_whatsapp is null or
       not (v_cleaned_whatsapp ~ '^[1-9][0-9]{9,14}$') or
       v_cleaned_whatsapp in ('919876543210', '910000000000', '1234567890', '9876543210') or
       v_cleaned_whatsapp like '%000000%' then
      raise exception '%', jsonb_build_object(
        'code', 'PAYMENT_METHOD_UNAVAILABLE',
        'message', 'WhatsApp / UPI payment is temporarily unavailable because store contact details have not been verified.'
      )::text;
    end if;
  end if;

  -- ----------------------------------------------------------------------------
  -- 3. VALIDATE CUSTOMER & SHIPPING ADDRESS
  -- ----------------------------------------------------------------------------
  if p_customer is null or
     trim(coalesce(p_customer->>'name', '')) = '' or
     trim(coalesce(p_customer->>'email', '')) = '' or
     trim(coalesce(p_customer->>'phone', '')) = '' then
    raise exception '%', jsonb_build_object(
      'code', 'MISSING_CUSTOMER_INFO',
      'message', 'Customer name, email, and phone are required.'
    )::text;
  end if;

  if p_shipping_address is null or
     trim(coalesce(p_shipping_address->>'addressLine', '')) = '' or
     trim(coalesce(p_shipping_address->>'city', '')) = '' or
     trim(coalesce(p_shipping_address->>'state', '')) = '' or
     trim(coalesce(p_shipping_address->>'postalCode', '')) = '' then
    raise exception '%', jsonb_build_object(
      'code', 'INCOMPLETE_ADDRESS',
      'message', 'Complete delivery address (line, city, state, postal code) is required.'
    )::text;
  end if;

  if p_items is null or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'EMPTY_ORDER_ITEMS',
      'message', 'Order must contain at least one item.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 4. VALIDATE & RESERVE INVENTORY ATOMICALLY
  -- ----------------------------------------------------------------------------
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
      'image', case when pg_catalog.jsonb_array_length(v_product.images) > 0 then v_product.images->>0 else null end
    );
  end loop;

  -- ----------------------------------------------------------------------------
  -- 5. COUPON & PROMOTION EVALUATION
  -- ----------------------------------------------------------------------------
  if p_promo_code is not null and trim(p_promo_code) <> '' then
    select *
    into v_coupon
    from public.coupons
    where code = upper(trim(p_promo_code))
      and is_active = true
      and starts_at <= pg_catalog.now()
      and (expires_at is null or expires_at > pg_catalog.now())
    for update;

    if found then
      if (v_coupon.usage_limit is null or v_coupon.usage_count < v_coupon.usage_limit)
         and (v_coupon.min_order_amount is null or v_subtotal >= v_coupon.min_order_amount) then

        if p_customer_id is not null and v_coupon.per_customer_limit is not null and v_coupon.per_customer_limit > 0 then
          select count(*)
          into v_coupon_customer_usage
          from public.orders
          where customer_id = p_customer_id
            and promo_code = v_coupon.code
            and status <> 'CANCELLED';

          if v_coupon_customer_usage >= v_coupon.per_customer_limit then
            raise exception '%', jsonb_build_object(
              'code', 'COUPON_LIMIT_REACHED',
              'message', 'You have reached the maximum number of redemptions for promo code "' || v_coupon.code || '".'
            )::text;
          end if;
        end if;

        if v_coupon.discount_type = 'PERCENTAGE' then
          v_discount := (v_subtotal * v_coupon.discount_value) / 10000;
          if v_coupon.max_discount_amount is not null and v_discount > v_coupon.max_discount_amount then
            v_discount := v_coupon.max_discount_amount;
          end if;
        elsif v_coupon.discount_type = 'FIXED_AMOUNT' then
          v_discount := v_coupon.discount_value;
          if v_discount > v_subtotal then
            v_discount := v_subtotal;
          end if;
        end if;

        update public.coupons
        set
          usage_count = usage_count + 1,
          updated_at = pg_catalog.now()
        where id = v_coupon.id;
      end if;
    end if;
  end if;

  v_discounted_subtotal := v_subtotal - v_discount;
  if v_discounted_subtotal < 0 then
    v_discounted_subtotal := 0;
  end if;

  if v_discounted_subtotal >= 150000 then
    v_delivery_fee := 0;
  else
    v_delivery_fee := 9000;
  end if;

  v_total_amount := v_discounted_subtotal + v_delivery_fee;

  -- ----------------------------------------------------------------------------
  -- 6. GENERATE COLLISION-RESISTANT ORDER NUMBER & INSERT ORDER
  -- ----------------------------------------------------------------------------
  for v_attempt in 1..5 loop
    if p_order_number is not null and length(trim(p_order_number)) > 0 and v_attempt = 1 then
      v_order_number := upper(trim(p_order_number));
    else
      v_order_number := 'ORD-' || to_char(timezone('Asia/Kolkata', pg_catalog.now()), 'YYMMDD') || '-' ||
        upper(replace(gen_random_uuid()::text, '-', ''));
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
        case when p_payment_method in ('RAZORPAY', 'ONLINE_UPI') then 'PENDING' else 'CONFIRMED' end,
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
      if v_constraint_name = 'orders_order_number_key' then
        continue;
      else
        raise;
      end if;
    end;
  end loop;

  if not v_order_inserted then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_NUMBER_GENERATION_FAILED',
      'message', 'Failed to allocate unique order number after multiple attempts.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 7. INSERT ORDER ITEMS
  -- ----------------------------------------------------------------------------
  for v_item in
    select
      (value->>'productId')::uuid as product_id,
      value->>'serialNumber' as serial_number,
      value->>'name' as name,
      (value->>'price')::bigint as price,
      (value->>'quantity')::integer as quantity,
      value->>'size' as size,
      value->>'image' as image_url,
      value->>'slug' as slug
    from pg_catalog.jsonb_array_elements(v_items_json)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      serial_number,
      name,
      price,
      quantity,
      size,
      image_url,
      created_at
    )
    values (
      v_order_id,
      v_item.product_id,
      v_item.serial_number,
      v_item.name,
      v_item.price,
      v_item.quantity,
      v_item.size,
      v_item.image_url,
      pg_catalog.now()
    );
  end loop;

  -- ----------------------------------------------------------------------------
  -- 8. CONSTRUCT AUTHORITATIVE ORDER RESPONSE PAYLOAD
  -- ----------------------------------------------------------------------------
  v_response_payload := jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'customerId', p_customer_id,
    'customer', jsonb_build_object(
      'name', trim(p_customer->>'name'),
      'email', lower(trim(p_customer->>'email')),
      'phone', trim(p_customer->>'phone')
    ),
    'shippingAddress', p_shipping_address,
    'items', v_items_json,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'deliveryFee', v_delivery_fee,
    'totalAmount', v_total_amount,
    'status', case when p_payment_method in ('RAZORPAY', 'ONLINE_UPI') then 'PENDING' else 'CONFIRMED' end,
    'paymentMethod', p_payment_method,
    'paymentStatus', 'PENDING',
    'promoCode', case when p_promo_code is not null and trim(p_promo_code) != '' then upper(trim(p_promo_code)) else null end,
    'notes', p_notes,
    'createdAt', v_created_at
  );

  -- ----------------------------------------------------------------------------
  -- 9. COMMIT IDEMPOTENCY RECORD
  -- ----------------------------------------------------------------------------
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

-- 3. Create RPC public.storefront_verify_razorpay_payment
create or replace function public.storefront_verify_razorpay_payment(
  p_order_number text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text
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

  -- Idempotent return if already marked PAID
  if v_order.payment_status = 'PAID' then
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
  end if;

  if v_order.status = 'CANCELLED' then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_ALREADY_CANCELLED',
      'message', 'Cannot verify payment for a cancelled order.'
    )::text;
  end if;

  -- Update order to PAID and advance to CONFIRMED
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

  -- Append audit log
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
    'CUSTOMER',
    v_order.customer_email,
    'orders',
    v_order.id::text,
    'PAYMENT_VERIFIED',
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

revoke all on function public.storefront_verify_razorpay_payment(text, text, text, text) from public;
grant execute on function public.storefront_verify_razorpay_payment(text, text, text, text) to service_role;

-- 4. Create RPC public.storefront_cancel_pending_order to release inventory cleanly
create or replace function public.storefront_cancel_pending_order(
  p_order_number text,
  p_reason text default 'Checkout dismissed or payment failed'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
  v_product_id uuid;
begin
  if p_order_number is null or length(trim(p_order_number)) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'A valid order number is required.'
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

  -- Idempotent return if already CANCELLED
  if v_order.status = 'CANCELLED' then
    return true;
  end if;

  if v_order.payment_status = 'PAID' then
    raise exception '%', jsonb_build_object(
      'code', 'CANNOT_CANCEL_PAID_ORDER',
      'message', 'Paid orders cannot be automatically cancelled via storefront dismissal.'
    )::text;
  end if;

  -- Restore stock for each item in the order
  for v_item in
    select oi.serial_number, sum(oi.quantity)::integer as quantity
    from public.order_items as oi
    where oi.order_id = v_order.id
    group by oi.serial_number
  loop
    select p.id into v_product_id
    from public.products as p
    where p.serial_number = v_item.serial_number
    for update;

    if found then
      update public.products
      set
        stock = stock + v_item.quantity,
        status = case
          when status = 'SOLD_OUT' then 'ACTIVE'
          else status
        end,
        updated_at = timezone('utc'::text, now())
      where id = v_product_id;
    end if;
  end loop;

  -- Mark order cancelled with note
  update public.orders
  set
    status = 'CANCELLED',
    notes = coalesce(notes, '') || ' | ' || coalesce(p_reason, 'Checkout dismissed'),
    updated_at = timezone('utc'::text, now())
  where id = v_order.id;

  -- Audit log
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
    'CUSTOMER',
    v_order.customer_email,
    'orders',
    v_order.id::text,
    'ORDER_RESERVATION_CANCELLED',
    jsonb_build_object('status', v_order.status, 'payment_status', v_order.payment_status),
    jsonb_build_object('status', 'CANCELLED', 'payment_status', v_order.payment_status),
    jsonb_build_object('reason', p_reason)
  );

  return true;
end;
$$;

revoke all on function public.storefront_cancel_pending_order(text, text) from public;
grant execute on function public.storefront_cancel_pending_order(text, text) to service_role;
