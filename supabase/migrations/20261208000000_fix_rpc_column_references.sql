-- ==============================================================================
-- Migration: 20261208000000_fix_rpc_column_references.sql
-- Fixes column references and query planner constraints in migrated RPCs:
-- 1. Ensure public.orders has notes column
-- 2. Fix admin_get_daily_reconciliation to sum o.total_amount
-- 3. Fix admin_get_crm_customers to use mergejoinable join condition on email
-- ==============================================================================

-- 1. Ensure notes column exists on orders
alter table public.orders
  add column if not exists notes text;

-- 2. Fix admin_get_daily_reconciliation
create or replace function public.admin_get_daily_reconciliation(
  p_days integer default 30
)
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
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Reconciliation report is not authorized.')::text using errcode = '42501';
  end if;

  return query
  select
    date_trunc('day', o.created_at)::date as reconciliation_date,
    o.payment_method,
    o.payment_status,
    count(o.id)::bigint as order_count,
    coalesce(sum(o.total_amount), 0)::bigint as total_paise,
    count(o.utr_number)::bigint as verified_utr_count
  from public.orders as o
  where o.created_at >= (timezone('utc'::text, now()) - (coalesce(p_days, 30) || ' days')::interval)
  group by 1, 2, 3
  order by reconciliation_date desc, o.payment_method asc;
end;
$$;

revoke all on function public.admin_get_daily_reconciliation(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_reconciliation(integer) to service_role;

-- 3. Fix admin_get_crm_customers join condition
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
    select
      lower(trim(o.customer_email)) as customer_email,
      max(o.customer_name) as latest_customer_name,
      max(o.customer_phone) as latest_customer_phone,
      count(*) filter (where o.status <> 'CANCELLED')::integer as total_orders,
      coalesce(sum(o.total_amount) filter (
        where o.payment_status = 'PAID'
          and o.status not in ('CANCELLED', 'REFUNDED')
          and o.payment_status <> 'REFUNDED'
      ), 0)::bigint as total_spend_in_paise,
      min(o.created_at) as first_order_at,
      max(o.created_at) as last_order_at
    from public.orders o
    where o.customer_email is not null and length(trim(o.customer_email)) > 0
    group by lower(trim(o.customer_email))
  ),
  unified_customers as (
    select
      coalesce(c.id::text, 'guest_' || md5(ci.customer_email)) as id,
      coalesce(c.full_name, ci.latest_customer_name, 'Customer') as name,
      coalesce(lower(trim(c.email)), ci.customer_email) as email,
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
    full outer join customer_identities ci on lower(trim(c.email)) = ci.customer_email
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
