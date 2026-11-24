-- Restrict the checkout, payment verification and cancellation RPCs.
begin;

grant execute on function public.process_storefront_checkout(
  text, text, uuid, jsonb, jsonb, jsonb, text, text, text, text, timestamptz, text
) to service_role, postgres;
grant execute on function public.storefront_verify_razorpay_payment(
  text, text, text, text, bigint, text
) to service_role;
grant execute on function public.storefront_cancel_pending_order(text, text) to service_role;

-- Revoke client access on every installed signature, including legacy overloads.
do $restrict$
declare
  v_rpc record;
begin
  for v_rpc in
    select p.oid, p.oid::regprocedure as signature
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in (
        'process_storefront_checkout',
        'storefront_verify_razorpay_payment',
        'storefront_cancel_pending_order'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_rpc.signature);

    if has_function_privilege('anon', v_rpc.oid, 'execute')
      or has_function_privilege('authenticated', v_rpc.oid, 'execute') then
      raise exception 'Client role retains EXECUTE on %', v_rpc.signature;
    end if;
  end loop;

  if not has_function_privilege('service_role',
      'public.process_storefront_checkout(text,text,uuid,jsonb,jsonb,jsonb,text,text,text,text,timestamptz,text)', 'execute')
    or not has_function_privilege('service_role',
      'public.storefront_verify_razorpay_payment(text,text,text,text,bigint,text)', 'execute')
    or not has_function_privilege('service_role',
      'public.storefront_cancel_pending_order(text,text)', 'execute') then
    raise exception 'Service role lacks EXECUTE on an active checkout RPC';
  end if;
end;
$restrict$;

commit;
