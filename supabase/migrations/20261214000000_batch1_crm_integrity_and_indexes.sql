-- =============================================================================
-- Batch 1: Critical Production Data Integrity, Security & Performance Migration
-- =============================================================================
-- Explicit, complete CREATE OR REPLACE FUNCTION definitions (no fragile string
-- replacement on pg_get_functiondef).
--
-- Fixes:
--   1. Missing performance indexes (pg_trgm, GIN, composite B-tree)
--   2. public.products RLS policy leaking DRAFT/ARCHIVED rows to authenticated users
--   3. Missing columns on public.inquiries and public.rental_bookings
--   4. activity_audit_logs_action_check missing ORDER_FULFILLED / ORDER_REFUNDED
--   5. admin_update_order_status (oi.created_at -> oi.id)
--   6. process_storefront_checkout (concurrent idempotency claim, aggregated
--      duplicate serialNumber stock validation/decrement, coupon starts_at &
--      per_customer_limit, ACTIVE/AVAILABLE/PUBLISHED status alignment,
--      WHATSAPP_UPI + RAZORPAY + ONLINE_UPI allowlist, approved shipping policy)
--      [Note: Razorpay-only RPCs storefront_verify_razorpay_payment &
--       storefront_finalize_order_refund are deferred until Razorpay is enabled]
--   9. admin_get_crm_customer_by_id (pg_catalog.sha256/md5 under search_path = '')
--  10. Missing RPCs: admin_cancel_order, admin_update_rental_booking,
--      submit_rental_booking, admin_get_daily_reconciliation_evidence
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS & PERFORMANCE INDEXES
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- Ensure orders.promo_code exists before indexing or referencing in checkout RPC
alter table public.orders
  add column if not exists promo_code text;

create index if not exists idx_order_items_product_id
  on public.order_items (product_id)
  where product_id is not null;

create index if not exists idx_order_items_serial_upper
  on public.order_items (upper(btrim(serial_number)))
  where serial_number is not null;

create index if not exists idx_products_status_created_at
  on public.products (status, created_at desc);

create index if not exists idx_products_category_created_at
  on public.products (category, created_at desc);

create index if not exists idx_products_sizes_gin
  on public.products using gin (sizes);

create index if not exists idx_products_tags_gin
  on public.products using gin (tags);

create index if not exists idx_products_name_trgm
  on public.products using gin (name gin_trgm_ops);

create index if not exists idx_products_serial_trgm
  on public.products using gin (serial_number gin_trgm_ops);

create index if not exists idx_products_slug_trgm
  on public.products using gin (slug gin_trgm_ops);

create index if not exists idx_orders_status_created_at
  on public.orders (status, created_at desc);

create index if not exists idx_orders_customer_email_lower_trim
  on public.orders (lower(trim(customer_email)))
  where customer_email is not null;

create index if not exists idx_orders_promo_code_upper_trim
  on public.orders (upper(trim(promo_code)))
  where promo_code is not null;

create index if not exists idx_orders_order_number_trgm
  on public.orders using gin (order_number gin_trgm_ops);

create index if not exists idx_orders_customer_name_trgm
  on public.orders using gin (customer_name gin_trgm_ops);

create index if not exists idx_orders_customer_email_trgm
  on public.orders using gin (customer_email gin_trgm_ops);

create index if not exists idx_orders_customer_phone_trgm
  on public.orders using gin (customer_phone gin_trgm_ops);

create index if not exists idx_customers_user_id
  on public.customers (user_id)
  where user_id is not null;

create index if not exists idx_customers_email_lower_trim
  on public.customers (lower(trim(email)))
  where email is not null;

create index if not exists idx_inquiries_status_created_at
  on public.inquiries (status, created_at desc);

create index if not exists idx_inquiries_name_trgm
  on public.inquiries using gin (name gin_trgm_ops);

create index if not exists idx_inquiries_email_trgm
  on public.inquiries using gin (email gin_trgm_ops);

create index if not exists idx_inquiries_subject_trgm
  on public.inquiries using gin (subject gin_trgm_ops);

create index if not exists idx_audit_logs_action_created_at
  on public.activity_audit_logs (action, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. RLS HARDENING: Do not leak DRAFT / ARCHIVED products to authenticated users
-- -----------------------------------------------------------------------------
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products
  for select
  using (status in ('ACTIVE', 'AVAILABLE', 'PUBLISHED', 'EXCHANGE_BARTER', 'RENT', 'SOLD', 'SOLD_OUT', 'BOOKED'));

-- -----------------------------------------------------------------------------
-- 3. MISSING COLUMNS ON INQUIRIES & RENTAL BOOKINGS
-- -----------------------------------------------------------------------------
alter table public.inquiries
  add column if not exists phone text,
  add column if not exists category text not null default 'GENERAL',
  add column if not exists notes text,
  add column if not exists reply text,
  add column if not exists replied_at timestamptz;

alter table public.rental_bookings
  add column if not exists rental_catalog_id uuid references public.rental_catalog_items(id) on delete set null,
  add column if not exists product_name text,
  add column if not exists notes text;

alter table public.rental_bookings
  alter column customer_email drop not null,
  alter column product_id drop not null;

create index if not exists idx_rental_bookings_catalog_dates
  on public.rental_bookings (rental_catalog_id, start_date, end_date)
  where rental_catalog_id is not null;

-- -----------------------------------------------------------------------------
-- 4. AUDIT LOG ACTION CONSTRAINT
-- -----------------------------------------------------------------------------
alter table public.activity_audit_logs
  drop constraint if exists activity_audit_logs_action_check;

alter table public.activity_audit_logs
  add constraint activity_audit_logs_action_check check (
    action in (
      'INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE',
      'ORDER_FULFILLED', 'ORDER_REFUNDED',
      'ORDER_PAYMENT_VERIFIED', 'ORDER_STATUS_UPDATE',
      'ADMIN_LOGIN', 'ADMIN_LOGOUT', 'CHANGE_PASSWORD',
      'LOGIN', 'LOGOUT',
      'ADMIN_USER_CREATE', 'ADMIN_USER_UPDATE', 'ADMIN_USER_DELETE',
      'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
      'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DUPLICATE',
      'PRODUCT_SOFT_DELETE', 'PRODUCT_RESTORE', 'PRODUCT_PERMANENT_DELETE',
      'PRODUCT_BULK_PUBLISH', 'PRODUCT_BULK_UNPUBLISH', 'PRODUCT_BULK_ARCHIVE',
      'PRODUCT_BULK_CHANGECATEGORY', 'PRODUCT_BULK_DELETE',
      'COUPON_CREATE', 'COUPON_UPDATE', 'COUPON_DELETE',
      'EVENT_CREATE', 'EVENT_UPDATE', 'EVENT_DELETE',
      'RENTAL_CREATE', 'RENTAL_UPDATE', 'RENTAL_DELETE', 'RENTAL_BOOKING_UPDATE',
      'SETTINGS_UPDATE',
      'MEDIA_UPLOAD', 'MEDIA_DELETE'
    )
  );

-- -----------------------------------------------------------------------------
-- 5a. EXPLICIT FIX: admin_update_order_status (oi.created_at -> oi.id)
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_order_status(
  p_order_ref text,
  p_new_status text,
  p_actor_id text,
  p_actor_email text,
  p_actor_role text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_old_status text;
  v_item record;
  v_product_id uuid;
  v_items jsonb;
  v_allowed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin order operation is not authorized.')::text using errcode = '42501';
  end if;

  if p_order_ref is null or length(trim(p_order_ref)) not between 8 and 100
     or not (trim(p_order_ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             or upper(trim(p_order_ref)) ~ '^ORD-[A-Z0-9-]{8,80}$')
     or p_new_status is null or p_new_status not in (
       'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY',
       'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'
     )
     or p_actor_id is null or length(trim(p_actor_id)) = 0
     or p_actor_role is null or p_actor_role not in ('owner', 'staff') then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Admin order status request is invalid.')::text using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;
  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  v_old_status := v_order.status;

  if v_old_status = p_new_status then
    v_allowed := true;
  elsif v_old_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED') then
    v_allowed := true;
  elsif v_old_status = 'CONFIRMED' and p_new_status in ('PACKED', 'SHIPPED', 'CANCELLED') then
    v_allowed := true;
  elsif v_old_status = 'PACKED' and p_new_status in ('SHIPPED', 'CANCELLED') then
    v_allowed := true;
  elsif v_old_status = 'SHIPPED' and p_new_status in ('OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') then
    v_allowed := true;
  elsif v_old_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED', 'CANCELLED') then
    v_allowed := true;
  elsif v_old_status = 'DELIVERED' and p_new_status in ('RETURN_REQUESTED') then
    v_allowed := true;
  elsif v_old_status = 'RETURN_REQUESTED' and p_new_status in ('RETURNED', 'REFUNDED') then
    v_allowed := true;
  elsif v_old_status = 'RETURNED' and p_new_status in ('REFUNDED') then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception '%', jsonb_build_object(
      'code', 'INVALID_STATUS_TRANSITION',
      'message', 'Transition from ' || v_old_status || ' to ' || p_new_status || ' is not allowed.'
    )::text using errcode = 'P0001';
  end if;

  if p_new_status in ('CANCELLED', 'RETURNED') and v_old_status not in ('CANCELLED', 'RETURNED') then
    for v_item in
      select upper(btrim(oi.serial_number)) as serial_number, sum(oi.quantity)::integer as quantity
      from public.order_items as oi
      where oi.order_id = v_order.id
      group by upper(btrim(oi.serial_number))
      order by upper(btrim(oi.serial_number)) asc
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
  end if;

  if p_new_status = 'REFUNDED' then
    update public.orders
    set
      status = p_new_status,
      payment_status = 'REFUNDED',
      updated_at = timezone('utc'::text, now())
    where id = v_order.id
    returning * into v_order;
  else
    update public.orders
    set
      status = p_new_status,
      updated_at = timezone('utc'::text, now())
    where id = v_order.id
    returning * into v_order;
  end if;

  insert into public.activity_audit_logs (
    actor_id, actor_role, actor_email, table_name, record_id, action,
    before_state, after_state, diff, ip_address
  ) values (
    p_actor_id, p_actor_role, p_actor_email, 'orders', v_order.id::text, 'STATUS_CHANGE',
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status, 'payment_status', v_order.payment_status),
    jsonb_build_object('status', jsonb_build_object('from', v_old_status, 'to', p_new_status)),
    p_ip_address
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'order_id', oi.order_id,
        'product_id', oi.product_id,
        'serial_number', oi.serial_number,
        'name', oi.name,
        'price', oi.price,
        'quantity', oi.quantity,
        'size', oi.size,
        'color', oi.color,
        'image_url', oi.image_url
      )
      order by oi.id asc
    ),
    '[]'::jsonb
  ) into v_items
  from public.order_items as oi
  where oi.order_id = v_order.id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'order_items', v_items
  );
end;
$$;

revoke all on function public.admin_update_order_status(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_order_status(text, text, text, text, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5b & 5c DEFERRED: storefront_verify_razorpay_payment & storefront_finalize_order_refund
--   Deferred until Razorpay credentials and public.razorpay_webhook_events are enabled.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 5d. EXPLICIT FIX: process_storefront_checkout
--   - Concurrent-safe idempotency claiming (never falls through on 0 rows)
--   - Aggregated duplicate serialNumber stock validation & atomic decrement
--   - Coupon starts_at, ends_at, usage_limit, per_customer_limit, min_order_paise,
--     max_discount_paise
--   - ACTIVE / AVAILABLE / PUBLISHED status support without clobbering status
--   - Approved shipping policy via calculate_storefront_delivery_fee
-- -----------------------------------------------------------------------------
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
  -- 0. VALIDATE & ATOMICALLY CLAIM IDEMPOTENCY KEY (Bounded retry on concurrent rollback)
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
      -- Concurrent holder rolled back before lock acquisition; retry claim
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

  -- 5. COUPON VALIDATION (INCLUDING starts_at & per_customer_limit) & DISCOUNT CALCULATION
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

    if v_coupon.discount_type = 'PERCENTAGE' then
      v_discount := pg_catalog.round((v_subtotal * v_coupon.discount_value)::numeric / 100.0)::bigint;
      if v_coupon.max_discount_paise is not null and v_discount > v_coupon.max_discount_paise then
        v_discount := v_coupon.max_discount_paise;
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

  -- 6. SHIPPING & FINAL TOTALS (Uses approved shipping policy helper)
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

-- -----------------------------------------------------------------------------
-- 6. FAST SINGLE-CUSTOMER CRM RPC (Uses built-in pg_catalog.md5 & sha256)
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_crm_customer_by_id(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_found_customer boolean := false;
  v_orders jsonb := '[]'::jsonb;
  v_guest jsonb := null;
  v_user_lookup text;
  v_guest_email text;
begin
  if p_id is null or length(trim(p_id)) = 0 then
    return null;
  end if;

  if p_id like 'auth\_%' escape '\' then
    v_user_lookup := substr(p_id, 6);
    select * into v_customer
    from public.customers
    where user_id::text = v_user_lookup
    limit 1;
    v_found_customer := found;
  elsif p_id like 'guest\_%' escape '\' then
    select lower(trim(o.customer_email))
    into v_guest_email
    from public.orders o
    where o.customer_email is not null
      and (
        'guest_' || pg_catalog.md5(lower(trim(o.customer_email))) = p_id
        or 'guest_' || substr(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(lower(trim(o.customer_email)), 'UTF8')), 'hex'), 1, 32) = p_id
      )
    order by o.created_at desc
    limit 1;
  else
    select * into v_customer
    from public.customers
    where id::text = p_id
       or user_id::text = p_id
       or lower(trim(email)) = lower(trim(p_id))
    limit 1;
    v_found_customer := found;
  end if;

  if v_found_customer then
    select coalesce(pg_catalog.jsonb_agg(order_json order by created_at desc, id desc), '[]'::jsonb)
    into v_orders
    from (
      select
        o.created_at,
        o.id,
        pg_catalog.to_jsonb(o.*) || pg_catalog.jsonb_build_object(
          'order_items',
          coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'serial_number', oi.serial_number,
              'name', oi.name,
              'price', oi.price,
              'quantity', oi.quantity,
              'size', oi.size,
              'image_url', oi.image_url
            ) order by oi.id asc)
            from public.order_items oi
            where oi.order_id = o.id
          ), '[]'::jsonb)
        ) as order_json
      from public.orders o
      where o.customer_id = v_customer.id
         or (v_customer.user_id is not null and o.customer_id = v_customer.user_id)
         or (o.customer_id is null and lower(trim(o.customer_email)) = lower(trim(v_customer.email)))
    ) sub;

    return pg_catalog.jsonb_build_object(
      'customer', pg_catalog.to_jsonb(v_customer),
      'orders', v_orders,
      'guest', null
    );
  end if;

  if v_user_lookup is not null then
    select coalesce(pg_catalog.jsonb_agg(order_json order by created_at desc, id desc), '[]'::jsonb)
    into v_orders
    from (
      select
        o.created_at,
        o.id,
        pg_catalog.to_jsonb(o.*) || pg_catalog.jsonb_build_object(
          'order_items',
          coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'serial_number', oi.serial_number,
              'name', oi.name,
              'price', oi.price,
              'quantity', oi.quantity,
              'size', oi.size,
              'image_url', oi.image_url
            ) order by oi.id asc)
            from public.order_items oi
            where oi.order_id = o.id
          ), '[]'::jsonb)
        ) as order_json
      from public.orders o
      where o.customer_id::text = v_user_lookup
    ) sub;

    if pg_catalog.jsonb_array_length(v_orders) > 0 then
      select pg_catalog.jsonb_build_object(
        'userId', v_user_lookup,
        'email', v_orders->0->>'customer_email',
        'name', v_orders->0->>'customer_name',
        'phone', coalesce(v_orders->0->>'customer_phone', '')
      ) into v_guest;
      return pg_catalog.jsonb_build_object('customer', null, 'orders', v_orders, 'guest', v_guest);
    end if;
  end if;

  if v_guest_email is not null then
    select coalesce(pg_catalog.jsonb_agg(order_json order by created_at desc, id desc), '[]'::jsonb)
    into v_orders
    from (
      select
        o.created_at,
        o.id,
        pg_catalog.to_jsonb(o.*) || pg_catalog.jsonb_build_object(
          'order_items',
          coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'serial_number', oi.serial_number,
              'name', oi.name,
              'price', oi.price,
              'quantity', oi.quantity,
              'size', oi.size,
              'image_url', oi.image_url
            ) order by oi.id asc)
            from public.order_items oi
            where oi.order_id = o.id
          ), '[]'::jsonb)
        ) as order_json
      from public.orders o
      where o.customer_id is null
        and lower(trim(o.customer_email)) = v_guest_email
    ) sub;

    if pg_catalog.jsonb_array_length(v_orders) > 0 then
      select pg_catalog.jsonb_build_object(
        'email', v_orders->0->>'customer_email',
        'name', v_orders->0->>'customer_name',
        'phone', coalesce(v_orders->0->>'customer_phone', '')
      ) into v_guest;
      return pg_catalog.jsonb_build_object('customer', null, 'orders', v_orders, 'guest', v_guest);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.admin_get_crm_customer_by_id(text) from public, anon, authenticated;
grant execute on function public.admin_get_crm_customer_by_id(text) to service_role;

-- -----------------------------------------------------------------------------
-- 7. MISSING RPCs: admin_cancel_order, admin_update_rental_booking,
--    submit_rental_booking, admin_get_daily_reconciliation_evidence
-- -----------------------------------------------------------------------------
drop function if exists public.admin_get_daily_reconciliation_evidence(integer);

create or replace function public.admin_get_daily_reconciliation_evidence(p_days integer default 30)
returns table (
  reconciliation_date date,
  payment_method text,
  payment_status text,
  order_count bigint,
  total_paise bigint,
  verified_utr_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'FORBIDDEN', 'message', 'Reconciliation report is not authorized.')::text using errcode = '42501';
  end if;

  return query
  select
    r.reconciliation_date,
    r.payment_method,
    r.payment_status,
    r.order_count,
    r.total_paise,
    r.verified_utr_count
  from public.admin_get_daily_reconciliation(p_days) as r;
end;
$$;

revoke all on function public.admin_get_daily_reconciliation_evidence(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_reconciliation_evidence(integer) to service_role;

create or replace function public.admin_cancel_order(
  p_order_ref text,
  p_reason text,
  p_actor_id text,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_old_status text;
  v_item record;
  v_product_id uuid;
  v_items jsonb;
  v_outcome text;
  v_refund_required boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin order operation is not authorized.')::text using errcode = '42501';
  end if;

  if p_order_ref is null or length(trim(p_order_ref)) not between 8 and 100
     or not (trim(p_order_ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             or upper(trim(p_order_ref)) ~ '^ORD-[A-Z0-9-]{8,80}$')
     or p_reason is null or length(trim(p_reason)) < 3
     or p_actor_id is null or length(trim(p_actor_id)) = 0 then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Cancellation request is invalid.')::text using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;

  if not found then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  v_old_status := v_order.status;

  if v_old_status in ('RETURNED', 'REFUNDED') then
    raise exception '%', pg_catalog.jsonb_build_object(
      'code', 'INVALID_STATUS_TRANSITION',
      'message', 'Cannot cancel an order in ' || v_old_status || ' state.'
    )::text using errcode = 'P0001';
  end if;

  if v_old_status = 'CANCELLED' then
    v_refund_required := (v_order.payment_status = 'PAID');
    v_outcome := case when v_refund_required then 'PAYMENT_REVIEW' else 'CANCELLED' end;
  elsif v_old_status in ('DELIVERED', 'RETURN_REQUESTED') then
    v_refund_required := (v_order.payment_status = 'PAID');
    v_outcome := 'RETURN_REVIEW';
  else
    -- Restore stock deterministically before cancelling
    for v_item in
      select upper(btrim(oi.serial_number)) as serial_number, sum(oi.quantity)::integer as quantity
      from public.order_items as oi
      where oi.order_id = v_order.id
      group by upper(btrim(oi.serial_number))
      order by upper(btrim(oi.serial_number)) asc
    loop
      select p.id into v_product_id
      from public.products as p
      where p.serial_number = v_item.serial_number
      for update;

      if found then
        update public.products
        set
          stock = stock + v_item.quantity,
          status = case when status = 'SOLD_OUT' then 'ACTIVE' else status end,
          updated_at = timezone('utc'::text, now())
        where id = v_product_id;
      end if;
    end loop;

    update public.orders
    set
      status = 'CANCELLED',
      notes = case
        when notes is null or length(trim(notes)) = 0 then 'Cancelled: ' || trim(p_reason)
        else notes || E'\nCancelled: ' || trim(p_reason)
      end,
      updated_at = timezone('utc'::text, now())
    where id = v_order.id
    returning * into v_order;

    v_refund_required := (v_order.payment_status = 'PAID');
    v_outcome := case when v_refund_required then 'PAYMENT_REVIEW' else 'CANCELLED' end;

    insert into public.activity_audit_logs (
      actor_id, actor_role, actor_email, table_name, record_id, action,
      before_state, after_state, diff, ip_address
    ) values (
      p_actor_id, 'owner', null, 'orders', v_order.id::text, 'STATUS_CHANGE',
      pg_catalog.jsonb_build_object('status', v_old_status),
      pg_catalog.jsonb_build_object('status', 'CANCELLED', 'reason', trim(p_reason), 'outcome', v_outcome),
      pg_catalog.jsonb_build_object('status', pg_catalog.jsonb_build_object('from', v_old_status, 'to', 'CANCELLED')),
      p_ip_address
    );
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', oi.id,
        'order_id', oi.order_id,
        'product_id', oi.product_id,
        'serial_number', oi.serial_number,
        'name', oi.name,
        'price', oi.price,
        'quantity', oi.quantity,
        'size', oi.size,
        'color', oi.color,
        'image_url', oi.image_url
      )
      order by oi.id asc
    ),
    '[]'::jsonb
  ) into v_items
  from public.order_items as oi
  where oi.order_id = v_order.id;

  return pg_catalog.jsonb_build_object(
    'order', pg_catalog.to_jsonb(v_order),
    'order_items', v_items,
    'outcome', v_outcome,
    'refund_required', v_refund_required
  );
end;
$$;

revoke all on function public.admin_cancel_order(text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_cancel_order(text, text, text, text) to service_role;

create or replace function public.admin_update_rental_booking(
  p_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.rental_bookings%rowtype;
  v_allowed boolean := false;
  v_overlap_exists boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin rental operation is not authorized.')::text using errcode = '42501';
  end if;

  if p_id is null or p_status is null or p_status not in ('REQUESTED', 'CONFIRMED', 'ACTIVE', 'RETURNED', 'CANCELLED') then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'INVALID_RENTAL_BOOKING', 'message', 'Invalid rental booking status.')::text using errcode = '22023';
  end if;

  select * into v_booking
  from public.rental_bookings
  where id = p_id
  for update;

  if not found then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'RENTAL_NOT_FOUND', 'message', 'Rental booking not found.')::text using errcode = 'P0002';
  end if;

  if v_booking.status = p_status then
    v_allowed := true;
  elsif v_booking.status = 'REQUESTED' and p_status in ('CONFIRMED', 'CANCELLED') then
    v_allowed := true;
  elsif v_booking.status = 'CONFIRMED' and p_status in ('ACTIVE', 'CANCELLED') then
    v_allowed := true;
  elsif v_booking.status = 'ACTIVE' and p_status = 'RETURNED' then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'INVALID_RENTAL_BOOKING', 'message', 'Transition from ' || v_booking.status || ' to ' || p_status || ' is not allowed.')::text using errcode = '22023';
  end if;

  if p_status in ('CONFIRMED', 'ACTIVE') and v_booking.status not in ('CONFIRMED', 'ACTIVE') then
    select exists (
      select 1
      from public.rental_bookings rb
      where rb.id <> v_booking.id
        and rb.status in ('CONFIRMED', 'ACTIVE')
        and (
          (v_booking.rental_catalog_id is not null and rb.rental_catalog_id = v_booking.rental_catalog_id)
          or (v_booking.product_id is not null and rb.product_id = v_booking.product_id)
        )
        and rb.start_date <= v_booking.end_date
        and rb.end_date >= v_booking.start_date
    ) into v_overlap_exists;

    if v_overlap_exists then
      raise exception '%', pg_catalog.jsonb_build_object('code', 'RENTAL_DATES_UNAVAILABLE', 'message', 'The rental is already booked for these dates.')::text using errcode = '23P01';
    end if;
  end if;

  update public.rental_bookings
  set status = p_status
  where id = v_booking.id
  returning * into v_booking;

  return pg_catalog.to_jsonb(v_booking);
end;
$$;

revoke all on function public.admin_update_rental_booking(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_update_rental_booking(uuid, text) to service_role;

create or replace function public.submit_rental_booking(
  p_catalog_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_size text,
  p_start date,
  p_end date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.rental_catalog_items%rowtype;
  v_duration integer;
  v_fee bigint;
  v_total bigint;
  v_overlap boolean := false;
  v_booking public.rental_bookings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'FORBIDDEN', 'message', 'Rental booking submission is not authorized.')::text using errcode = '42501';
  end if;

  if p_catalog_id is null
     or p_name is null or length(trim(p_name)) < 2
     or p_phone is null or length(trim(p_phone)) < 8
     or p_size is null or length(trim(p_size)) = 0
     or p_start is null or p_end is null or p_end < p_start then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'INVALID_RENTAL_BOOKING', 'message', 'Invalid rental booking dates or customer details.')::text using errcode = '22023';
  end if;

  v_duration := (p_end - p_start) + 1;
  if v_duration <= 0 or v_duration > 14 then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'INVALID_RENTAL_BOOKING', 'message', 'Rental duration must be between 1 and 14 days.')::text using errcode = '22023';
  end if;

  select * into v_item
  from public.rental_catalog_items
  where id = p_catalog_id and is_available is true
  for update;

  if not found then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'RENTAL_NOT_FOUND', 'message', 'Rental item is unavailable.')::text using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.rental_bookings rb
    where rb.rental_catalog_id = p_catalog_id
      and rb.status in ('CONFIRMED', 'ACTIVE')
      and rb.start_date <= p_end
      and rb.end_date >= p_start
  ) into v_overlap;

  if v_overlap then
    raise exception '%', pg_catalog.jsonb_build_object('code', 'RENTAL_DATES_UNAVAILABLE', 'message', 'The rental is already booked for these dates.')::text using errcode = '23P01';
  end if;

  if v_duration <= 3 then
    v_fee := v_item.rental_price_3_days_paise;
  elsif v_duration <= 7 then
    v_fee := v_item.rental_price_7_days_paise;
  else
    v_fee := v_item.rental_price_14_days_paise;
  end if;

  v_total := v_fee + v_item.security_deposit_paise;

  insert into public.rental_bookings (
    rental_catalog_id, product_id, product_name,
    customer_name, customer_email, customer_phone,
    size, start_date, end_date, duration_days,
    rental_fee_paise, security_deposit_paise, total_paise,
    status, notes
  )
  values (
    v_item.id, null, v_item.name,
    trim(p_name), case when p_email is not null and length(trim(p_email)) > 0 then lower(trim(p_email)) else null end, trim(p_phone),
    trim(p_size), p_start, p_end, v_duration,
    v_fee, v_item.security_deposit_paise, v_total,
    'REQUESTED', p_notes
  )
  returning * into v_booking;

  return pg_catalog.to_jsonb(v_booking);
end;
$$;

revoke all on function public.submit_rental_booking(uuid, text, text, text, text, date, date, text) from public, anon, authenticated;
grant execute on function public.submit_rental_booking(uuid, text, text, text, text, date, date, text) to service_role;

-- -----------------------------------------------------------------------------
-- 8. FAIL-FAST MIGRATION ASSERTIONS
-- -----------------------------------------------------------------------------
do $$
begin
  perform phone, category, notes, reply, replied_at from public.inquiries limit 0;
  perform rental_catalog_id, product_name, notes from public.rental_bookings limit 0;

  if pg_catalog.to_regprocedure('public.calculate_storefront_delivery_fee(bigint,integer)') is null then
    raise exception 'Missing helper public.calculate_storefront_delivery_fee(bigint,integer). Verify migration 20261212000000.';
  end if;

  if pg_catalog.to_regprocedure('public.process_storefront_checkout(text,text,uuid,jsonb,jsonb,jsonb,text,text,text,text,timestamptz,text)') is null then
    raise exception 'process_storefront_checkout signature mismatch.';
  end if;

  if pg_catalog.to_regprocedure('public.admin_cancel_order(text,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.admin_update_rental_booking(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.submit_rental_booking(uuid,text,text,text,text,date,date,text)') is null
     or pg_catalog.to_regprocedure('public.admin_get_crm_customer_by_id(text)') is null
     or pg_catalog.to_regprocedure('public.admin_get_daily_reconciliation_evidence(integer)') is null then
    raise exception 'One or more required Batch 1 RPCs were not created.';
  end if;
end $$;

commit;
