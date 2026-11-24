-- ==============================================================================
-- CircleUp Production Rollback 1: Safe Drop Rental Catalog Table
-- Target: Supabase PostgreSQL (Public Schema)
-- ==============================================================================
-- Action & Safety Invariants:
--   1. Restrictive rollback: verifies NO rental catalog records exist before dropping.
--   2. Aborts transaction if records are present, preventing data loss.
--   3. Removes table and policies without CASCADE to avoid dropping unintended dependencies.
--   4. Preserves public.rental_bookings completely untouched.
--   5. Wrapped in an atomic transaction (BEGIN ... COMMIT).
-- ==============================================================================

begin;

-- Verify table is empty before allowing drop
do $safety_check$
begin
  if to_regclass('public.rental_catalog_items') is not null then
    if exists (select 1 from public.rental_catalog_items) then
      raise exception 'Rollback aborted: public.rental_catalog_items contains records. Refusing to perform destructive rollback.';
    end if;
  end if;
end;
$safety_check$;

-- Drop RLS policies
drop policy if exists "Public can view available rental catalogue items" on public.rental_catalog_items;
drop policy if exists "Admins can manage rental catalogue items" on public.rental_catalog_items;

-- Drop table with default RESTRICT behavior (no CASCADE)
drop table if exists public.rental_catalog_items;

commit;
