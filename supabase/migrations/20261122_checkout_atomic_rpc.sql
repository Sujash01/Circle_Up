-- ==============================================================================
-- CircleUp Supabase Migration: Atomic Storefront Checkout RPC
-- Milestone 1, Step 2: public.process_storefront_checkout (Hardened & Revised)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. SCHEMA PREREQUISITES
-- Ensure public.site_settings has is_whatsapp_verified column to enforce explicit
-- store-verified configuration before WhatsApp / UPI checkout can be enabled.
-- ------------------------------------------------------------------------------
alter table public.site_settings
  add column if not exists is_whatsapp_verified boolean not null default false;

-- ------------------------------------------------------------------------------
-- Function: public.process_storefront_checkout
-- Executes the entire checkout flow in a single atomic PostgreSQL transaction:
--  1. Validates and claims the idempotency key with request fingerprint.
--  2. Locks product rows (SELECT ... FOR UPDATE) in deterministic sort order to prevent deadlocks.
--  3. Validates product status ('AVAILABLE', 'ACTIVE', 'PUBLISHED'), non-negative price, and stock.
--  4. Validates requested size/variant against product's actual available sizes; rejects invalid variants.
--  5. Validates WhatsApp configuration against explicit store-verified state and placeholder contacts.
--  6. Validates and locks coupon row; calculates discount using numeric precision (PERCENTAGE/FLAT);
--     rejects unsupported coupon types (FREE_SHIPPING, BOGO) before usage increments.
--  7. Calculates delivery fee and order total using canonical paise (1 INR = 100 paise).
--  8. Decrements product stock exactly once; updates status to 'SOLD_OUT' if stock reaches 0.
--  9. Inserts public.orders with collision-resistant order number (ORD-YYMMDD-XXXXXXXX) and retry loop.
-- 10. Inserts public.order_items with verified size, image, and slug.
-- 11. Updates idempotency reservation with sanitized response payload (24h TTL).
-- 12. Guarantees ZERO plaintext guest access tokens in database or cached response_payload.
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
  v_new_stock integer;
  v_new_status text;
  v_items_json jsonb := '[]'::jsonb;
  v_response_payload jsonb;
  v_loop_count integer := 0;
  v_retry_insert boolean := true;
  v_serials text[] := array[]::text[];
  v_quantities jsonb := '{}'::jsonb;
  v_variant_match boolean;
  v_var record;
begin
  -- ----------------------------------------------------------------------------
  -- 1. INPUT SANITIZATION & IDEMPOTENCY KEY CHECK
  -- ----------------------------------------------------------------------------
  if p_key_hash is null or length(p_key_hash) != 64 then
    raise exception '%', jsonb_build_object(
      'code', 'IDEMPOTENCY_KEY_REQUIRED',
      'message', 'A valid 64-character SHA-256 idempotency key hash is required.'
    )::text;
  end if;

  if p_fingerprint is null or length(p_fingerprint) != 64 then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'A valid 64-character SHA-256 request fingerprint is required.'
    )::text;
  end if;

  -- Bounded retry loop for idempotency claim (handles races with background cleanup)
  while v_retry_insert and v_loop_count < 3 loop
    v_loop_count := v_loop_count + 1;
    v_retry_insert := false;

    select * into v_existing_idem
    from public.checkout_idempotency
    where key_hash = p_key_hash;

    if found then
      if v_existing_idem.expires_at > pg_catalog.now() then
        if v_existing_idem.fingerprint != p_fingerprint then
          raise exception '%', jsonb_build_object(
            'code', 'IDEMPOTENCY_KEY_REUSED',
            'message', 'This idempotency key was already used for a different checkout.'
          )::text;
        end if;

        if v_existing_idem.response_payload is not null then
          return v_existing_idem.response_payload;
        else
          raise exception '%', jsonb_build_object(
            'code', 'CHECKOUT_IN_PROGRESS',
            'message', 'Checkout with this key is already being processed. Retry shortly.'
          )::text;
        end if;
      else
        delete from public.checkout_idempotency
        where key_hash = p_key_hash
          and expires_at <= pg_catalog.now();
      end if;
    end if;

    -- Collision-resistant order number: ORD-YYMMDD-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (122 bits of CSPRNG entropy)
    -- Uses full unhyphenated pg_catalog.gen_random_uuid() to guarantee 100% resolution under empty search_path
    -- without external extension dependencies (pgcrypto or uuid-ossp).
    v_order_number := coalesce(
      nullif(trim(p_order_number), ''),
      'ORD-' ||
        pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' ||
        pg_catalog.upper(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''))
    );

    insert into public.checkout_idempotency (
      key_hash,
      fingerprint,
      order_number,
      response_payload,
      expires_at
    )
    values (
      p_key_hash,
      p_fingerprint,
      v_order_number,
      null,
      pg_catalog.now() + interval '5 minutes'
    )
    on conflict (key_hash) do nothing
    returning * into v_claimed_idem;

    if v_claimed_idem.id is null then
      select * into v_conflicting_idem
      from public.checkout_idempotency
      where key_hash = p_key_hash
      for update;

      if not found then
        v_retry_insert := true;
      else
        if v_conflicting_idem.expires_at > pg_catalog.now() then
          if v_conflicting_idem.fingerprint != p_fingerprint then
            raise exception '%', jsonb_build_object(
              'code', 'IDEMPOTENCY_KEY_REUSED',
              'message', 'This idempotency key was already used for a different checkout.'
            )::text;
          elsif v_conflicting_idem.response_payload is not null then
            return v_conflicting_idem.response_payload;
          else
            raise exception '%', jsonb_build_object(
              'code', 'CHECKOUT_IN_PROGRESS',
              'message', 'Checkout with this key is already being processed. Retry shortly.'
            )::text;
          end if;
        else
          delete from public.checkout_idempotency
          where key_hash = p_key_hash;
          v_retry_insert := true;
        end if;
      end if;
    end if;
  end loop;

  if v_claimed_idem.id is null and v_response_payload is null then
    raise exception '%', jsonb_build_object(
      'code', 'CHECKOUT_IN_PROGRESS',
      'message', 'Checkout reservation could not be acquired. Please retry.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 2. VALIDATE PAYMENT METHOD & WHATSAPP CONFIGURATION
  -- ----------------------------------------------------------------------------
  if p_payment_method = 'ONLINE_UPI' then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_PROVIDER_UNAVAILABLE',
      'message', 'Online payment is temporarily unavailable. Please try again later.'
    )::text;
  elsif p_payment_method not in ('CASH_ON_DELIVERY', 'WHATSAPP_UPI') then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'Invalid payment method: must be CASH_ON_DELIVERY or WHATSAPP_UPI.'
    )::text;
  end if;

  if p_payment_method = 'WHATSAPP_UPI' then
    select whatsapp_number, is_whatsapp_verified
    into v_whatsapp_number, v_is_whatsapp_verified
    from public.site_settings
    limit 1;

    v_cleaned_whatsapp := pg_catalog.regexp_replace(coalesce(v_whatsapp_number, ''), '\D', '', 'g');

    -- WhatsApp checkout requires an explicit store-verified configuration.
    -- Syntactic validity or absence of blacklisted numbers is NOT sufficient proof of store ownership.
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

  -- ----------------------------------------------------------------------------
  -- 4. PARSE & AGGREGATE ITEMS
  -- ----------------------------------------------------------------------------
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'EMPTY_ORDER_ITEMS',
      'message', 'Order must contain at least one item.'
    )::text;
  end if;

  for v_item in select * from jsonb_to_recordset(p_items) as x("serialNumber" text, "quantity" integer, "size" text) loop
    v_serial := upper(trim(coalesce(v_item."serialNumber", '')));
    v_qty := coalesce(v_item."quantity", 0);

    if v_serial = '' then
      raise exception '%', jsonb_build_object(
        'code', 'VALIDATION_ERROR',
        'message', 'Item serial number is required.'
      )::text;
    end if;

    if v_qty <= 0 or v_qty > 10 then
      raise exception '%', jsonb_build_object(
        'code', 'INVALID_QUANTITY',
        'message', 'Quantity must be between 1 and 10 per item.'
      )::text;
    end if;

    if not (v_serials @> array[v_serial]) then
      v_serials := array_append(v_serials, v_serial);
      v_quantities := v_quantities || jsonb_build_object(v_serial, v_qty);
    else
      v_qty := (v_quantities->>v_serial)::integer + v_qty;
      if v_qty > 10 then
        raise exception '%', jsonb_build_object(
          'code', 'INVALID_QUANTITY',
          'message', 'Maximum quantity per product is 10.'
        )::text;
      end if;
      v_quantities := v_quantities || jsonb_build_object(v_serial, v_qty);
    end if;
  end loop;

  -- ----------------------------------------------------------------------------
  -- 5. LOCK PRODUCT ROWS IN DETERMINISTIC SORT ORDER & VALIDATE VARIANTS
  -- ----------------------------------------------------------------------------
  for v_product in
    select p.*
    from public.products p
    where upper(trim(p.serial_number)) = any(v_serials)
    order by p.serial_number asc
    for update
  loop
    v_serial := upper(trim(v_product.serial_number));
    v_qty := (v_quantities->>v_serial)::integer;

    -- Stock exhaustion check takes priority so items decremented to 0 report OUT_OF_STOCK
    if v_product.stock is null or v_product.stock < v_qty then
      raise exception '%', jsonb_build_object(
        'code', 'OUT_OF_STOCK',
        'message', 'Insufficient stock for "' || v_product.serial_number || '".'
      )::text;
    end if;

    if v_product.status not in ('AVAILABLE', 'ACTIVE', 'PUBLISHED') then
      raise exception '%', jsonb_build_object(
        'code', 'PRODUCT_NOT_ORDERABLE',
        'message', 'Product "' || v_product.serial_number || '" is not available to order.'
      )::text;
    end if;

    if v_product.price is null or v_product.price < 0 or v_product.price > 1000000000 then
      raise exception '%', jsonb_build_object(
        'code', 'INVALID_PRODUCT_PRICE',
        'message', 'Product "' || v_product.serial_number || '" has an invalid stored price.'
      )::text;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  if (
    select count(*)
    from public.products p
    where upper(trim(p.serial_number)) = any(v_serials)
  ) < array_length(v_serials, 1) then
    select s into v_missing_serial
    from unnest(v_serials) s
    where not exists (
      select 1 from public.products p where upper(trim(p.serial_number)) = s
    )
    limit 1;

    raise exception '%', jsonb_build_object(
      'code', 'PRODUCT_NOT_ORDERABLE',
      'message', 'Product "' || coalesce(v_missing_serial, 'UNKNOWN') || '" is not available to order.'
    )::text;
  end if;

  -- Validate sizes/variants for each requested item
  for v_item in select * from jsonb_to_recordset(p_items) as x("serialNumber" text, "quantity" integer, "size" text) loop
    v_serial := upper(trim(v_item."serialNumber"));
    v_item_size := trim(coalesce(v_item."size", ''));

    select * into v_product
    from public.products
    where upper(trim(serial_number)) = v_serial;

    -- If product defines available sizes:
    if array_length(v_product.sizes, 1) > 0 then
      if v_item_size = '' then
        -- If single size option exists, default to it
        if array_length(v_product.sizes, 1) = 1 then
          v_item_size := v_product.sizes[1];
        else
          raise exception '%', jsonb_build_object(
            'code', 'INVALID_VARIANT',
            'message', 'Size is required for product "' || v_product.serial_number || '". Available: ' || array_to_string(v_product.sizes, ', ') || '.'
          )::text;
        end if;
      elsif not (v_product.sizes @> array[v_item_size]) then
        -- Check if size exists in variants jsonb
        v_variant_match := false;
        if jsonb_array_length(v_product.variants) > 0 then
          for v_var in select * from jsonb_to_recordset(v_product.variants) as z("size" text, "label" text) loop
            if upper(trim(coalesce(v_var."size", ''))) = upper(v_item_size) or upper(trim(coalesce(v_var."label", ''))) = upper(v_item_size) then
              v_variant_match := true;
              exit;
            end if;
          end loop;
        end if;

        if not v_variant_match then
          raise exception '%', jsonb_build_object(
            'code', 'INVALID_VARIANT',
            'message', 'Size "' || v_item_size || '" is not available for product "' || v_product.serial_number || '". Available sizes: ' || array_to_string(v_product.sizes, ', ') || '.'
          )::text;
        end if;
      end if;
    elsif jsonb_array_length(v_product.variants) > 0 then
      -- Product uses variants jsonb exclusively
      v_variant_match := false;
      for v_var in select * from jsonb_to_recordset(v_product.variants) as z("size" text, "label" text) loop
        if v_item_size != '' and (upper(trim(coalesce(v_var."size", ''))) = upper(v_item_size) or upper(trim(coalesce(v_var."label", ''))) = upper(v_item_size)) then
          v_variant_match := true;
          exit;
        end if;
      end loop;

      if v_item_size != '' and not v_variant_match then
        raise exception '%', jsonb_build_object(
          'code', 'INVALID_VARIANT',
          'message', 'Variant "' || v_item_size || '" is not available for product "' || v_product.serial_number || '".'
        )::text;
      end if;
    end if;
  end loop;

  if v_subtotal < 0 or v_subtotal > 10000000000 then
    raise exception '%', jsonb_build_object(
      'code', 'INVALID_ORDER_TOTAL',
      'message', 'Order subtotal exceeds supported currency range.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 6. VALIDATE & LOCK COUPON (REJECT UNSUPPORTED TYPES EXPLICITLY)
  -- ----------------------------------------------------------------------------
  if p_promo_code is not null and trim(p_promo_code) != '' then
    select * into v_coupon
    from public.coupons
    where upper(trim(code)) = upper(trim(p_promo_code))
    for update;

    if not found or not v_coupon.is_active then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_REQUIRED',
        'message', 'Invalid or expired promotional code.'
      )::text;
    end if;

    -- Reject unsupported coupon types BEFORE updating usage count
    if v_coupon.discount_type not in ('PERCENTAGE', 'FLAT') then
      raise exception '%', jsonb_build_object(
        'code', 'UNSUPPORTED_COUPON_TYPE',
        'message', 'Promo code discount type "' || v_coupon.discount_type || '" is not supported at checkout.'
      )::text;
    end if;

    if v_coupon.starts_at is not null and v_coupon.starts_at > pg_catalog.now() then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_REQUIRED',
        'message', 'This promo code is not yet active.'
      )::text;
    end if;

    if v_coupon.ends_at is not null and v_coupon.ends_at < pg_catalog.now() then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_REQUIRED',
        'message', 'This promo code has expired.'
      )::text;
    end if;

    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_REQUIRED',
        'message', 'This promo code has reached its maximum usage limit.'
      )::text;
    end if;

    if v_subtotal < v_coupon.min_order_paise then
      raise exception '%', jsonb_build_object(
        'code', 'COUPON_REQUIRED',
        'message', 'Code ' || v_coupon.code || ' requires a minimum bag value of ₹' ||
          (round(v_coupon.min_order_paise / 100))::text || '.'
      )::text;
    end if;

    -- Accurate numeric percentage calculation avoiding integer division truncation
    if v_coupon.discount_type = 'PERCENTAGE' then
      v_discount := round((v_subtotal::numeric * v_coupon.discount_value::numeric) / 100.0)::bigint;
      if v_coupon.max_discount_paise is not null and v_discount > v_coupon.max_discount_paise then
        v_discount := v_coupon.max_discount_paise;
      end if;
      v_discount := least(v_discount, v_subtotal);
    elsif v_coupon.discount_type = 'FLAT' then
      v_discount := least(v_coupon.discount_value, v_subtotal);
    else
      v_discount := 0;
    end if;

    -- Increment coupon usage atomically
    update public.coupons
    set usage_count = usage_count + 1,
        updated_at = pg_catalog.now()
    where id = v_coupon.id;
  end if;

  -- ----------------------------------------------------------------------------
  -- 7. DELIVERY FEE & TOTAL CALCULATION (CANONICAL PAISE: 1 INR = 100 PAISE)
  -- ----------------------------------------------------------------------------
  v_discounted_subtotal := v_subtotal - v_discount;
  if v_discounted_subtotal >= 150000 then
    v_delivery_fee := 0; -- Free shipping threshold on bag value >= ₹1,500
  else
    v_delivery_fee := 9000; -- Standard ₹90 delivery fee
  end if;

  v_total_amount := v_discounted_subtotal + v_delivery_fee;

  if v_total_amount < 0 or v_total_amount > 10000000000 then
    raise exception '%', jsonb_build_object(
      'code', 'INVALID_ORDER_TOTAL',
      'message', 'Order total exceeds supported currency range.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 8. DECREMENT INVENTORY EXACTLY ONCE
  -- ----------------------------------------------------------------------------
  for v_product in
    select p.*
    from public.products p
    where upper(trim(p.serial_number)) = any(v_serials)
    order by p.serial_number asc
  loop
    v_serial := upper(trim(v_product.serial_number));
    v_qty := (v_quantities->>v_serial)::integer;
    v_new_stock := v_product.stock - v_qty;
    v_new_status := case when v_new_stock = 0 then 'SOLD_OUT' else v_product.status end;

    update public.products
    set stock = v_new_stock,
        status = v_new_status,
        updated_at = pg_catalog.now()
    where id = v_product.id;
  end loop;

  -- ----------------------------------------------------------------------------
  -- 9. INSERT PUBLIC.ORDERS RECORD (WITH RETRY ON UNIQUE ORDER NUMBER COLLISION)
  -- ----------------------------------------------------------------------------
  for v_attempt in 1..5 loop
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
        'CONFIRMED',
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
      -- Inspect the exact failing constraint name to ensure ONLY order_number collisions trigger retry.
      -- Any other unique constraint violation (e.g. guest token hash or payment id) must NOT be suppressed.
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'orders_order_number_key' or v_constraint_name like '%order_number%' then
        -- Generate a new cryptographic suffix using full unhyphenated pg_catalog.gen_random_uuid() and retry
        v_order_number := 'ORD-' ||
          pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' ||
          pg_catalog.upper(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''));
      else
        -- Re-throw any other unexpected unique constraint violation immediately, aborting transaction
        raise;
      end if;
    end;
  end loop;

  if not v_order_inserted then
    raise exception '%', jsonb_build_object(
      'code', 'CHECKOUT_TRANSACTION_FAILED',
      'message', 'Failed to allocate unique order number after retries.'
    )::text;
  end if;

  -- ----------------------------------------------------------------------------
  -- 10. INSERT PUBLIC.ORDER_ITEMS RECORDS & ASSEMBLE ITEMS JSON
  -- ----------------------------------------------------------------------------
  for v_item in select * from jsonb_to_recordset(p_items) as x("serialNumber" text, "quantity" integer, "size" text) loop
    v_serial := upper(trim(v_item."serialNumber"));
    v_qty := v_item."quantity";

    select * into v_product
    from public.products
    where upper(trim(serial_number)) = v_serial;

    v_item_size := coalesce(
      nullif(trim(v_item."size"), ''),
      case when array_length(v_product.sizes, 1) > 0 then v_product.sizes[1] else 'One Size' end
    );

    insert into public.order_items (
      order_id,
      product_id,
      serial_number,
      name,
      price,
      quantity,
      size,
      color,
      image_url,
      slug
    )
    values (
      v_order_id,
      v_product.id,
      v_product.serial_number,
      v_product.name,
      v_product.price,
      v_qty,
      v_item_size,
      'Curated Wash',
      coalesce(case when array_length(v_product.images, 1) > 0 then v_product.images[1] else '' end),
      v_product.slug
    );

    v_items_json := v_items_json || jsonb_build_array(
      jsonb_build_object(
        'productId', v_product.id,
        'serialNumber', v_product.serial_number,
        'name', v_product.name,
        'price', v_product.price,
        'quantity', v_qty,
        'size', v_item_size,
        'image', coalesce(case when array_length(v_product.images, 1) > 0 then v_product.images[1] else '' end),
        'slug', v_product.slug
      )
    );
  end loop;

  -- ----------------------------------------------------------------------------
  -- 11. BUILD SANITIZED RESPONSE PAYLOAD & UPDATE IDEMPOTENCY RECORD
  -- Zero raw guest access token in response_payload or database
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
    'status', 'CONFIRMED',
    'paymentMethod', p_payment_method,
    'paymentStatus', 'PENDING',
    'promoCode', case when p_promo_code is not null and trim(p_promo_code) != '' then upper(trim(p_promo_code)) else null end,
    'notes', p_notes,
    'guestAccessToken', null, -- Plaintext guest token is NEVER stored in database or cached payload
    'createdAt', v_created_at
  );

  update public.checkout_idempotency
  set response_payload = v_response_payload,
      order_number = v_order_number,
      expires_at = pg_catalog.now() + interval '24 hours'
  where key_hash = p_key_hash;

  return v_response_payload;
end;
$$;

-- ------------------------------------------------------------------------------
-- PERMISSIONS: Restrict execution strictly to service_role (trusted backend only)
-- Anon and authenticated frontend customers cannot directly execute this RPC.
-- ------------------------------------------------------------------------------
revoke all on function public.process_storefront_checkout(text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text) from public;
grant execute on function public.process_storefront_checkout(text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text) to service_role;
