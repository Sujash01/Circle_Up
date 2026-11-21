-- ==============================================================================
-- CircleUp Supabase Migration: Checkout Infrastructure & Schema Remediation
-- Milestone 1, Step 1: Additive foundation for atomic checkout & order tracking
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CHECKOUT IDEMPOTENCY TABLE
-- Prevents duplicate orders from rapid multi-clicks, retries, and network replays
-- ------------------------------------------------------------------------------
create table if not exists public.checkout_idempotency (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  fingerprint text not null,
  order_number text not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Note: key_hash UNIQUE constraint automatically provisions a unique B-tree index.
-- Explicit index on expires_at optimizes range-based cleanup sweeps.
create index if not exists idx_checkout_idempotency_expires_at on public.checkout_idempotency(expires_at);

alter table public.checkout_idempotency enable row level security;

-- Strictly restricted to service_role. Browser clients (anon and authenticated customers)
-- have zero policies and are blocked from reading, inserting, updating, or deleting idempotency records.
drop policy if exists "Service role manages checkout_idempotency" on public.checkout_idempotency;
create policy "Service role manages checkout_idempotency"
  on public.checkout_idempotency
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------------------------
-- 2. PUBLIC.ORDERS SCHEMA REMEDIATION
-- Additive columns confirmed absent from existing 20261115 & 20261120 migrations
-- ------------------------------------------------------------------------------
alter table public.orders
  add column if not exists promo_code text,
  add column if not exists notes text,
  add column if not exists guest_access_token_hash text,
  add column if not exists guest_access_expires_at timestamptz,
  add column if not exists payment_id text;

-- Indexes for customer email lookup, promo code analytics, and guest access token verification
create index if not exists idx_orders_customer_email on public.orders(customer_email);
create index if not exists idx_orders_promo_code on public.orders(promo_code) where promo_code is not null;
create index if not exists idx_orders_guest_token_hash on public.orders(guest_access_token_hash) where guest_access_token_hash is not null;

-- ------------------------------------------------------------------------------
-- 3. PUBLIC.ORDER_ITEMS SCHEMA REMEDIATION
-- Add product slug column for direct navigation and storefront slip alignment
-- ------------------------------------------------------------------------------
alter table public.order_items
  add column if not exists slug text;

-- ------------------------------------------------------------------------------
-- 4. CANONICAL COUPON DISCOUNT_TYPE ALIGNMENT
-- Standardize on canonical 'FLAT' matching shared Zod schema and admin UI.
--
-- EXECUTION ORDER:
-- 1) Drop existing constraint (which strictly restricted discount_type to 'FIXED')
-- 2) Normalize legacy/test records from 'FIXED' or 'FLAT_AMOUNT' to 'FLAT'
-- 3) Add new canonical constraint allowing 'PERCENTAGE', 'FLAT', 'FREE_SHIPPING', 'BOGO'
--
-- DATA NORMALIZATION OPERATION (Mutative Pre-Condition, Not Purely Additive):
-- Normalizes any legacy or test records using 'FIXED' or 'FLAT_AMOUNT' to 'FLAT'.
-- BEHAVIOR ON UNEXPECTED VALUES: If any records exist with unhandled discount_type
-- values not present in ('PERCENTAGE', 'FLAT', 'FREE_SHIPPING', 'BOGO'), the
-- subsequent ADD CONSTRAINT statement will fail closed and abort the transaction,
-- guaranteeing database integrity.
-- ------------------------------------------------------------------------------
alter table public.coupons drop constraint if exists coupons_discount_type_check;

update public.coupons
set discount_type = 'FLAT'
where upper(trim(discount_type)) in ('FIXED', 'FLAT_AMOUNT');

alter table public.coupons
  add constraint coupons_discount_type_check check (
    discount_type in (
      'PERCENTAGE',
      'FLAT',
      'FREE_SHIPPING',
      'BOGO'
    )
  );

-- ------------------------------------------------------------------------------
-- 5. IDEMPOTENCY CLEANUP HELPER FUNCTION
-- Prunes strictly completed (response_payload IS NOT NULL) and expired tokens.
-- Enforces empty search_path to eliminate resolution hijacking, schema-qualifies
-- all references, and restricts execution strictly to service_role.
-- ------------------------------------------------------------------------------
create or replace function public.cleanup_expired_idempotency_keys()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.checkout_idempotency
  where expires_at < pg_catalog.now()
    and response_payload is not null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_idempotency_keys() from public;
grant execute on function public.cleanup_expired_idempotency_keys() to service_role;
