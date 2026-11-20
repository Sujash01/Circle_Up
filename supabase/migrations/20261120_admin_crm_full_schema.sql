-- ==============================================================================
-- CircleUp Supabase Migration: Full Admin CRM & Storefront Sync Specification
-- Persists all 10 modules directly to Supabase with RLS, Audit Logging & Realtime
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADMIN USERS & RBAC TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  full_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_admin_users_email on public.admin_users(email);
create index if not exists idx_admin_users_role on public.admin_users(role);

alter table public.admin_users enable row level security;

drop policy if exists "Admins can view admin_users" on public.admin_users;
create policy "Admins can view admin_users"
  on public.admin_users
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

drop policy if exists "Owners can manage admin_users" on public.admin_users;
create policy "Owners can manage admin_users"
  on public.admin_users
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 2. ACTIVITY AUDIT LOGS (IMMUTABLE AUDIT TRAIL)
-- ------------------------------------------------------------------------------
create table if not exists public.activity_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null default 'system',
  actor_role text not null default 'admin' check (actor_role in ('owner', 'admin', 'system')),
  actor_email text,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE')),
  before_state jsonb,
  after_state jsonb,
  diff jsonb,
  ip_address text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_audit_logs_created_at on public.activity_audit_logs(created_at desc);
create index if not exists idx_audit_logs_table_record on public.activity_audit_logs(table_name, record_id);
create index if not exists idx_audit_logs_actor on public.activity_audit_logs(actor_id, actor_role);

alter table public.activity_audit_logs enable row level security;

-- Only owners and service_role can view audit logs
drop policy if exists "Owners can view audit logs" on public.activity_audit_logs;
create policy "Owners can view audit logs"
  on public.activity_audit_logs
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
    or auth.role() = 'service_role'
  );

-- Only internal triggers or service_role can append to audit logs; no one can update/delete
drop policy if exists "Service role can insert audit logs" on public.activity_audit_logs;
create policy "Service role can insert audit logs"
  on public.activity_audit_logs
  for insert
  with check (true);

-- ------------------------------------------------------------------------------
-- 3. SITE SETTINGS & CMS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.site_settings (
  id text primary key default 'default',
  announcement_text text default '',
  announcement_link text default '',
  is_announcement_active boolean default true,
  marquee_phrases text[] default '{}',
  store_address text default 'CircleUp Studio, 12 Vintage Lane, Bandra West, Mumbai 400050',
  contact_email text default 'care@circleup.in',
  contact_phone text default '+91 98201 12233',
  whatsapp_number text default '919820112233',
  maintenance_mode boolean default false,
  category_tiles jsonb default '[]'::jsonb,
  curated_drop jsonb default '{"enabled": false}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.site_settings enable row level security;

-- Public can read site settings
drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
  on public.site_settings
  for select
  using (true);

-- Only owners and service_role can update site settings
drop policy if exists "Owners can update site settings" on public.site_settings;
create policy "Owners can update site settings"
  on public.site_settings
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 4. COUPONS & STOREFRONT PLACEMENT ENGINE TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text default '',
  discount_type text not null default 'PERCENTAGE' check (discount_type in ('PERCENTAGE', 'FIXED', 'FREE_SHIPPING', 'BOGO')),
  discount_value bigint not null check (discount_value >= 0),
  max_discount_paise bigint check (max_discount_paise is null or max_discount_paise >= 0),
  min_order_paise bigint not null default 0 check (min_order_paise >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  target_tier text not null default 'ALL' check (target_tier in ('ALL', 'VIP', 'REGULAR', 'NEW', 'COMMUNITY')),
  applies_to text not null default 'ALL' check (applies_to in ('ALL', 'SPECIFIC_PRODUCTS', 'SPECIFIC_COLLECTIONS')),
  applicable_product_ids text[] default '{}',
  can_combine_with_order_discounts boolean not null default false,
  can_combine_with_shipping_discounts boolean not null default false,

  -- Storefront Surface Placement Controls (Read live by Storefront Header & Exit-Intent)
  show_in_header boolean not null default false,
  header_banner_text text,
  header_cta_label text default 'Copy Code',
  header_priority integer not null default 0,
  auto_apply boolean not null default false,

  show_in_exit_intent boolean not null default false,
  popup_headline text,
  popup_subtext text,
  popup_badge_text text,
  target_pages text[] default '{all}',
  cooldown_hours integer not null default 24,
  capture_email_or_whatsapp boolean not null default false,

  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_coupons_code on public.coupons(code);
create index if not exists idx_coupons_is_active on public.coupons(is_active);
create index if not exists idx_coupons_header on public.coupons(show_in_header) where show_in_header is true;
create index if not exists idx_coupons_exit_intent on public.coupons(show_in_exit_intent) where show_in_exit_intent is true;

alter table public.coupons enable row level security;

-- Public storefront can read active coupons
drop policy if exists "Public can read active coupons" on public.coupons;
create policy "Public can read active coupons"
  on public.coupons
  for select
  using (is_active is true);

-- Admins and owners can manage coupons
drop policy if exists "Admins can manage coupons" on public.coupons;
create policy "Admins can manage coupons"
  on public.coupons
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 5. COLLECTIONS & MERCHANDISING TABLES
-- ------------------------------------------------------------------------------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text default '',
  image_url text,
  type text not null default 'MANUAL' check (type in ('MANUAL', 'SMART')),
  rules jsonb default '[]'::jsonb,
  is_published boolean not null default true,
  is_featured boolean not null default false,
  surface_placement text default 'NONE' check (surface_placement in ('NONE', 'HOMEPAGE_TILES', 'TREASURE_CHEST', 'HERO_DROP', 'EDITORIAL_RAIL')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_collections_slug on public.collections(slug);
create index if not exists idx_collections_published on public.collections(is_published);

alter table public.collections enable row level security;

drop policy if exists "Public can read published collections" on public.collections;
create policy "Public can read published collections"
  on public.collections
  for select
  using (is_published is true);

drop policy if exists "Admins can manage collections" on public.collections;
create policy "Admins can manage collections"
  on public.collections
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

create table if not exists public.collection_products (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  unique (collection_id, product_id)
);

create index if not exists idx_collection_products_col on public.collection_products(collection_id);
create index if not exists idx_collection_products_prod on public.collection_products(product_id);

alter table public.collection_products enable row level security;

drop policy if exists "Public can read collection products" on public.collection_products;
create policy "Public can read collection products"
  on public.collection_products
  for select
  using (true);

drop policy if exists "Admins can manage collection products" on public.collection_products;
create policy "Admins can manage collection products"
  on public.collection_products
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 6. CUSTOMER CRM & SEGMENTATION TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text,
  tier text not null default 'NEW' check (tier in ('VIP', 'REGULAR', 'NEW', 'COMMUNITY')),
  total_spent_paise bigint not null default 0 check (total_spent_paise >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  saved_addresses jsonb default '[]'::jsonb,
  staff_notes text default '',
  marketing_opt_in_email boolean default false,
  marketing_opt_in_whatsapp boolean default false,
  garments_saved integer default 0 check (garments_saved >= 0),
  co2_avoided_grams bigint default 0 check (co2_avoided_grams >= 0),
  water_saved_liters bigint default 0 check (water_saved_liters >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_customers_email on public.customers(email);
create index if not exists idx_customers_tier on public.customers(tier);
create index if not exists idx_customers_total_spent on public.customers(total_spent_paise desc);

alter table public.customers enable row level security;

drop policy if exists "Users can read own customer record" on public.customers;
create policy "Users can read own customer record"
  on public.customers
  for select
  using (
    auth.uid() = user_id
    or auth.jwt() ->> 'email' = email
  );

drop policy if exists "Admins can manage customer records" on public.customers;
create policy "Admins can manage customer records"
  on public.customers
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 7. FULFILLMENTS & REFUNDS TABLES
-- ------------------------------------------------------------------------------
create table if not exists public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tracking_number text,
  carrier text,
  status text not null default 'PACKED' check (status in ('PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_fulfillments_order_id on public.fulfillments(order_id);
alter table public.fulfillments enable row level security;

drop policy if exists "Admins can manage fulfillments" on public.fulfillments;
create policy "Admins can manage fulfillments"
  on public.fulfillments
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_paise bigint not null check (amount_paise > 0),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'PROCESSED', 'REJECTED')),
  approved_by text,
  routing_action text not null default 'RESTOCK' check (routing_action in ('RESTOCK', 'DRY_CLEAN', 'ALTERATION', 'DISCARD')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_refunds_order_id on public.refunds(order_id);
alter table public.refunds enable row level security;

drop policy if exists "Admins can view refunds" on public.refunds;
create policy "Admins can view refunds"
  on public.refunds
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

drop policy if exists "Owners can manage refunds" on public.refunds;
create policy "Owners can manage refunds"
  on public.refunds
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 8. RENTALS & POP-UP EVENTS TABLES
-- ------------------------------------------------------------------------------
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
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'CONFIRMED', 'ACTIVE', 'RETURNED', 'CANCELLED')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_rental_bookings_prod on public.rental_bookings(product_id);
create index if not exists idx_rental_bookings_dates on public.rental_bookings(start_date, end_date);
alter table public.rental_bookings enable row level security;

drop policy if exists "Admins can manage rental bookings" on public.rental_bookings;
create policy "Admins can manage rental bookings"
  on public.rental_bookings
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  type text not null default 'COMMUNITY' check (type in ('POP_UP', 'COMMUNITY', 'OFFLINE_SALE')),
  date timestamptz not null,
  location text not null,
  description text default '',
  image_url text,
  capacity integer check (capacity is null or capacity > 0),
  registered_count integer not null default 0 check (registered_count >= 0),
  is_registration_open boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_events_date on public.events(date);
alter table public.events enable row level security;

drop policy if exists "Public can view active events" on public.events;
create policy "Public can view active events"
  on public.events
  for select
  using (is_registration_open is true);

drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events"
  on public.events
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  attendees integer not null default 1 check (attendees > 0),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_event_reg_event on public.event_registrations(event_id);
alter table public.event_registrations enable row level security;

drop policy if exists "Public can register for events" on public.event_registrations;
create policy "Public can register for events"
  on public.event_registrations
  for insert
  with check (true);

drop policy if exists "Admins can view event registrations" on public.event_registrations;
create policy "Admins can view event registrations"
  on public.event_registrations
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 9. SHIPPING, TAXES & CHECKOUT RULES
-- ------------------------------------------------------------------------------
create table if not exists public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pincodes text[] default '{}',
  rate_paise bigint not null default 0 check (rate_paise >= 0),
  free_shipping_above_paise bigint check (free_shipping_above_paise is null or free_shipping_above_paise >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.shipping_zones enable row level security;

drop policy if exists "Public can view shipping zones" on public.shipping_zones;
create policy "Public can view shipping zones"
  on public.shipping_zones
  for select
  using (is_active is true);

drop policy if exists "Admins can manage shipping zones" on public.shipping_zones;
create policy "Admins can manage shipping zones"
  on public.shipping_zones
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

create table if not exists public.tax_settings (
  id text primary key default 'default',
  mode text not null default 'INCLUSIVE' check (mode in ('INCLUSIVE', 'EXCLUSIVE')),
  gst_slab_percent numeric(5, 2) not null default 5.00 check (gst_slab_percent >= 0),
  hsn_code text default '6204',
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.tax_settings enable row level security;

drop policy if exists "Public can view tax settings" on public.tax_settings;
create policy "Public can view tax settings"
  on public.tax_settings
  for select
  using (true);

drop policy if exists "Owners can manage tax settings" on public.tax_settings;
create policy "Owners can manage tax settings"
  on public.tax_settings
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
    or auth.role() = 'service_role'
  );

create table if not exists public.abandoned_checkouts (
  id uuid primary key default gen_random_uuid(),
  cart_id text not null unique,
  customer_phone text,
  customer_email text,
  items jsonb not null default '[]'::jsonb,
  subtotal_paise bigint not null default 0 check (subtotal_paise >= 0),
  suggested_coupon_code text,
  is_recovered boolean not null default false,
  recovery_sent_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_abandoned_cart on public.abandoned_checkouts(cart_id);
alter table public.abandoned_checkouts enable row level security;

drop policy if exists "Admins can view abandoned checkouts" on public.abandoned_checkouts;
create policy "Admins can view abandoned checkouts"
  on public.abandoned_checkouts
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 10. ATOMIC AUDIT LOGGING TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
create or replace function public.fn_activity_audit_log()
returns trigger
language plpgsql
security definer
as $$
declare
  rec_id text;
  old_data jsonb;
  new_data jsonb;
  act_type text;
begin
  if tg_op = 'DELETE' then
    rec_id := coalesce(old.id::text, '');
    old_data := to_jsonb(old);
    new_data := null;
    act_type := 'DELETE';
  elsif tg_op = 'INSERT' then
    rec_id := coalesce(new.id::text, '');
    old_data := null;
    new_data := to_jsonb(new);
    act_type := 'INSERT';
  else
    rec_id := coalesce(new.id::text, '');
    old_data := to_jsonb(old);
    new_data := to_jsonb(new);
    if old_data->>'status' is distinct from new_data->>'status' then
      act_type := 'STATUS_CHANGE';
    else
      act_type := 'UPDATE';
    end if;
  end if;

  insert into public.activity_audit_logs (
    actor_id,
    actor_role,
    actor_email,
    table_name,
    record_id,
    action,
    before_state,
    after_state
  )
  values (
    coalesce(auth.uid()::text, 'service_role'),
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin'),
    auth.jwt() ->> 'email',
    tg_table_name,
    rec_id,
    act_type,
    old_data,
    new_data
  );

  return coalesce(new, old);
end;
$$;

-- Attach Audit Logging Triggers
drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products
  after insert or update or delete on public.products
  for each row execute function public.fn_activity_audit_log();

drop trigger if exists trg_audit_orders on public.orders;
create trigger trg_audit_orders
  after insert or update or delete on public.orders
  for each row execute function public.fn_activity_audit_log();

drop trigger if exists trg_audit_coupons on public.coupons;
create trigger trg_audit_coupons
  after insert or update or delete on public.coupons
  for each row execute function public.fn_activity_audit_log();

drop trigger if exists trg_audit_site_settings on public.site_settings;
create trigger trg_audit_site_settings
  after insert or update or delete on public.site_settings
  for each row execute function public.fn_activity_audit_log();

drop trigger if exists trg_audit_collections on public.collections;
create trigger trg_audit_collections
  after insert or update or delete on public.collections
  for each row execute function public.fn_activity_audit_log();

-- ------------------------------------------------------------------------------
-- 11. SEED DEFAULT SITE SETTINGS ROW
-- ------------------------------------------------------------------------------
insert into public.site_settings (
  id,
  announcement_text,
  announcement_link,
  is_announcement_active,
  marquee_phrases,
  store_address,
  contact_email,
  contact_phone,
  whatsapp_number,
  category_tiles
)
values (
  'default',
  'Curated Vintage Drops Every Friday · Free Shipping on orders above ₹2,500',
  '/new-arrivals',
  true,
  array[
    '100% Verified Circular Fashion',
    'Curated In Bandra West',
    'Hand-Measured Flat Lays',
    'Zero Model Photos · Pure Garment Realism'
  ],
  'CircleUp Studio, 12 Vintage Lane, Bandra West, Mumbai 400050',
  'care@circleup.in',
  '+91 98201 12233',
  '919820112233',
  '[
    {"to": "/rentals", "title": "Rentals", "note": "Wear for an occasion, then return it", "img": "/assets/rtw-3.jpg", "alt": "Blazer with skirt co-ord set"},
    {"to": "/thrifted-treasure", "title": "Thrifted Treasure", "note": "One-of-one vintage finds", "img": "/assets/hero-detail-1.jpg", "alt": "Top and skirt co-ord set"},
    {"to": "/accessories", "title": "Accessories", "note": "Bags, scarves and small things", "img": "/assets/bag-3.jpg", "alt": "Structured handheld bag"},
    {"to": "/events", "title": "Social Circle", "note": "Store sales and community days", "img": "/assets/world-social-circle.webp", "alt": "Warm lights and leafy branches"}
  ]'::jsonb
)
on conflict (id) do nothing;
