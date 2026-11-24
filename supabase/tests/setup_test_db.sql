-- Setup script for isolated PostgreSQL test environment
-- Recreates roles and tables representing production Supabase state

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text language sql as $$ select 'service_role' $$;

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text default '919876543210',
  is_whatsapp_verified boolean not null default true
);

insert into public.site_settings (whatsapp_number, is_whatsapp_verified)
values ('919876543211', true);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  name text not null,
  slug text not null unique,
  category text not null default 'clothing',
  price bigint not null check (price >= 0),
  stock integer not null default 10,
  sizes text[] not null default array['M'],
  variants jsonb not null default '[]'::jsonb,
  images jsonb not null default '["https://example.com/item.jpg"]'::jsonb,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text default '',
  discount_type text not null default 'PERCENTAGE' check (discount_type in ('PERCENTAGE', 'FLAT', 'FIXED', 'FREE_SHIPPING', 'BOGO')),
  discount_value bigint not null check (discount_value >= 0),
  max_discount_paise bigint check (max_discount_paise is null or max_discount_paise >= 0),
  min_order_paise bigint not null default 0 check (min_order_paise >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  is_active boolean not null default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  total_amount bigint not null,
  subtotal bigint not null,
  discount_amount bigint not null default 0,
  shipping_amount bigint not null default 0,
  status text not null default 'CONFIRMED',
  payment_status text not null default 'PENDING',
  payment_method text not null,
  shipping_address jsonb not null,
  promo_code text,
  notes text,
  guest_access_token_hash text,
  guest_access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  serial_number text not null,
  name text not null,
  price bigint not null,
  quantity integer not null default 1,
  size text,
  color text,
  image_url text,
  slug text,
  created_at timestamptz not null default now()
);

create table if not exists public.checkout_idempotency (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  fingerprint text not null,
  order_number text,
  response_payload jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rental_bookings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  size text not null,
  start_date date not null,
  end_date date not null,
  duration_days integer not null check (duration_days > 0),
  rental_fee_paise bigint not null check (rental_fee_paise >= 0),
  security_deposit_paise bigint not null check (security_deposit_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  status text not null default 'REQUESTED',
  created_at timestamptz not null default now()
);

-- Note: rental_catalog_items is intentionally missing (matches confirmed production finding)
drop table if exists public.rental_catalog_items cascade;

-- Razorpay columns on orders
alter table public.orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text;

-- Ensure checkout_idempotency_keys table exists
create table if not exists public.checkout_idempotency_keys (
  key_hash text primary key,
  fingerprint text not null,
  status text not null default 'PENDING',
  customer_id uuid,
  order_id uuid,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

grant all on public.checkout_idempotency_keys to postgres, service_role;
