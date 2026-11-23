-- ==============================================================================
-- CircleUp Supabase Migration: Reconcile Catalog Prices to Integer Paise
-- Migration: 20261206000000_reconcile_catalog_prices_to_paise.sql
-- ==============================================================================
-- Resolves currency display inconsistency where prices like 700 (e.g. serial 160
-- "Latex bodysuit" from the catalog sheet) or 550 were stored in raw rupees
-- instead of integer paise (* 100 -> 70000 for ₹700).
-- ==============================================================================

-- 1. Multiply raw rupee prices by 100 in public.products
-- Any product price below 5000 represents an unmultiplied rupee value (< ₹50),
-- as all CircleUp catalog items retail between ₹60 (6000 paise) and ₹10,000 (1000000 paise).
update public.products
set price = price * 100
where price > 0 and price < 5000;

-- 2. Multiply original_price if present in rupees
update public.products
set original_price = original_price * 100
where original_price is not null and original_price > 0 and original_price < 5000;

-- 3. Multiply compare_at_price if present in rupees
update public.products
set compare_at_price = compare_at_price * 100
where compare_at_price is not null and compare_at_price > 0 and compare_at_price < 5000;

-- 4. Explicitly ensure serial 160 ("Latex bodysuit") is set to 70000 paise (₹700)
update public.products
set price = 70000
where (serial_number in ('160', 'CU-160') or slug like '%latex-bodysuit%')
  and price < 70000;
