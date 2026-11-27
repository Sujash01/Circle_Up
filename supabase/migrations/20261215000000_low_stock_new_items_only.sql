-- Update admin_get_overview_metrics() so lowStockCount applies to new items only
-- (Fresh Find / New With Tags), excluding thrift/used (Pre-Loved) items.

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

  -- Products metrics (low stock alerts apply to new items only)
  select
    coalesce(count(*) filter (where status in ('PUBLISHED', 'ACTIVE')), 0),
    coalesce(
      count(*) filter (
        where stock > 0
          and stock <= 2
          and status not in ('ARCHIVED', 'DRAFT')
          and (product_type = 'Fresh Find' or condition = 'New With Tags')
      ),
      0
    )
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
