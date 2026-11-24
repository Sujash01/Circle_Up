-- ==============================================================================
-- CircleUp Production Patch 2: Approved Storefront Checkout Shipping Policy & Coupon Alignment
-- Target: Supabase PostgreSQL (Public Schema)
-- ==============================================================================
-- Invariants Preserved:
--   1. Free shipping threshold updated to 100000 paise (₹1,000).
--   2. Standard ₹90 delivery fee (9000 paise) retained below 100000 paise.
--   3. Delivery fee calculated after discounts. Empty cart (0 items) fee is 0 paise.
--   4. Strict MD5 Precondition: Aborts transaction if installed RPC definition differs
--      from the verified production baseline fingerprint: 27f44dc15663d610807da71bf2a7f3a1.
--   5. Replaces obsolete coupon column references with canonical column names:
--      ends_at, usage_limit, min_order_paise, max_discount_paise.
--   6. Supports canonical coupon discount types (PERCENTAGE, FLAT/FIXED).
--   7. Preserves ALL unrelated production RPC logic, payment architecture, and
--      security mechanisms:
--      - Request idempotency & replay protection (checkout_idempotency_keys)
--      - Deterministic inventory row locking (SELECT ... FOR UPDATE)
--      - Explicit store WhatsApp verification check (is_whatsapp_verified)
--      - Zero raw guest access token leakage in payloads or DB
--   8. Hardens privileges: revokes execution from PUBLIC, anon, authenticated;
--      grants execute strictly to service_role and postgres.
--   9. Preserves postgres ownership, SECURITY DEFINER, and search_path = ''.
--  10. Wrapped in an atomic transaction (BEGIN ... COMMIT).
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. HELPER FUNCTION: public.calculate_storefront_delivery_fee
-- ------------------------------------------------------------------------------
create or replace function public.calculate_storefront_delivery_fee(
  p_discounted_subtotal_paise bigint,
  p_item_count integer
)
returns bigint
language sql
immutable
strict
set search_path = ''
as $shipping$
  select case
    when p_item_count = 0 or p_discounted_subtotal_paise >= 100000 then 0
    else 9000
  end;
$shipping$;

revoke all on function public.calculate_storefront_delivery_fee(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.calculate_storefront_delivery_fee(bigint, integer)
  to service_role, postgres;

-- ------------------------------------------------------------------------------
-- 2. PRECONDITION VALIDATION & TARGETED RPC INLINE PATCH
-- ------------------------------------------------------------------------------
do $migration$
declare
  v_checkout regprocedure := pg_catalog.to_regprocedure(
    'public.process_storefront_checkout(text,text,uuid,jsonb,jsonb,jsonb,text,text,text,text,timestamptz,text)'
  );
  v_owner text;
  v_secdef boolean;
  v_definition text;
  v_actual_md5 text;
  v_expected_md5 constant text := '27f44dc15663d610807da71bf2a7f3a1';

  -- Regex pattern matching the baseline 150000 paise shipping rule
  v_rule_pattern constant text := $pattern$if\s+v_discounted_subtotal\s*>=\s*150000\s+then\s+v_delivery_fee\s*:=\s*0;(?:\s*--[^\r\n]*)?\s+else\s+v_delivery_fee\s*:=\s*9000;(?:\s*--[^\r\n]*)?\s+end\s+if;$pattern$;

  -- Approved replacement rule: ₹90 below ₹1,000 after discounts, free shipping at >= ₹1,000, ₹0 for empty cart
  v_rule_replacement constant text := $rule$v_delivery_fee := public.calculate_storefront_delivery_fee(
    v_discounted_subtotal,
    coalesce(pg_catalog.jsonb_array_length(p_items), 0)
  );$rule$;
begin
  -- Precondition 2.1: Locate target RPC
  if v_checkout is null then
    raise exception 'Precondition failed: public.process_storefront_checkout RPC does not exist.';
  end if;

  -- Precondition 2.2: Verify Security Definer
  select pg_catalog.pg_get_userbyid(proowner), prosecdef
  into v_owner, v_secdef
  from pg_catalog.pg_proc
  where oid = v_checkout;

  if v_secdef is not true then
    raise exception 'Precondition failed: public.process_storefront_checkout is not SECURITY DEFINER.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_checkout);
  v_actual_md5 := pg_catalog.md5(v_definition);

  -- Precondition 2.3: Strict Baseline MD5 Fingerprint Verification
  if v_actual_md5 <> v_expected_md5 then
    raise exception 'Precondition failed: RPC definition MD5 fingerprint mismatch. Expected %, got %', v_expected_md5, v_actual_md5;
  end if;

  -- Precondition 2.4: Verify Canonical Coupons Schema in public.coupons table
  perform ends_at, usage_limit, min_order_paise, max_discount_paise
  from public.coupons limit 0;

  -- Precondition 2.5: Verify security mechanisms are present
  if v_definition !~ 'checkout_idempotency' then
    raise exception 'Precondition failed: Idempotency mechanism missing from baseline RPC.';
  end if;
  if v_definition !~ 'for\s+update' then
    raise exception 'Precondition failed: Inventory row locking missing from baseline RPC.';
  end if;
  if v_definition !~ 'is_whatsapp_verified' then
    raise exception 'Precondition failed: WhatsApp verification check missing from baseline RPC.';
  end if;
  if v_definition !~ 'p_guest_access_token_hash' then
    raise exception 'Precondition failed: Guest access token security logic missing from baseline RPC.';
  end if;

  -- 2.6: Correct coupon column and schema references in RPC definition
  v_definition := pg_catalog.replace(
    v_definition,
    'and (expires_at is null or expires_at > pg_catalog.now())',
    'and (ends_at is null or ends_at > pg_catalog.now())'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'v_coupon.min_order_amount',
    'v_coupon.min_order_paise'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'v_coupon.max_discount_amount',
    'v_coupon.max_discount_paise'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'v_discount := (v_subtotal * v_coupon.discount_value) / 10000;',
    'v_discount := (v_subtotal * v_coupon.discount_value) / 100;'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'elsif v_coupon.discount_type = ''FIXED_AMOUNT'' then',
    'elsif v_coupon.discount_type in (''FLAT'', ''FIXED'', ''FIXED_AMOUNT'') then'
  );

  -- 2.7: Apply approved shipping calculation replacement
  v_definition := pg_catalog.regexp_replace(v_definition, v_rule_pattern, v_rule_replacement);

  -- 2.8: Grant execute on calculate_storefront_delivery_fee to RPC owner
  if v_owner is not null then
    execute pg_catalog.format(
      'grant execute on function public.calculate_storefront_delivery_fee(bigint, integer) to %I',
      v_owner
    );
  end if;

  -- 2.9: Recompile function with original owner and attributes preserved
  execute v_definition;
end;
$migration$;

-- ------------------------------------------------------------------------------
-- 3. PERMISSIONS & ROLE GRANTS (Hardened)
-- ------------------------------------------------------------------------------
revoke all on function public.process_storefront_checkout(
  text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.process_storefront_checkout(
  text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text
) to service_role, postgres;

-- ------------------------------------------------------------------------------
-- 4. POST-EXECUTION VERIFICATION
-- ------------------------------------------------------------------------------
do $verify$
declare
  v_fn text := 'public.process_storefront_checkout(text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text)';
begin
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'Post-execution check failed: anon still retains EXECUTE on %', v_fn;
  end if;
  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'Post-execution check failed: authenticated still retains EXECUTE on %', v_fn;
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'Post-execution check failed: service_role lacks EXECUTE on %', v_fn;
  end if;
  if not has_function_privilege('postgres', v_fn, 'execute') then
    raise exception 'Post-execution check failed: postgres lacks EXECUTE on %', v_fn;
  end if;
end;
$verify$;

commit;
