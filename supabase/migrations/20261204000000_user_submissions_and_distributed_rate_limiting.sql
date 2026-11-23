-- ==============================================================================
-- CircleUp Migration: Distributed Rate Limiting & User Submissions Persistence
-- Migration: 20261204000000_user_submissions_and_distributed_rate_limiting.sql
-- Resolves: P0-6 (Distributed Rate Limiting), P0-7 (Stock Reservation Expiry),
--           P1-8 (User Submissions Persistence & Moderation)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Distributed Rate Limiting Store (Resolves P0-6)
-- Persists request window hits across serverless instances and worker processes
-- ------------------------------------------------------------------------------
create table if not exists public.rate_limit_entries (
  key text primary key,
  hits integer not null default 1,
  reset_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_rate_limit_reset on public.rate_limit_entries(reset_at);

alter table public.rate_limit_entries enable row level security;

drop policy if exists "Service role manages rate limits" on public.rate_limit_entries;
create policy "Service role manages rate limits"
  on public.rate_limit_entries
  for all
  using (auth.role() = 'service_role');

-- Atomic increment RPC for distributed rate limiting
create or replace function public.increment_rate_limit(
  p_key text,
  p_window_ms integer
)
returns table (total_hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_reset_at timestamptz;
  v_hits integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'Rate limit key cannot be empty.';
  end if;

  -- Clean up expired entry if it exists for this key
  delete from public.rate_limit_entries
  where key = p_key and public.rate_limit_entries.reset_at <= v_now;

  -- Insert fresh entry or increment existing hits
  insert into public.rate_limit_entries (key, hits, reset_at)
  values (p_key, 1, v_now + (greatest(coalesce(p_window_ms, 60000), 1000) || ' milliseconds')::interval)
  on conflict (key) do update
  set hits = public.rate_limit_entries.hits + 1
  returning public.rate_limit_entries.hits, public.rate_limit_entries.reset_at into v_hits, v_reset_at;

  return query select v_hits, v_reset_at;
end;
$$;

revoke all on function public.increment_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, integer) to service_role;

create or replace function public.reset_rate_limit(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limit_entries where key = p_key;
  return true;
end;
$$;

revoke all on function public.reset_rate_limit(text) from public, anon, authenticated;
grant execute on function public.reset_rate_limit(text) to service_role;


-- ------------------------------------------------------------------------------
-- 2. Stock Reservation Expiry & Cancellation (Resolves P0-7)
-- Auto-cancels stale unpaid/pending orders and restores stock cleanly
-- ------------------------------------------------------------------------------
create or replace function public.admin_release_expired_reservations(
  p_expiry_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_order record;
  v_item record;
  v_product_id uuid;
  v_expired_count integer := 0;
  v_restored_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Cron reservation release is not authorized.')::text using errcode = '42501';
  end if;

  v_cutoff := timezone('utc'::text, now()) - (greatest(coalesce(p_expiry_hours, 24), 1) || ' hours')::interval;

  -- Select all pending, unpaid orders older than expiry window
  for v_order in
    select id, order_number, notes
    from public.orders
    where status = 'PENDING'
      and payment_status = 'PENDING'
      and created_at < v_cutoff
    for update
  loop
    -- Restore inventory for each item in the expired order
    for v_item in
      select oi.serial_number, sum(oi.quantity)::integer as quantity
      from public.order_items as oi
      where oi.order_id = v_order.id
      group by oi.serial_number
    loop
      select p.id into v_product_id
      from public.products as p
      where p.serial_number = v_item.serial_number
      for update;

      if found then
        update public.products
        set
          stock = stock + v_item.quantity,
          status = case
            when status = 'SOLD_OUT' then 'ACTIVE'
            else status
          end,
          updated_at = timezone('utc'::text, now())
        where id = v_product_id;

        v_restored_count := v_restored_count + v_item.quantity;
      end if;
    end loop;

    -- Update order status to CANCELLED with audit note
    update public.orders
    set
      status = 'CANCELLED',
      notes = case
        when v_order.notes is null or length(v_order.notes) = 0 then
          'Auto-cancelled: reservation hold expired after ' || p_expiry_hours || ' hours'
        else
          v_order.notes || ' | Auto-cancelled: reservation hold expired after ' || p_expiry_hours || ' hours'
      end,
      updated_at = timezone('utc'::text, now())
    where id = v_order.id;

    -- Append audit log entry
    insert into public.activity_audit_logs (
      actor_id,
      actor_role,
      actor_email,
      table_name,
      record_id,
      action,
      diff,
      ip_address
    )
    values (
      null,
      'SYSTEM',
      'cron@circleuponline.com',
      'orders',
      v_order.id,
      'EXPIRE_RESERVATION',
      jsonb_build_object(
        'order_number', v_order.order_number,
        'previous_status', 'PENDING',
        'new_status', 'CANCELLED',
        'expiry_hours', p_expiry_hours
      ),
      '127.0.0.1'
    );

    v_expired_count := v_expired_count + 1;
  end loop;

  return jsonb_build_object(
    'expiredOrdersCount', v_expired_count,
    'restoredItemsCount', v_restored_count,
    'expiryHours', p_expiry_hours
  );
end;
$$;

revoke all on function public.admin_release_expired_reservations(integer) from public, anon, authenticated;
grant execute on function public.admin_release_expired_reservations(integer) to service_role;


-- ------------------------------------------------------------------------------
-- 3. Reviews Moderation & Persistence (Resolves P1-8 & P1-9)
-- Persists customer reviews with approval moderation status (PENDING / APPROVED / REJECTED)
-- ------------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  title text not null,
  comment text not null,
  product_slug text,
  product_name text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_reviews_status_created on public.reviews(status, created_at desc);

alter table public.reviews enable row level security;

-- Public read: only APPROVED reviews are visible to storefront customers
drop policy if exists "Public can read approved reviews" on public.reviews;
create policy "Public can read approved reviews"
  on public.reviews
  for select
  using (status = 'APPROVED');

-- Public submission: anyone can submit, but status MUST be forced to PENDING
drop policy if exists "Public can submit reviews" on public.reviews;
create policy "Public can submit reviews"
  on public.reviews
  for insert
  with check (status = 'PENDING');

-- Admins and service role manage all reviews
drop policy if exists "Admins can manage reviews" on public.reviews;
create policy "Admins can manage reviews"
  on public.reviews
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );


-- ------------------------------------------------------------------------------
-- 4. Community Posts (#ThriftCrew) Moderation & Persistence (Resolves P1-8)
-- Persists community outfit submissions with moderation status
-- ------------------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  handle text not null,
  caption text not null,
  image_url text not null,
  tagged_piece text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_community_posts_status_created on public.community_posts(status, created_at desc);

alter table public.community_posts enable row level security;

-- Public read: only APPROVED community posts are visible
drop policy if exists "Public can read approved community posts" on public.community_posts;
create policy "Public can read approved community posts"
  on public.community_posts
  for select
  using (status = 'APPROVED');

-- Public submission: anyone can submit, status is PENDING
drop policy if exists "Public can submit community posts" on public.community_posts;
create policy "Public can submit community posts"
  on public.community_posts
  for insert
  with check (status = 'PENDING');

-- Admins and service role manage all community posts
drop policy if exists "Admins can manage community posts" on public.community_posts;
create policy "Admins can manage community posts"
  on public.community_posts
  for all
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'owner')
    or auth.role() = 'service_role'
  );


-- ------------------------------------------------------------------------------
-- 5. Rental Bookings Policy (Resolves P1-8)
-- Enables public submission of rental booking requests into public.rental_bookings
-- ------------------------------------------------------------------------------
drop policy if exists "Public can submit rental bookings" on public.rental_bookings;
create policy "Public can submit rental bookings"
  on public.rental_bookings
  for insert
  with check (status = 'REQUESTED');
