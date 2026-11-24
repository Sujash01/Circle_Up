-- Run with psql -v ON_ERROR_STOP=1 on an isolated, migrated test database.
-- All fixture orders, inventory changes and coupon usage are rolled back.
begin;

do $test$
begin
  if pg_catalog.inet_server_addr() is not null
    and pg_catalog.inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet)
  then
    raise exception 'Run this fixture against local PostgreSQL only';
  end if;

  if public.calculate_storefront_delivery_fee(0, 0) <> 0
    or public.calculate_storefront_delivery_fee(0, 1) <> 9000
    or pg_catalog.has_function_privilege('anon', 'public.calculate_storefront_delivery_fee(bigint,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.calculate_storefront_delivery_fee(bigint,integer)', 'EXECUTE')
  then
    raise exception 'Unexpected empty/fully discounted fee or public access to the internal shipping function';
  end if;
end;
$test$;

insert into public.products (serial_number, name, slug, category, price, stock, sizes, status)
select 'SHIPPING-QA-' || price, 'Shipping fixture', 'shipping-qa-' || price,
  'accessories', price, 5, array['M'], 'ACTIVE'
from (values (99800), (99900), (99999), (100000), (100001), (120000)) as prices(price);

insert into public.coupons (code, discount_type, discount_value, max_discount_paise, min_order_paise, usage_limit, ends_at, is_active)
values ('SHIPPING-QA-FLAT', 'FLAT', 20001, null, 120000, 1, now() + interval '1 day', true),
  ('SHIPPING-QA-PCT', 'PERCENTAGE', 20, 20000, 120000, 1, now() + interval '1 day', true);

set local role service_role;

do $test$
declare
  v_case record;
  v_result jsonb;
  v_customer constant jsonb := '{"name":"Local fixture","email":"fixture@example.test","phone":"9876543210"}';
  v_address constant jsonb := '{"addressLine":"12 Example Lane","city":"Mumbai","state":"Maharashtra","postalCode":"400001"}';
begin
  for v_case in
    select * from (values
      (99800, null::text, 0, 9000),
      (99900, null, 0, 9000),
      (99999, null, 0, 9000),
      (100000, null, 0, 0),
      (100001, null, 0, 0),
      (120000, 'SHIPPING-QA-FLAT', 20001, 9000),
      (120000, 'SHIPPING-QA-PCT', 20000, 0)
    ) as cases(subtotal, promo, discount, shipping)
  loop
    v_result := public.process_storefront_checkout(
      'shipping-test-' || v_case.subtotal || coalesce(v_case.promo, ''),
      'shipping-test-fingerprint', null, v_customer, v_address,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'serialNumber', 'SHIPPING-QA-' || v_case.subtotal, 'quantity', 1, 'size', 'M'
      )),
      'RAZORPAY', v_case.promo
    );
    if (v_result->>'discount')::bigint is distinct from v_case.discount
      or (v_result->>'deliveryFee')::bigint is distinct from v_case.shipping
      or (v_result->>'totalAmount')::bigint is distinct from v_case.subtotal - v_case.discount + v_case.shipping
    then
      raise exception 'Unexpected totals for subtotal %, promo %: %', v_case.subtotal, v_case.promo, v_result;
    end if;
  end loop;

  begin
    perform public.process_storefront_checkout(
      'shipping-test-empty', 'shipping-test-fingerprint', null, v_customer, v_address, '[]'::jsonb, 'RAZORPAY'
    );
    raise exception 'Empty checkout was accepted';
  exception when raise_exception then
    if (sqlerrm::jsonb->>'code') is distinct from 'EMPTY_ORDER_ITEMS' then
      raise;
    end if;
  end;
end;
$test$;

rollback;
