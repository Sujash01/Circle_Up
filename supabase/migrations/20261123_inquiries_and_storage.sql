-- ==============================================================================
-- CircleUp Supabase Migration: Inquiries Schema & Storage Infrastructure
-- Phase 1 of MongoDB Retirement Plan
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PUBLIC.INQUIRIES TABLE
-- Replaces Mongoose Inquiry model for public contact submissions
-- ------------------------------------------------------------------------------
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  email text not null check (
    char_length(trim(email)) between 3 and 255
    and email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ),
  subject text not null default 'General Inquiry' check (char_length(trim(subject)) between 1 and 200),
  message text not null check (char_length(trim(message)) between 1 and 5000),
  status text not null default 'NEW' check (status in ('NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Optimize queries for admin dashboard filtering and sorting
create index if not exists idx_inquiries_created_at on public.inquiries(created_at desc);
create index if not exists idx_inquiries_status on public.inquiries(status);
create index if not exists idx_inquiries_email on public.inquiries(email);

-- Enable Row-Level Security
alter table public.inquiries enable row level security;

-- Public submission is proxied through Express so input validation and route
-- rate limiting cannot be bypassed by calling PostgREST directly.
drop policy if exists "Anyone can submit an inquiry" on public.inquiries;
drop policy if exists "Service role can submit inquiries" on public.inquiries;
create policy "Service role can submit inquiries"
  on public.inquiries
  for insert
  with check (auth.role() = 'service_role');

-- Admin access is mediated by Express cookie-session authentication and its
-- privileged service_role client. Supabase Auth JWTs are not used by this app.
-- Anonymous visitors and regular authenticated customers cannot read inquiries.
drop policy if exists "Service role and admins can view inquiries" on public.inquiries;
drop policy if exists "Service role can view inquiries" on public.inquiries;
create policy "Service role can view inquiries"
  on public.inquiries
  for select
  using (auth.role() = 'service_role');

-- Updating inquiries (e.g. a status transition) is restricted to service_role.
drop policy if exists "Service role and admins can update inquiries" on public.inquiries;
drop policy if exists "Service role can update inquiries" on public.inquiries;
create policy "Service role can update inquiries"
  on public.inquiries
  for update
  using (auth.role() = 'service_role');

-- Deleting inquiries is restricted to service_role.
drop policy if exists "Service role and admins can delete inquiries" on public.inquiries;
drop policy if exists "Service role can delete inquiries" on public.inquiries;
create policy "Service role can delete inquiries"
  on public.inquiries
  for delete
  using (auth.role() = 'service_role');

-- Public submissions and admin operations are proxied through Express. Only its
-- validated backend service_role client can access inquiry rows directly.
revoke all on table public.inquiries from anon, authenticated;
grant all on table public.inquiries to service_role;

-- ------------------------------------------------------------------------------
-- 2. SUPABASE STORAGE: product-images BUCKET
-- Configures the platform-managed storage bucket and access policies for assets.
-- Note: Does NOT define storage schema or tables (managed by Supabase Storage extension).
-- ------------------------------------------------------------------------------

-- Register 'product-images' bucket as public for CDN read access
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760, -- 10MB per image file
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 1. Public Read Policy: anyone (anon and authenticated) can view/read images in 'product-images'
drop policy if exists "Public Access to product-images" on storage.objects;
create policy "Public Access to product-images"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

-- 2. Mutation Policy: Upload, update, and delete are STRICTLY restricted to service_role.
-- Anonymous and customer JWTs have zero upload/mutation privileges.
drop policy if exists "Service role manage product-images" on storage.objects;
create policy "Service role manage product-images"
  on storage.objects
  for all
  using (
    bucket_id = 'product-images'
    and auth.role() = 'service_role'
  )
  with check (
    bucket_id = 'product-images'
    and auth.role() = 'service_role'
  );
