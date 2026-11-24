-- ==============================================================================
-- CircleUp Production Patch 1: Restore Missing Rental Catalog Table
-- Target: Supabase PostgreSQL (Public Schema)
-- ==============================================================================
-- Invariants Preserved:
--   - Does NOT modify existing production records or tables.
--   - Leaves public.rental_bookings untouched and fully preserved.
--   - Sets up table public.rental_catalog_items with UUID PK, integer paise amounts,
--     availability indexes, strict RLS policies, and grants.
--   - Wrapped in an atomic transaction (BEGIN ... COMMIT).
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. PRECONDITION & COMPATIBILITY CHECK
-- ------------------------------------------------------------------------------
do $preflight$
begin
  -- Precondition 1: Verify public.rental_bookings exists
  if to_regclass('public.rental_bookings') is null then
    raise exception 'Precondition failed: public.rental_bookings table does not exist in public schema.';
  end if;

  -- Precondition 2: Verify gen_random_uuid() is accessible
  if to_regproc('gen_random_uuid') is null and to_regproc('pg_catalog.gen_random_uuid') is null then
    raise exception 'Precondition failed: cryptographic UUID generator gen_random_uuid() is not available.';
  end if;
end;
$preflight$;

-- ------------------------------------------------------------------------------
-- 2. CREATE TABLE public.rental_catalog_items
-- ------------------------------------------------------------------------------
create table if not exists public.rental_catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null default 'rentals',
  image_url text not null,
  rental_price_3_days_paise bigint not null check (rental_price_3_days_paise >= 0),
  rental_price_7_days_paise bigint not null check (rental_price_7_days_paise >= 0),
  rental_price_14_days_paise bigint not null check (rental_price_14_days_paise >= 0),
  security_deposit_paise bigint not null check (security_deposit_paise >= 0),
  condition text not null default 'Mint',
  size text not null default 'One Size',
  is_available boolean not null default true,
  description text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 3. INDEXES
-- ------------------------------------------------------------------------------
create index if not exists idx_rental_catalog_available_created
  on public.rental_catalog_items(is_available, created_at desc);

create index if not exists idx_rental_catalog_slug
  on public.rental_catalog_items(slug);

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) & POLICIES
-- ------------------------------------------------------------------------------
alter table public.rental_catalog_items enable row level security;

-- Public can view available catalogue items
drop policy if exists "Public can view available rental catalogue items" on public.rental_catalog_items;
create policy "Public can view available rental catalogue items"
  on public.rental_catalog_items for select
  using (is_available is true);

-- Admins and staff can view and manage all catalogue items
drop policy if exists "Admins can manage rental catalogue items" on public.rental_catalog_items;
create policy "Admins can manage rental catalogue items"
  on public.rental_catalog_items for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 5. PERMISSIONS & ROLE GRANTS
-- ------------------------------------------------------------------------------
grant select on public.rental_catalog_items to anon, authenticated;
grant all on public.rental_catalog_items to service_role;

commit;
