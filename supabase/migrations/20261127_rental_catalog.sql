-- Rental catalogue entries are a distinct entity from products and bookings.
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

create index if not exists idx_rental_catalog_available_created
  on public.rental_catalog_items(is_available, created_at desc);

alter table public.rental_catalog_items enable row level security;

drop policy if exists "Public can view available rental catalogue items" on public.rental_catalog_items;
create policy "Public can view available rental catalogue items"
  on public.rental_catalog_items for select
  using (is_available is true);

drop policy if exists "Admins can manage rental catalogue items" on public.rental_catalog_items;
create policy "Admins can manage rental catalogue items"
  on public.rental_catalog_items for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner') or auth.role() = 'service_role')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner') or auth.role() = 'service_role');
