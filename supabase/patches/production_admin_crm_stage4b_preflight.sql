-- Production catalog inspection. Run as the deployment database role.
-- Retain the output privately for review and rollback. This script never calls
-- checkout, inventory, payment, fulfilment, rental or rate-limit writers.
begin read only;
set local search_path = pg_catalog, public, extensions;

/* STAGE4B CONTRACT FINGERPRINT */
select md5(coalesce(string_agg(part,E'\n' order by part),'')) as reviewed_rpc_fingerprint
from (
  select p.oid::regprocedure::text || ':' || pg_get_userbyid(p.proowner) || ':' ||
    coalesce(p.proacl::text,'DEFAULT') || ':' || pg_get_functiondef(p.oid) as part
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in (
    'process_storefront_checkout','storefront_cancel_pending_order','storefront_verify_razorpay_payment',
    'admin_release_expired_reservations','expire_stale_stock_reservations','admin_authorize_reservation_release',
    'admin_create_order_fulfillment','admin_mark_order_payment_received','admin_verify_order_payment',
    'admin_process_order_refund','admin_update_order_status','admin_get_crm_customers',
    'admin_get_daily_reconciliation','increment_rate_limit','fn_site_settings_bump_version'
  )
  union all
  select t.tgrelid::regclass::text || ':' || t.tgenabled::text || ':' || pg_get_triggerdef(t.oid)
    || ':' || pg_get_functiondef(t.tgfoid)
  from pg_trigger t where not t.tgisinternal and t.tgrelid in (
    'public.site_settings'::regclass,'public.orders'::regclass,'public.fulfillments'::regclass,
    'public.products'::regclass,'public.rental_bookings'::regclass,'public.activity_audit_logs'::regclass,
    'public.rate_limit_entries'::regclass
  )
  union all
  select c.conrelid::regclass::text || ':' || c.conname || ':' || c.convalidated::text || ':' || pg_get_constraintdef(c.oid)
  from pg_constraint c where c.conrelid in (
    'public.site_settings'::regclass,'public.orders'::regclass,'public.fulfillments'::regclass,
    'public.rental_bookings'::regclass,'public.rental_catalog_items'::regclass,'public.activity_audit_logs'::regclass,
    'public.rate_limit_entries'::regclass
  )
) contract;

select p.oid::regprocedure as signature, pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result, pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer, p.proconfig as configuration, p.proacl as acl,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'execute') as service_execute,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  and (p.proname like 'admin_%' or p.proname like 'storefront_%'
    or p.proname in ('process_storefront_checkout','expire_stale_stock_reservations',
      'increment_rate_limit','fn_site_settings_bump_version'))
order by p.oid::regprocedure::text;

select c.relname as table_name, a.attname as column_name, format_type(a.atttypid,a.atttypmod) as type,
  a.attnotnull as not_null, pg_get_expr(d.adbin,d.adrelid) as default_sql,
  c.relrowsecurity as rls, c.relforcerowsecurity as force_rls, c.relacl as acl
from pg_class c join pg_attribute a on a.attrelid = c.oid
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where c.relnamespace = 'public'::regnamespace and a.attnum > 0 and not a.attisdropped
  and c.relname in ('site_settings','admin_users','admin_auth_sessions','orders','order_items',
    'products','fulfillments','customers','activity_audit_logs','rate_limit_entries','inquiries',
    'events','event_registrations','rental_bookings','rental_catalog_items','refunds','payment_records',
    'checkout_idempotency_keys')
order by c.relname,a.attnum;

select c.conrelid::regclass as table_name,c.conname,c.convalidated,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.conrelid in (
  'public.orders'::regclass,'public.fulfillments'::regclass,'public.rental_bookings'::regclass,
  'public.rental_catalog_items'::regclass,'public.activity_audit_logs'::regclass,'public.rate_limit_entries'::regclass
) order by c.conrelid::regclass::text,c.conname;

select t.tgrelid::regclass as table_name,t.tgenabled,t.tgname,pg_get_triggerdef(t.oid) as definition,
  pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t where not t.tgisinternal and t.tgrelid in (
  'public.site_settings'::regclass,'public.orders'::regclass,'public.fulfillments'::regclass,
  'public.products'::regclass,'public.rental_bookings'::regclass,'public.activity_audit_logs'::regclass,
  'public.rate_limit_entries'::regclass
) order by t.tgrelid::regclass::text,t.tgname;

select status,count(*) as bookings from public.rental_bookings group by status order by status;
select count(*) filter (where b.product_id is null or p.id is null) as invalid_legacy_links,
  count(*) filter (where not isfinite(b.start_date) or not isfinite(b.end_date)
    or b.end_date < b.start_date) as invalid_ranges
from public.rental_bookings b left join public.products p on p.id = b.product_id;
select count(*) as overlapping_legacy_pairs
from public.rental_bookings a join public.rental_bookings b on a.id < b.id and a.product_id = b.product_id
  and a.start_date <= b.end_date and b.start_date <= a.end_date
where a.status in ('CONFIRMED','ACTIVE') and b.status in ('CONFIRMED','ACTIVE');

select name,default_version,installed_version from pg_available_extensions where name = 'btree_gist';
select count(*) as default_settings_rows from public.site_settings where id = 'default';
select current_user as deployment_role,r.rolbypassrls as service_bypasses_rls
from pg_roles r where r.rolname = 'service_role';

rollback;
