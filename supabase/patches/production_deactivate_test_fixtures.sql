-- ==============================================================================
-- CircleUp Production Fixture & Test Data Deactivation Patch (Phase D)
-- Ensures no synthetic test products (TEST-PROD-*, DEMO-*) or test coupons
-- appear on the live storefront.
-- ==============================================================================

BEGIN;

-- 1. Archive test products if present
UPDATE public.products
SET status = 'ARCHIVED',
    updated_at = timezone('utc'::text, now())
WHERE serial_number LIKE 'TEST-PROD-%'
   OR serial_number LIKE 'DEMO-%'
   OR name ILIKE '%test product%';

-- 2. Deactivate test coupons if present
UPDATE public.coupons
SET is_active = false,
    updated_at = timezone('utc'::text, now())
WHERE code LIKE 'TEST%'
   OR code LIKE 'DEMO%';

COMMIT;
