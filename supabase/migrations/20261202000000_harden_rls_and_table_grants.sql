-- ==============================================================================
-- CircleUp Security Hardening Migration
-- Resolves: P0-2 (Direct order insert via RLS), P1-1 (Coupons readable by anyone),
--           P1-2 (Audit log forgeable)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Orders Table: Drop customer direct-insert policy & revoke INSERT from anon/authenticated
-- ------------------------------------------------------------------------------
drop policy if exists "Customers can insert own orders" on public.orders;

-- Revoke direct table inserts from public and authenticated clients
revoke insert on public.orders from anon, authenticated;

-- Ensure SELECT on orders remains permitted for authenticated customers (scoped by policy "Users can view own orders")
grant select on public.orders to authenticated;

-- Ensure service_role maintains full access for backend checkout and administrative operations
grant all on public.orders to service_role;


-- ------------------------------------------------------------------------------
-- 2. Order Items Table: Drop customer direct-insert policy & revoke INSERT from anon/authenticated
-- ------------------------------------------------------------------------------
drop policy if exists "Customers can insert own order items" on public.order_items;

-- Revoke direct table inserts from public and authenticated clients
revoke insert on public.order_items from anon, authenticated;

-- Ensure SELECT on order_items remains permitted for authenticated customers (scoped by policy "Users can view own order items")
grant select on public.order_items to authenticated;

-- Ensure service_role maintains full access
grant all on public.order_items to service_role;


-- ------------------------------------------------------------------------------
-- 3. Coupons Table: Drop public read policy so coupons are validated via backend endpoints
-- ------------------------------------------------------------------------------
drop policy if exists "Public can read active coupons" on public.coupons;

-- Revoke direct SELECT on coupons from anon and authenticated to prevent discount code harvesting
revoke select on public.coupons from anon;

-- Ensure administrative and service role access for server-side coupon validation
grant all on public.coupons to service_role;


-- ------------------------------------------------------------------------------
-- 4. Activity Audit Logs: Restrict inserts strictly to service_role / internal backend
-- ------------------------------------------------------------------------------
drop policy if exists "Service role can insert audit logs" on public.activity_audit_logs;

-- Recreate policy strictly bound to service_role (preventing anon/authenticated spoofing)
create policy "Service role can insert audit logs"
  on public.activity_audit_logs
  for insert
  to service_role
  with check (auth.role() = 'service_role');

-- Revoke all mutations from anon and authenticated
revoke insert, update, delete on public.activity_audit_logs from anon, authenticated;

-- Grant select to authenticated for owner visibility (scoped by policy "Owners can view audit logs")
grant select on public.activity_audit_logs to authenticated;
grant all on public.activity_audit_logs to service_role;


-- ------------------------------------------------------------------------------
-- 5. Trigger Functions: Revoke execution on internal trigger functions from PUBLIC/anon/authenticated
-- ------------------------------------------------------------------------------
do $$
begin
  if to_regproc('public.update_products_timestamp') is not null then
    execute 'revoke all on function public.update_products_timestamp() from public, anon, authenticated';
  end if;
  if to_regproc('public.handle_new_user') is not null then
    execute 'revoke all on function public.handle_new_user() from public, anon, authenticated';
  end if;
  if to_regproc('public.derive_product_category_code') is not null then
    execute 'revoke all on function public.derive_product_category_code() from public, anon, authenticated';
  end if;
  if to_regproc('public.fn_activity_audit_log') is not null then
    execute 'revoke all on function public.fn_activity_audit_log() from public, anon, authenticated';
  end if;
  if to_regproc('public.fn_site_settings_bump_version') is not null then
    execute 'revoke all on function public.fn_site_settings_bump_version() from public, anon, authenticated';
  end if;
  if to_regproc('public.fn_redact_audit_json') is not null then
    execute 'revoke all on function public.fn_redact_audit_json(jsonb) from public, anon, authenticated';
  end if;
end $$;

