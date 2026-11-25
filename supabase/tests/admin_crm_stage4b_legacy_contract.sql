-- Local-only legacy contract specimens for the production preflight.
-- Load the initial products/CRM schema and the existing rental and order-status
-- migrations first. These specimens do not represent installed production bodies.
do $$
begin
  if inet_server_addr() is distinct from '127.0.0.1'::inet
    or current_database() not like 'stage4b_safety%' then
    raise exception 'Use the disposable Stage 4B safety database';
  end if;
end;
$$;

alter table public.orders
  add column razorpay_order_id text,
  add column razorpay_payment_id text,
  add column utr_number text,
  add column payment_proof_url text;

create table public.admin_auth_sessions (
  id uuid primary key, user_id uuid not null references public.admin_users(id),
  token_hash text not null, expires_at timestamptz not null, revoked_at timestamptz
);
create table public.rate_limit_entries (
  key text primary key, hits integer not null, reset_at timestamptz not null,
  created_at timestamptz not null default now()
);

create function public.process_storefront_checkout(
  p_key_hash text,p_fingerprint text,p_customer_id uuid,p_customer jsonb,p_shipping_address jsonb,
  p_items jsonb,p_payment_method text,p_promo_code text,p_notes text,p_guest_access_token_hash text,
  p_guest_access_expires_at timestamptz,p_order_number text
) returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.storefront_cancel_pending_order(p_order_number text,p_reason text)
returns boolean language sql security definer set search_path = '' as $$ select false $$;
create function public.storefront_verify_razorpay_payment(
  p_order_number text,p_razorpay_order_id text,p_razorpay_payment_id text,p_razorpay_signature text
) returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.admin_release_expired_reservations(p_expiry_hours integer)
returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.expire_stale_stock_reservations(p_expiry_hours integer)
returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.admin_process_order_refund(p_order_ref text)
returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.admin_create_order_fulfillment(
  p_order_ref text,p_tracking_number text,p_carrier text,p_notes text,p_actor_id text,
  p_actor_email text,p_actor_role text,p_ip_address text,p_user_agent text
) returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.admin_mark_order_payment_received(
  p_order_ref text,p_utr_number text,p_payment_proof_url text,p_actor_id text,p_actor_email text,
  p_actor_role text,p_ip_address text,p_user_agent text
) returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.increment_rate_limit(p_key text,p_window_ms integer)
returns table(total_hits integer,reset_at timestamptz)
language sql security definer set search_path = '' as $$ select 1,now() $$;
create function public.admin_get_crm_customers(
  p_page integer default 1,p_limit integer default 20,p_search text default null,p_tier text default null
) returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb $$;
create function public.admin_get_daily_reconciliation(p_days integer default 30)
returns table(reconciliation_date date,payment_method text,payment_status text,order_count bigint,
  total_paise bigint,verified_utr_count bigint)
language sql security definer set search_path = '' as $$
  select current_date,''::text,''::text,0::bigint,0::bigint,0::bigint
$$;

revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;
