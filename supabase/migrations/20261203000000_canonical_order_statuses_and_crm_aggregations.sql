-- ==============================================================================
-- CircleUp Migration: Canonical Order Statuses & SQL CRM Aggregations
-- Resolves: P0-3 (Order Status Mismatch), P1-4 (CRM Spend Calculation),
--           P1-5 (CRM SQL Aggregations), P1-6 (Dashboard True Aggregates)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Orders Table: Align Status Check Constraint with Canonical Status Enum
-- ------------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'PENDING',
    'CONFIRMED',
    'PACKED',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED',
    'REFUNDED'
  ));

-- ------------------------------------------------------------------------------
-- 2. CRM Performance Indexes: Support Fast Server-Side Spend & Status Aggregations
-- ------------------------------------------------------------------------------
create index if not exists idx_orders_crm_email_spend
  on public.orders (customer_email, payment_status, status);

create index if not exists idx_orders_crm_customer_spend
  on public.orders (customer_id, payment_status, status);

create index if not exists idx_orders_overview_metrics
  on public.orders (status, payment_status, total_amount);

create index if not exists idx_products_overview_metrics
  on public.products (status, stock);


-- ------------------------------------------------------------------------------
-- 3. Canonical admin_update_order_status RPC (Resolves P0-3)
-- Enforces canonical transition matrix across all 10 states and handles inventory
-- ------------------------------------------------------------------------------
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

  -- Verify transition against canonical transition rules:
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

  -- If cancelling or returning order, safely restore stock without republishing archived/draft items
  if p_new_status in ('CANCELLED', 'RETURNED') and v_old_status not in ('CANCELLED', 'RETURNED') then
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
  end if;

  -- Apply status update (and sync payment_status to REFUNDED if applicable)
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

  -- Append audit log entry
  insert into public.activity_audit_logs (
    actor_id,
    actor_role,
    actor_email,
    table_name,
    record_id,
    action,
    before_state,
    after_state,
    diff,
    ip_address
  )
  values (
    p_actor_id,
    p_actor_role,
    p_actor_email,
    'orders',
    v_order.id::text,
    'STATUS_CHANGE',
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
      order by oi.created_at asc
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


-- ------------------------------------------------------------------------------
-- 4. Overview & Dashboard Metrics RPC (Resolves P1-6)
-- Computes true database aggregates across all products and orders
-- ------------------------------------------------------------------------------
create or replace function public.admin_get_overview_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live_products bigint := 0;
  v_low_stock bigint := 0;
  v_active_orders bigint := 0;
  v_total_revenue bigint := 0;
  v_total_orders bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin overview metrics are not authorized.')::text using errcode = '42501';
  end if;

  -- Products metrics
  select
    coalesce(count(*) filter (where status in ('PUBLISHED', 'ACTIVE')), 0),
    coalesce(count(*) filter (where stock > 0 and stock <= 2 and status not in ('ARCHIVED', 'DRAFT')), 0)
  into v_live_products, v_low_stock
  from public.products;

  -- Orders metrics (Active = PENDING or CONFIRMED; Realized Revenue = PAID and not cancelled/refunded)
  select
    coalesce(count(*) filter (where status in ('PENDING', 'CONFIRMED')), 0),
    coalesce(sum(total_amount) filter (where payment_status = 'PAID' and status not in ('CANCELLED', 'REFUNDED') and payment_status <> 'REFUNDED'), 0),
    count(*)
  into v_active_orders, v_total_revenue, v_total_orders
  from public.orders;

  return jsonb_build_object(
    'liveProductsCount', v_live_products,
    'lowStockCount', v_low_stock,
    'activeOrdersCount', v_active_orders,
    'totalRevenuePaise', v_total_revenue,
    'totalOrdersCount', v_total_orders
  );
end;
$$;

revoke all on function public.admin_get_overview_metrics() from public, anon, authenticated;
grant execute on function public.admin_get_overview_metrics() to service_role;


-- ------------------------------------------------------------------------------
-- 5. CRM Customer List & Aggregations RPC (Resolves P1-4 & P1-5)
-- Performs customer and order aggregation in SQL, computing paid-only spend
-- ------------------------------------------------------------------------------
create or replace function public.admin_get_crm_customers(
  p_page integer default 1,
  p_limit integer default 20,
  p_search text default null,
  p_tier text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer;
  v_search_pattern text;
  v_total bigint := 0;
  v_customers jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin CRM operation is not authorized.')::text using errcode = '42501';
  end if;

  v_offset := greatest(0, (coalesce(p_page, 1) - 1) * coalesce(p_limit, 20));
  v_search_pattern := case
    when p_search is not null and length(trim(p_search)) > 0 then '%' || lower(trim(p_search)) || '%'
    else null
  end;

  with customer_identities as (
    -- Aggregated order records by customer identity (user_id or lowercase email)
    select
      coalesce(o.customer_id::text, 'email:' || lower(trim(o.customer_email))) as match_key,
      o.customer_id,
      lower(trim(o.customer_email)) as customer_email,
      max(o.customer_name) as latest_customer_name,
      max(o.customer_phone) as latest_customer_phone,
      count(*) filter (where o.status <> 'CANCELLED')::integer as total_orders,
      -- Realized spend counts strictly PAID, non-cancelled, non-refunded orders
      coalesce(sum(o.total_amount) filter (
        where o.payment_status = 'PAID'
          and o.status not in ('CANCELLED', 'REFUNDED')
          and o.payment_status <> 'REFUNDED'
      ), 0)::bigint as total_spend_in_paise,
      min(o.created_at) as first_order_at,
      max(o.created_at) as last_order_at
    from public.orders o
    group by coalesce(o.customer_id::text, 'email:' || lower(trim(o.customer_email))), o.customer_id, lower(trim(o.customer_email))
  ),
  unified_customers as (
    select
      coalesce(c.id::text, 'guest_' || md5(ci.customer_email)) as id,
      coalesce(c.full_name, ci.latest_customer_name, 'Customer') as name,
      coalesce(c.email, ci.customer_email) as email,
      coalesce(c.phone, ci.latest_customer_phone, '') as phone,
      coalesce(ci.total_orders, 0)::integer as "totalOrders",
      coalesce(ci.total_spend_in_paise, 0)::bigint as "totalSpendInPaise",
      ci.first_order_at as "firstOrderAt",
      ci.last_order_at as "lastOrderAt",
      case
        when c.tier is not null and c.tier in ('VIP', 'REGULAR', 'NEW', 'COMMUNITY') then c.tier
        when coalesce(ci.total_spend_in_paise, 0) >= 1000000 then 'VIP'
        when coalesce(ci.total_orders, 0) >= 2 then 'REGULAR'
        else 'NEW'
      end as tier,
      c.staff_notes as notes,
      coalesce(c.saved_addresses, '[]'::jsonb) as "savedAddresses",
      coalesce(c.marketing_opt_in_email, false) as "marketingOptInEmail",
      coalesce(c.marketing_opt_in_whatsapp, false) as "marketingOptInWhatsapp",
      coalesce(c.garments_saved, 0)::integer as "garmentsSaved",
      coalesce(c.co2_avoided_grams, 0)::bigint as "co2AvoidedGrams",
      coalesce(c.water_saved_liters, 0)::bigint as "waterSavedLitres",
      coalesce(c.created_at, ci.first_order_at) as "createdAt"
    from public.customers c
    full outer join customer_identities ci on (
      c.user_id = ci.customer_id or lower(trim(c.email)) = ci.customer_email
    )
  ),
  filtered_customers as (
    select *
    from unified_customers u
    where (
      v_search_pattern is null or
      lower(u.name) like v_search_pattern or
      lower(u.email) like v_search_pattern or
      lower(u.phone) like v_search_pattern or
      lower(coalesce(u.notes, '')) like v_search_pattern
    )
    and (
      p_tier is null or p_tier = 'all' or p_tier = '' or u.tier = p_tier
    )
  )
  select count(*) into v_total from filtered_customers;

  select coalesce(
    jsonb_agg(to_jsonb(fc.*)),
    '[]'::jsonb
  ) into v_customers
  from (
    select *
    from filtered_customers
    order by coalesce("lastOrderAt", "createdAt") desc nulls last
    limit coalesce(p_limit, 20)
    offset v_offset
  ) fc;

  return jsonb_build_object(
    'customers', v_customers,
    'meta', jsonb_build_object(
      'page', coalesce(p_page, 1),
      'limit', coalesce(p_limit, 20),
      'total', v_total,
      'totalPages', case when coalesce(p_limit, 20) > 0 then ceil(v_total::numeric / coalesce(p_limit, 20))::integer else 1 end,
      'hasNext', (v_offset + coalesce(p_limit, 20)) < v_total
    )
  );
end;
$$;

revoke all on function public.admin_get_crm_customers(integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_get_crm_customers(integer, integer, text, text) to service_role;
