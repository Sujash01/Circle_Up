-- ==============================================================================
-- CircleUp Supabase Migration: Reconcile Catalog & Rental Prices to Integer Paise
-- Migration: 20261206000000_reconcile_catalog_prices_to_paise.sql
-- ==============================================================================
-- Resolves currency display inconsistency where prices like 700 (e.g. serial 160
-- "Latex bodysuit" from the catalog sheet) or rental prices were entered in raw
-- rupees instead of integer paise (* 100 -> 70000 for ₹700).
-- ==============================================================================

-- 1. Multiply raw rupee prices by 100 in public.products
-- Any product price below 5000 represents an unmultiplied rupee value (< ₹50),
-- as all CircleUp catalog items retail between ₹60 (6000 paise) and ₹10,000 (1000000 paise).
update public.products
set 
  price = price * 100,
  original_price = case 
    when original_price is not null and original_price > 0 and original_price < 5000 
    then original_price * 100 
    else original_price 
  end,
  compare_at_price = case 
    when compare_at_price is not null and compare_at_price > 0 and compare_at_price < 5000 
    then compare_at_price * 100 
    else compare_at_price 
  end
where price > 0 and price < 5000;

-- 2. Explicitly ensure serial 160 (Latex bodysuit) is set to 70000 paise (₹700)
update public.products
set price = 70000
where (serial_number in ('160', 'CU-160') or slug like '%latex-bodysuit%')
  and price < 70000;

-- 3. Multiply raw rupee prices in public.rental_catalog_items if present
do $$
begin
  if to_regclass('public.rental_catalog_items') is not null then
    update public.rental_catalog_items
    set
      rental_price_3_days_paise = case 
        when rental_price_3_days_paise > 0 and rental_price_3_days_paise < 5000 
        then rental_price_3_days_paise * 100 
        else rental_price_3_days_paise 
      end,
      rental_price_7_days_paise = case 
        when rental_price_7_days_paise > 0 and rental_price_7_days_paise < 5000 
        then rental_price_7_days_paise * 100 
        else rental_price_7_days_paise 
      end,
      rental_price_14_days_paise = case 
        when rental_price_14_days_paise > 0 and rental_price_14_days_paise < 5000 
        then rental_price_14_days_paise * 100 
        else rental_price_14_days_paise 
      end,
      security_deposit_paise = case 
        when security_deposit_paise > 0 and security_deposit_paise < 5000 
        then security_deposit_paise * 100 
        else security_deposit_paise 
      end
    where rental_price_3_days_paise < 5000 
       or rental_price_7_days_paise < 5000 
       or security_deposit_paise < 5000;
  end if;
end $$;

-- 4. Audit Log entry for price reconciliation
insert into public.activity_audit_logs (
  actor,
  action,
  entity,
  entity_id,
  metadata
) values (
  'system:migration:20261206000000',
  'PRICE_RECONCILIATION_RUPEES_TO_PAISE',
  'products',
  'all',
  jsonb_build_object(
    'target', 'products_and_rental_catalog_items',
    'rule', 'convert_unmultiplied_rupees_to_integer_paise',
    'example_item_160_paise', 70000,
    'applied_at', timezone('utc'::text, now())
  )
);
