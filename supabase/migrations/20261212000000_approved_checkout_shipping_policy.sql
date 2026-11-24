begin;

-- Keep these paise amounts in sync with CHECKOUT_SHIPPING in @circleup/shared.
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

revoke execute on function public.calculate_storefront_delivery_fee(bigint, integer)
  from public, anon, authenticated, service_role;

-- Patch the shipping calculation and the coupon column names it depends on.
-- CREATE OR REPLACE preserves the RPC's owner and privileges.
do $migration$
declare
  v_checkout regprocedure := pg_catalog.to_regprocedure(
    'public.process_storefront_checkout(text,text,uuid,jsonb,jsonb,jsonb,text,text,text,text,timestamptz,text)'
  );
  v_definition text;
  v_rule_pattern constant text := $pattern$if v_discounted_subtotal >= 100000 then\s+v_delivery_fee := 0;\s+else\s+v_delivery_fee := 15000;\s+end if;$pattern$;
  v_patched_pattern constant text := $pattern$v_delivery_fee := public\.calculate_storefront_delivery_fee\(\s*v_discounted_subtotal,\s*(?:coalesce\(pg_catalog\.jsonb_array_length\(p_items\), 0\)|pg_catalog\.jsonb_array_length\(p_items\))\s*\);$pattern$;
  v_rule_replacement constant text := $rule$v_delivery_fee := public.calculate_storefront_delivery_fee(
    v_discounted_subtotal,
    pg_catalog.jsonb_array_length(p_items)
  );$rule$;
  v_owner text;
begin
  if v_checkout is null then
    raise exception 'Secure process_storefront_checkout RPC is missing. Verify migration 20261209000000.';
  end if;

  select pg_catalog.pg_get_userbyid(proowner)
    into v_owner
    from pg_catalog.pg_proc
    where oid = v_checkout and prosecdef;

  v_definition := pg_catalog.pg_get_functiondef(v_checkout);
  if v_owner is null then
    raise exception 'Unexpected process_storefront_checkout definition. Review the installed secure checkout RPC before applying shipping policy.';
  end if;

  -- The secure checkout reintroduced names from the old coupon schema. Check
  -- the canonical columns before changing the references that block discounts.
  perform ends_at, usage_limit, min_order_paise, max_discount_paise
    from public.coupons limit 0;
  v_definition := pg_catalog.replace(v_definition, 'v_coupon.expires_at', 'v_coupon.ends_at');
  v_definition := pg_catalog.replace(v_definition, 'v_coupon.max_uses', 'v_coupon.usage_limit');
  v_definition := pg_catalog.replace(v_definition, 'v_coupon.min_order_amount', 'v_coupon.min_order_paise');
  v_definition := pg_catalog.replace(v_definition, 'v_coupon.max_discount_amount', 'v_coupon.max_discount_paise');

  execute pg_catalog.format(
    'grant execute on function public.calculate_storefront_delivery_fee(bigint, integer) to %I',
    v_owner
  );

  -- Production may already have the approved helper call from the manual patch.
  if v_definition !~ v_rule_pattern and (
    select count(*) from pg_catalog.regexp_matches(v_definition, v_patched_pattern, 'g')
  ) = 1 then
    return;
  end if;

  if (
    select count(*) from pg_catalog.regexp_matches(v_definition, v_rule_pattern, 'g')
  ) <> 1 or v_definition ~ v_patched_pattern then
    raise exception 'Unexpected process_storefront_checkout shipping rule. Review the installed RPC before applying shipping policy.';
  end if;

  execute pg_catalog.regexp_replace(v_definition, v_rule_pattern, v_rule_replacement);
end;
$migration$;

commit;
