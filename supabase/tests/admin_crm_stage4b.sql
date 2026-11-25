-- Run against an isolated database after production_admin_crm_stage4b.sql.
begin;
do $$
begin
  if inet_server_addr() is distinct from '127.0.0.1'::inet
     or current_database() not like 'stage4b_safety%' then
    raise exception 'Use the disposable Stage 4B safety database';
  end if;
end;
$$;
set local request.jwt.claim.role = 'service_role';

insert into public.admin_users (id,email,role,full_name,password_hash)
values ('081fbddc-b4c2-4ecf-b8b7-dc80aefa6bd0','stage4b-owner@example.test','owner','Fixture Owner','unused');
insert into public.products (id,serial_number,name,slug,category,stock,status,price)
values ('150efe90-0eb1-4c5c-9a9a-016a5734911b','STAGE4B-P1','Fixture Piece','stage4b-item','clothing',0,'SOLD_OUT',120000);
insert into public.rental_catalog_items
  (id,name,slug,image_url,size,rental_price_3_days_paise,rental_price_7_days_paise,rental_price_14_days_paise,security_deposit_paise)
values ('a0d68842-944c-4af7-98dd-c470a4423555','Fixture Rental','stage4b-rental','/test.webp','M',4321,9123,19000,2345);

insert into public.customers (id,full_name,email,tier)
values ('4661c091-bbb1-4902-8486-dd5d8af297ec','Fixture Customer','customer-stage4b@example.test','COMMUNITY');

insert into public.orders (order_number,customer_name,customer_email,customer_phone,total_amount,
  subtotal,shipping_address,status,payment_status,payment_method,razorpay_order_id)
values
  ('ORD-STAGE4B-UNPAID','Fixture Customer','customer-stage4b@example.test','9111111111',120000,120000,'{}','CONFIRMED','PENDING','CASH_ON_DELIVERY',null),
  ('ORD-STAGE4B-PAID','Fixture Customer','customer-stage4b@example.test','9111111111',120000,120000,'{}','CONFIRMED','PAID','CASH_ON_DELIVERY',null),
  ('ORD-STAGE4B-RETURN','Fixture Guest','guest-stage4b@example.test','9222222222',120000,120000,'{}','SHIPPED','PAID','CASH_ON_DELIVERY',null),
  ('ORD-STAGE4B-RECEIPT','Fixture Guest','receipt-stage4b@example.test','9222222222',120000,120000,'{}','DELIVERED','PENDING','CASH_ON_DELIVERY',null),
  ('ORD-STAGE4B-ONLINE','Fixture Guest','guest-stage4b@example.test','9222222222',120000,120000,'{}','PENDING','PENDING','ONLINE_UPI','order_fixture'),
  ('ORD-STAGE4B-ERROR','Fixture Guest','guest-stage4b@example.test','9222222222',120000,120000,'{}','PENDING','PENDING','CASH_ON_DELIVERY',null);
insert into public.order_items (order_id,product_id,serial_number,name,price,quantity)
select id, '150efe90-0eb1-4c5c-9a9a-016a5734911b','STAGE4B-P1','Fixture Piece',120000,1
from public.orders where order_number in ('ORD-STAGE4B-UNPAID','ORD-STAGE4B-PAID','ORD-STAGE4B-RETURN','ORD-STAGE4B-ONLINE','ORD-STAGE4B-ERROR');
insert into public.order_items (order_id,product_id,serial_number,name,price,quantity)
select id,null,'STAGE4B-MISSING','Missing Fixture',120000,1 from public.orders where order_number = 'ORD-STAGE4B-ERROR';

-- Nonempty historical references, including a PAID marker, do not establish
-- independent payment or settlement evidence.
update public.orders set utr_number = 'UNVERIFIED-HISTORICAL'
where order_number in ('ORD-STAGE4B-UNPAID','ORD-STAGE4B-PAID');
insert into public.rental_bookings (id,product_id,customer_name,customer_email,customer_phone,size,start_date,end_date,
  duration_days,rental_fee_paise,security_deposit_paise,total_paise)
values ('510042aa-783d-44de-862a-e2464fd02915','150efe90-0eb1-4c5c-9a9a-016a5734911b',
  'Legacy Fixture','legacy@example.test','9111111111','M',current_date+1,current_date+3,3,4321,2345,6666);

set local role service_role;

do $$
declare
  v_a jsonb;
  v_b jsonb;
  v_stats jsonb;
  v_owner constant uuid := '081fbddc-b4c2-4ecf-b8b7-dc80aefa6bd0';
  v_rental constant uuid := 'a0d68842-944c-4af7-98dd-c470a4423555';
  v_start date := current_date + 1;
  v_version integer;
  v_email text;
begin
  if has_function_privilege('anon','public.admin_cancel_order(text,text,uuid,text)','execute')
    or has_function_privilege('authenticated','public.admin_get_crm_customers(integer,integer,text,text)','execute')
    or has_table_privilege('authenticated','public.inquiries','select')
    or has_table_privilege('anon','public.rental_bookings','select')
    or has_table_privilege('anon','public.activity_audit_logs','select') then
    raise exception 'Private CRM object is exposed';
  end if;
  v_stats := public.admin_get_crm_customers(1,1,'customer-stage4b','COMMUNITY');
  if v_stats #>> '{meta,total}' is distinct from '1'
    or v_stats #>> '{customers,0,id}' is distinct from '4661c091-bbb1-4902-8486-dd5d8af297ec'
    or v_stats #>> '{customers,0,totalOrders}' is distinct from '2'
    or v_stats #>> '{customers,0,totalSpendInPaise}' is distinct from '120000' then
    raise exception 'Registered customer aggregation is incorrect: %', v_stats;
  end if;
  v_stats := public.admin_get_crm_customers(1,1,'guest-stage4b',null);
  if v_stats #>> '{customers,0,id}' is distinct from 'guest_' || md5('guest-stage4b@example.test') then
    raise exception 'Guest identity is incorrect: %', v_stats;
  end if;

  v_a := public.submit_contact_inquiry('Fixture','Contact-Stage4B@example.test','Contact','Please reply.');
  v_b := public.submit_contact_inquiry('Fixture','contact-stage4b@example.test','Contact','Please reply.');
  if v_a->>'id' is distinct from v_b->>'id' then raise exception 'Duplicate inquiry was created'; end if;
  update public.inquiries set status = 'IN_REVIEW', notes = 'Fixture note' where id = (v_a->>'id')::uuid;
  if not exists (select from public.inquiries where id = (v_a->>'id')::uuid and status = 'IN_REVIEW') then
    raise exception 'Inquiry status did not persist';
  end if;

  select content_version,contact_email into v_version,v_email from public.site_settings where id = 'default';
  update public.site_settings set whatsapp_number = '+916280746336', is_whatsapp_verified = true
  where id = 'default' and content_version = v_version;
  if not exists (select from public.site_settings where id = 'default' and content_version = v_version+1
    and whatsapp_number = '+916280746336' and is_whatsapp_verified and contact_email is not distinct from v_email) then
    raise exception 'Settings verification, preservation, or version bump failed';
  end if;

  v_a := public.submit_rental_booking(v_rental,'Fixture',null,'9111111111','M',v_start,v_start+6,'Fixture note');
  v_b := public.submit_rental_booking(v_rental,'Fixture',null,'9111111111','M',v_start,v_start+6,null);
  if v_a->>'total_paise' is distinct from '11468' or v_a->>'id' is distinct from v_b->>'id'
    or v_a->>'rental_catalog_id' is distinct from v_rental::text then
    raise exception 'Rental rates, catalog relation or retry semantics failed: %', v_a;
  end if;
  v_b := public.submit_rental_booking(v_rental,'Second Fixture',null,'9222222222','M',v_start,v_start+2,null);
  perform public.admin_update_rental_booking((v_a->>'id')::uuid,'CONFIRMED');
  begin
    perform public.admin_update_rental_booking((v_b->>'id')::uuid,'CONFIRMED');
    raise exception 'Overlapping booking accepted';
  exception when exclusion_violation then null;
  end;
  perform public.admin_update_rental_booking((v_a->>'id')::uuid,'CANCELLED');
  perform public.admin_update_rental_booking((v_b->>'id')::uuid,'CONFIRMED');

  if has_function_privilege('service_role',
    'public.admin_mark_order_payment_received(text,text,text,text,text,text,text,text)','execute')
    or to_regprocedure('public.admin_verify_order_payment(text,text,text,bigint,text,text,text,text,text)') is not null then
    raise exception 'Legacy manual verification can still bypass payment evidence';
  end if;
  if has_function_privilege('service_role','public.admin_release_expired_reservations(integer)','execute')
    or has_function_privilege('service_role','public.expire_stale_stock_reservations(integer)','execute')
    or has_function_privilege('service_role','public.storefront_cancel_pending_order(text,text)','execute')
    or has_function_privilege('service_role','public.admin_process_order_refund(text)','execute') then
    raise exception 'A Stage 4B.2 stock or payment writer remains exposed';
  end if;
  if exists (select from public.admin_get_daily_reconciliation(1) where verified_utr_count <> 0) then
    raise exception 'Unverified references counted as verified';
  end if;
  v_stats := public.admin_get_daily_reconciliation_evidence(1);
  if not exists (select from jsonb_array_elements(v_stats) r
    where r->>'payment_status' = 'PAID' and (r->>'order_value_paise')::bigint >= 120000
      and r->>'evidence_status' = 'UNAVAILABLE' and r->'confirmed_payment_paise' = 'null'::jsonb
      and r->'verified_refund_paise' = 'null'::jsonb and r->'net_settled_revenue_paise' = 'null'::jsonb) then
    raise exception 'Reconciliation did not distinguish legacy order value from unknown financial evidence';
  end if;
  if (select utr_number from public.orders where order_number = 'ORD-STAGE4B-PAID') <> 'UNVERIFIED-HISTORICAL' then
    raise exception 'Historical UTR was altered';
  end if;

  v_a := public.submit_rental_booking(v_rental,'Rate Fixture',null,'9333333333','M',v_start+20,v_start+23,null);
  if (v_a->>'rental_fee_paise')::bigint <> 5760 or (v_a->>'total_paise')::bigint <> 8105 then
    raise exception 'Four-day inclusive rental quote differs from approved rate calculation';
  end if;
  v_a := public.submit_rental_booking(v_rental,'Rate Fixture',null,'9333333333','M',v_start+25,v_start+38,null);
  if (v_a->>'rental_fee_paise')::bigint <> 19000 then raise exception 'Fourteen-day preset was not applied'; end if;
  if not exists (select from public.rental_bookings where id = '510042aa-783d-44de-862a-e2464fd02915'
    and product_id is not null and rental_catalog_id is null and status = 'REQUESTED') then
    raise exception 'Legacy booking link was not preserved';
  end if;
  begin
    update public.rental_bookings set product_id = null where id = '510042aa-783d-44de-862a-e2464fd02915';
    raise exception 'A booking without a product was accepted';
  exception when check_violation then null;
  end;

  for v_version in 1..6 loop
    if (select total_hits from public.stage4b_increment_order_reauth_limit(
      'admin_order_reauth:' || v_owner::text,900000)) <> v_version then
      raise exception 'Shared attempt counter failed at hit %',v_version;
    end if;
  end loop;

  begin
    perform public.admin_cancel_order('ORD-STAGE4B-UNPAID','  ',v_owner);
    raise exception 'Blank cancellation reason accepted';
  exception when raise_exception then
    if sqlerrm not like '%VALIDATION_ERROR%' then raise; end if;
  end;
  begin
    perform public.admin_cancel_order('ORD-STAGE4B-UNPAID','Fixture',gen_random_uuid());
    raise exception 'Unrecognized owner accepted';
  exception when raise_exception then
    if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  end;
  begin
    perform public.admin_update_order_status('ORD-STAGE4B-UNPAID','CANCELLED',v_owner::text,'fixture@example.test','owner');
    raise exception 'Generic order status accepted cancellation';
  exception when raise_exception then
    if sqlerrm not like '%VALIDATION_ERROR%' then raise; end if;
  end;
  v_a := public.admin_cancel_order('ORD-STAGE4B-UNPAID','Customer request',v_owner);
  v_b := public.admin_cancel_order('ORD-STAGE4B-UNPAID','Second request',v_owner);
  if v_a->>'outcome' is distinct from 'INVENTORY_REVIEW' or v_b->>'outcome' is distinct from 'INVENTORY_REVIEW'
    or v_a->>'refund_required' is distinct from 'false'
    or (select stock from public.products where serial_number = 'STAGE4B-P1') is distinct from 0 then
    raise exception 'Unpaid cancellation review or retry changed stock';
  end if;
  v_a := public.admin_cancel_order('ORD-STAGE4B-PAID','Customer request',v_owner);
  if v_a->>'refund_required' is distinct from 'true' or v_a #>> '{order,payment_status}' is distinct from 'PAID'
    or exists (select from public.refunds r join public.orders o on o.id = r.order_id where o.order_number = 'ORD-STAGE4B-PAID') then
    raise exception 'Paid cancellation altered financial records';
  end if;
  v_a := public.admin_cancel_order('ORD-STAGE4B-RETURN','Return request',v_owner);
  v_b := public.admin_cancel_order('ORD-STAGE4B-ONLINE','Unknown gateway settlement',v_owner);
  if v_a->>'outcome' is distinct from 'RETURN_REVIEW' or v_a #>> '{order,status}' is distinct from 'SHIPPED'
    or v_b->>'outcome' is distinct from 'PAYMENT_REVIEW' or v_b #>> '{order,status}' is distinct from 'PENDING' then
    raise exception 'Fulfilment or payment review changed an order';
  end if;
  v_a := public.admin_cancel_order('ORD-STAGE4B-ERROR','Missing inventory evidence test',v_owner);
  if v_a->>'outcome' is distinct from 'INVENTORY_REVIEW'
    or (select stock from public.products where serial_number = 'STAGE4B-P1') is distinct from 0 then
    raise exception 'Unproven inventory was modified';
  end if;

  if (select count(*) from public.activity_audit_logs
      where actor_id = v_owner::text and after_state ? 'cancellationOutcome') <> 5
    or not exists (select from public.activity_audit_logs where actor_id = v_owner::text
      and after_state->>'orderNumber' = 'ORD-STAGE4B-UNPAID' and after_state->>'reason' = 'Customer request'
      and before_state->>'status' = 'CONFIRMED' and after_state->>'status' = 'CONFIRMED'
      and after_state->'inventory' = '[]'::jsonb) then
    raise exception 'Cancellation audit is missing, incomplete or duplicated';
  end if;

  if has_function_privilege('service_role',
    'public.admin_update_order_status_before_stage4b(text,text,text,text,text,text,text)','execute') then
    raise exception 'Renamed order status RPC remains callable';
  end if;
  v_a := public.admin_update_order_status('ORD-STAGE4B-UNPAID','SHIPPED',v_owner::text,
    'stage4b-owner@example.test','owner','127.0.0.1','Stage 4B fixture');
  if v_a #>> '{order,status}' is distinct from 'SHIPPED' then
    raise exception 'Ordinary status update could not invoke the private legacy implementation';
  end if;

end;
$$;

rollback;
