-- ==============================================================================
-- CircleUp Supabase Migration: Production Products & Orders Schema
-- ==============================================================================

-- 1. Create public.products table
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  name text not null,
  slug text not null unique,
  description text default '',
  price bigint not null check (price >= 0),                 -- Non-negative integer in paise (1 INR = 100 paise)
  original_price bigint check (original_price is null or original_price >= 0),
  compare_at_price bigint check (compare_at_price is null or compare_at_price >= 0),
  stock integer not null default 1 check (stock >= 0),
  images text[] not null default '{}',
  sizes text[] not null default '{}',
  variants jsonb not null default '[]'::jsonb,              -- Array of { id, label, size, stock, priceOverride }
  category text not null,                                   -- Slug e.g. 'womens-upperwear', 'womens-one-piece'
  category_label text,
  subcategory text,
  product_type text not null default 'Pre-Loved',           -- 'Pre-Loved', 'Fresh Find', 'Handcrafted', 'Rental'
  condition text not null default 'Gently Used',            -- 'New With Tags', 'Mint', 'Gently Used', 'Vintage Wear', 'Artisan Made'
  gender text not null default 'Unisex',                    -- 'Women', 'Men', 'Unisex'
  measurements text,
  maker_note text,
  tags text[] not null default '{}',
  featured boolean not null default false,
  is_new_arrival boolean not null default false,
  chest_pick boolean not null default false,
  badge text,
  sku text,
  seo_title text,
  seo_description text,
  status text not null default 'PUBLISHED' check (status in ('ACTIVE', 'PUBLISHED', 'SOLD_OUT', 'DRAFT', 'ARCHIVED')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 2. Indexes for high-performance storefront queries & search
create index if not exists idx_products_serial_number on public.products(serial_number);
create index if not exists idx_products_slug on public.products(slug);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_featured on public.products(featured) where featured is true;
create index if not exists idx_products_new_arrival on public.products(is_new_arrival) where is_new_arrival is true;
create index if not exists idx_products_created_at on public.products(created_at desc);

-- 3. Row Level Security (RLS) for public.products
alter table public.products enable row level security;

-- Public customers can view active/published products
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products
  for select
  using (status in ('ACTIVE', 'PUBLISHED'));

-- Administrators / staff can view all products (including DRAFT, ARCHIVED)
drop policy if exists "Admins can view all products" on public.products;
create policy "Admins can view all products"
  on public.products
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Only verified admins / staff or service_role can insert products (never ordinary customers)
drop policy if exists "Authenticated users can insert products" on public.products;
drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
  on public.products
  for insert
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Only verified admins / staff or service_role can update products
drop policy if exists "Authenticated users can update products" on public.products;
drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
  on public.products
  for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Only verified admins / staff or service_role can delete products
drop policy if exists "Authenticated users can delete products" on public.products;
drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
  on public.products
  for delete
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- 4. Auto-update timestamp trigger
create or replace function public.update_products_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists on_product_update on public.products;
create trigger on_product_update
  before update on public.products
  for each row execute function public.update_products_timestamp();

-- 5. Orders & Order Items Tables
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  total_amount bigint not null check (total_amount >= 0),   -- In paise
  subtotal bigint not null check (subtotal >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  shipping_amount bigint not null default 0 check (shipping_amount >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED')),
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  payment_method text not null default 'COD',
  shipping_address jsonb not null default '{}'::jsonb,
  tracking_number text,
  courier text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created_at on public.orders(created_at desc);

alter table public.orders enable row level security;

-- Customers can read their own orders by customer_id or verified customer_email only
drop policy if exists "Users can view own orders" on public.orders;
create policy "Users can view own orders"
  on public.orders
  for select
  using (
    (auth.uid() is not null and auth.uid() = customer_id)
    or (
      (auth.jwt() ->> 'email') is not null
      and (auth.jwt() ->> 'email') = customer_email
    )
  );

-- Only verified administrators or backend service_role can view and manage all orders
drop policy if exists "Staff can view all orders" on public.orders;
drop policy if exists "Admins can view and manage all orders" on public.orders;
create policy "Admins can view and manage all orders"
  on public.orders
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Direct client order inserts: authenticated customers can only insert orders owned by themselves
drop policy if exists "Enable insert for customers" on public.orders;
drop policy if exists "Customers can insert own orders" on public.orders;
create policy "Customers can insert own orders"
  on public.orders
  for insert
  with check (
    (auth.uid() is not null and auth.uid() = customer_id)
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  serial_number text,
  name text not null,
  price bigint not null check (price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  size text,
  color text,
  image_url text
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
alter table public.order_items enable row level security;

-- Customers can view order items belonging strictly to their own orders
drop policy if exists "Users can view own order items" on public.order_items;
create policy "Users can view own order items"
  on public.order_items
  for select
  using (
    exists (
      select 1 from public.orders
      where public.orders.id = public.order_items.order_id
      and (
        (auth.uid() is not null and public.orders.customer_id = auth.uid())
        or (
          (auth.jwt() ->> 'email') is not null
          and (auth.jwt() ->> 'email') = public.orders.customer_email
        )
      )
    )
  );

-- Only verified administrators or backend service_role can view and manage all order items
drop policy if exists "Staff can manage all order items" on public.order_items;
drop policy if exists "Admins can manage all order items" on public.order_items;
create policy "Admins can manage all order items"
  on public.order_items
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Order items can only be inserted for orders owned by the customer or by admin/service_role
drop policy if exists "Enable insert for order items" on public.order_items;
drop policy if exists "Customers can insert own order items" on public.order_items;
create policy "Customers can insert own order items"
  on public.order_items
  for insert
  with check (
    exists (
      select 1 from public.orders
      where public.orders.id = public.order_items.order_id
      and (
        (auth.uid() is not null and public.orders.customer_id = auth.uid())
        or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
        or auth.role() = 'service_role'
      )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );
