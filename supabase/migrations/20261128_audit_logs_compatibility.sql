-- Keep the activity log contract aligned with active admin audit callers.
alter table public.activity_audit_logs
  add column if not exists user_agent text;

alter table public.activity_audit_logs
  drop constraint if exists activity_audit_logs_actor_role_check,
  add constraint activity_audit_logs_actor_role_check
    check (actor_role in ('owner', 'admin', 'staff', 'system'));

alter table public.activity_audit_logs
  drop constraint if exists activity_audit_logs_action_check,
  add constraint activity_audit_logs_action_check
    check (action in (
      'INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE',
      'ADMIN_LOGIN', 'ADMIN_LOGOUT', 'CHANGE_PASSWORD',
      'COUPON_CREATE', 'COUPON_UPDATE', 'COUPON_DELETE',
      'EVENT_CREATE', 'EVENT_UPDATE', 'EVENT_DELETE',
      'MEDIA_UPLOAD',
      'ORDER_STATUS_UPDATE', 'ORDER_PAYMENT_VERIFIED',
      'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DUPLICATE',
      'PRODUCT_BULK_PUBLISH', 'PRODUCT_BULK_UNPUBLISH', 'PRODUCT_BULK_ARCHIVE',
      'PRODUCT_BULK_CHANGECATEGORY', 'PRODUCT_BULK_DELETE',
      'PRODUCT_SOFT_DELETE', 'PRODUCT_RESTORE', 'PRODUCT_PERMANENT_DELETE',
      'SETTINGS_UPDATE',
      'RENTAL_CREATE', 'RENTAL_UPDATE', 'RENTAL_DELETE'
    ));

-- Existing row triggers snapshot whole records; strip credentials and customer
-- identifiers recursively before those snapshots are stored in the audit trail.
create or replace function public.fn_redact_audit_json(value jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb;
begin
  if value is null then
    return null;
  elsif jsonb_typeof(value) = 'object' then
    select coalesce(jsonb_object_agg(entry.key, public.fn_redact_audit_json(entry.value)), '{}'::jsonb)
      into result
      from jsonb_each(value) as entry(key, value)
      where not (
        regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like '%password%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like '%token%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like '%secret%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like '%authorization%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like '%cookie%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like '%servicerole%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like '%apikey%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') like 'customer%'
        or regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') in ('shippingaddress', 'billingaddress')
      );
    return result;
  elsif jsonb_typeof(value) = 'array' then
    select coalesce(jsonb_agg(public.fn_redact_audit_json(entry.value) order by entry.ordinality), '[]'::jsonb)
      into result
      from jsonb_array_elements(value) with ordinality as entry(value, ordinality);
    return result;
  end if;

  return value;
end;
$$;

create or replace function public.fn_activity_audit_log()
returns trigger
language plpgsql
security definer
as $$
declare
  rec_id text;
  old_data jsonb;
  new_data jsonb;
  act_type text;
begin
  if tg_op = 'DELETE' then
    rec_id := coalesce(old.id::text, '');
    old_data := public.fn_redact_audit_json(to_jsonb(old));
    new_data := null;
    act_type := 'DELETE';
  elsif tg_op = 'INSERT' then
    rec_id := coalesce(new.id::text, '');
    old_data := null;
    new_data := public.fn_redact_audit_json(to_jsonb(new));
    act_type := 'INSERT';
  else
    rec_id := coalesce(new.id::text, '');
    old_data := public.fn_redact_audit_json(to_jsonb(old));
    new_data := public.fn_redact_audit_json(to_jsonb(new));
    if old_data->>'status' is distinct from new_data->>'status' then
      act_type := 'STATUS_CHANGE';
    else
      act_type := 'UPDATE';
    end if;
  end if;

  insert into public.activity_audit_logs (
    actor_id, actor_role, actor_email, table_name, record_id, action,
    before_state, after_state
  ) values (
    coalesce(auth.uid()::text, 'service_role'),
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin'),
    auth.jwt() ->> 'email', tg_table_name, rec_id, act_type, old_data, new_data
  );

  return coalesce(new, old);
end;
$$;
