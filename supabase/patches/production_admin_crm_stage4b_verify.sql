-- Read-only post-installation assertions. Run as the deployment database role.
begin read only;
do $$
declare
  v_signature text;
  v_oid oid;
begin
  foreach v_signature in array array[
    'admin_update_order_status(text,text,text,text,text,text,text)',
    'admin_cancel_order(text,text,uuid,text)',
    'admin_get_crm_customers(integer,integer,text,text)',
    'admin_get_daily_reconciliation(integer)',
    'admin_get_daily_reconciliation_evidence(integer)',
    'stage4b_increment_order_reauth_limit(text,integer)',
    'submit_contact_inquiry(text,text,text,text)',
    'submit_rental_booking(uuid,text,text,text,text,date,date,text)',
    'admin_update_rental_booking(uuid,text)'
  ] loop
    v_oid := to_regprocedure('public.' || v_signature);
    if v_oid is null or not has_function_privilege('service_role',v_oid,'execute')
      or has_function_privilege('anon',v_oid,'execute')
      or has_function_privilege('authenticated',v_oid,'execute') then
      raise exception 'Stage 4B verification: missing RPC or incorrect ACL on %',v_signature;
    end if;
  end loop;
  if exists (select from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in (
      'admin_update_order_status_before_stage4b','admin_mark_order_payment_received',
      'admin_process_order_refund','storefront_finalize_order_refund',
      'admin_record_physical_return_inspection','admin_authorize_reservation_release',
      'admin_release_expired_reservations','expire_stale_stock_reservations','storefront_cancel_pending_order'
    )
    and (has_function_privilege('service_role',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute')
      or has_function_privilege('authenticated',p.oid,'execute'))) then
    raise exception 'Stage 4B verification: legacy write RPC remains callable directly';
  end if;
  if not exists (select from pg_proc wrapper join pg_proc legacy on wrapper.proowner = legacy.proowner
    where wrapper.oid = to_regprocedure('public.admin_update_order_status(text,text,text,text,text,text,text)')
      and legacy.oid = to_regprocedure('public.admin_update_order_status_before_stage4b(text,text,text,text,text,text,text)')
      and wrapper.prosecdef and wrapper.proconfig @> array['search_path=""']) then
    raise exception 'Stage 4B verification: wrapper lacks ownership or secure invocation context';
  end if;
  if exists (select from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_verify_order_payment') then
    raise exception 'Stage 4B verification: unexpected payment-attestation RPC';
  end if;
  if (select count(*) from pg_constraint c where c.conrelid = 'public.rental_bookings'::regclass
    and c.convalidated and c.conname in ('stage4b_rental_exactly_one_item','stage4b_rental_valid_dates',
      'stage4b_rental_catalog_no_overlap','stage4b_rental_legacy_no_overlap')) <> 4 then
    raise exception 'Stage 4B verification: required rental integrity constraints are missing';
  end if;
  if (select count(*) from pg_constraint c where c.conrelid = 'public.rental_bookings'::regclass
    and c.convalidated and c.contype = 'f' and c.confdeltype = 'r'
    and c.confrelid in ('public.products'::regclass,'public.rental_catalog_items'::regclass)) <> 2 then
    raise exception 'Stage 4B verification: rental links do not protect historical bookings from deletion';
  end if;
  if not exists (select from pg_trigger t where t.tgrelid = 'public.site_settings'::regclass
    and t.tgname = 'trg_site_settings_bump_version' and t.tgenabled = 'O'
    and t.tgfoid = to_regprocedure('public.fn_site_settings_bump_version()')) then
    raise exception 'Stage 4B verification: settings version trigger is missing';
  end if;
  if exists (select from pg_class c where c.oid in (
    'public.inquiries'::regclass,'public.rental_bookings'::regclass,'public.activity_audit_logs'::regclass
  ) and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'select,insert,update,delete')
    or has_table_privilege('authenticated',c.oid,'select,insert,update,delete'))) then
    raise exception 'Stage 4B verification: private CRM table grants or RLS differ';
  end if;
end;
$$;

do $$
declare v_jobs bigint;
begin
  if to_regclass('cron.job') is not null then
    execute $cron$
      select count(*) from cron.job where active and database = current_database()
        and command ~* '(admin_release_expired_reservations|expire_stale_stock_reservations|expire-reservations|release-expired-holds)'
    $cron$ into v_jobs;
    if v_jobs > 0 then raise exception 'Stage 4B.1 verification: active reservation-expiry job'; end if;
  end if;
end;
$$;

select count(*) as default_settings_rows,
  min(content_version) as content_version
from public.site_settings where id = 'default';
select status,count(*) as bookings from public.rental_bookings group by status order by status;
rollback;
