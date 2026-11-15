-- ==============================================================================
-- CircleUp Supabase Remediation Migration: Fix Insecure RLS Policies
-- Removes permissive auth.role() = 'authenticated' policies from products & orders
-- ==============================================================================

-- ── 1. Remediate public.products RLS Policies ────────────────────────────────

-- Drop insecure policies that allowed any authenticated customer to modify products
drop policy if exists "Authenticated users can insert products" on public.products;
drop policy if exists "Authenticated users can update products" on public.products;
drop policy if exists "Authenticated users can delete products" on public.products;
drop policy if exists "Admins can insert products" on public.products;
drop policy if exists "Admins can update products" on public.products;
drop policy if exists "Admins can delete products" on public.products;
drop policy if exists "Admins can view all products" on public.products;

-- Ensure public read policy for active/published products is intact
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products
  for select
  using (status in ('ACTIVE', 'PUBLISHED'));

-- Only verified administrators/staff (via app_metadata role) or service_role can view drafts/archived products
create policy "Admins can view all products"
  on public.products
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Only verified administrators/staff or service_role can insert products
create policy "Admins can insert products"
  on public.products
  for insert
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Only verified administrators/staff or service_role can update products
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

-- Only verified administrators/staff or service_role can delete products
create policy "Admins can delete products"
  on public.products
  for delete
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );


-- ── 2. Remediate public.orders RLS Policies ──────────────────────────────────

-- Drop insecure policies that allowed any authenticated customer to view or manage all orders
drop policy if exists "Staff can view all orders" on public.orders;
drop policy if exists "Enable insert for customers" on public.orders;
drop policy if exists "Users can view own orders" on public.orders;
drop policy if exists "Admins can view and manage all orders" on public.orders;
drop policy if exists "Customers can insert own orders" on public.orders;

-- Customers can view only their own orders (by customer_id or verified customer_email)
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

-- Only verified administrators or service_role can view and manage all orders
create policy "Admins can view and manage all orders"
  on public.orders
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Authenticated customers can insert only their own orders; admins/service_role can insert any order
create policy "Customers can insert own orders"
  on public.orders
  for insert
  with check (
    (auth.uid() is not null and auth.uid() = customer_id)
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );


-- ── 3. Remediate public.order_items RLS Policies ─────────────────────────────

-- Drop insecure policies on order items
drop policy if exists "Staff can manage all order items" on public.order_items;
drop policy if exists "Enable insert for order items" on public.order_items;
drop policy if exists "Users can view own order items" on public.order_items;
drop policy if exists "Admins can manage all order items" on public.order_items;
drop policy if exists "Customers can insert own order items" on public.order_items;

-- Customers can view order items belonging strictly to their own orders
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

-- Only verified administrators or service_role can view and manage all order items
create policy "Admins can manage all order items"
  on public.order_items
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'staff', 'owner')
    or auth.role() = 'service_role'
  );

-- Order items can be inserted only for orders owned by the customer or by admin/service_role
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
