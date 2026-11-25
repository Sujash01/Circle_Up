-- Stage 4B.1. Apply after production preflight and schema backup.
-- This patch never changes settings values, orders, bookings, or admin accounts.
-- Rollback before commit: any error aborts the transaction. After commit,
-- roll back the application deployment first and preserve these additive tables
-- and columns so new booking, inquiry and audit records remain available.
-- A destructive schema rollback requires restoring reviewed object definitions
-- from the pre-change schema backup and a plan to retain post-cutover records.
begin;
set local lock_timeout = '5s';
set local search_path = pg_catalog, public, extensions;


-- Supply the privately reviewed value in this transaction, before the DO block:
-- set local circleup.stage4b_reviewed_rpc_fingerprint = '<reviewed fingerprint>';
-- No value is shipped in the patch.

do $preflight$
declare
  v_fingerprint text;
  v_requirement record;
  v_function pg_proc%rowtype;
  v_oid oid;
begin
  if not exists (select from pg_roles where rolname = 'service_role' and rolbypassrls)
    or not exists (select from pg_roles where rolname = 'anon')
    or not exists (select from pg_roles where rolname = 'authenticated') then
    raise exception 'Stage 4B preflight: expected Supabase API roles and service-role RLS bypass';
  end if;
  if to_regclass('cron.job') is not null then
    if not has_table_privilege(current_user,'cron.job','SELECT') then
      raise exception 'Stage 4B.1 preflight: deployment role must be able to inspect pg_cron jobs';
    end if;
    execute $cron$
      select count(*) from cron.job where active and database = current_database()
        and command ~* '(admin_release_expired_reservations|expire_stale_stock_reservations|expire-reservations|release-expired-holds)'
    $cron$ into v_requirement;
    if v_requirement.count > 0 then
      raise exception 'Stage 4B.1 preflight: pause active reservation-expiry pg_cron jobs before installation';
    end if;
  end if;
  if to_regnamespace('extensions') is null or not exists (select from pg_available_extensions where name = 'btree_gist') then
    raise exception 'Stage 4B preflight: extensions schema and btree_gist must be available';
  end if;
  if not has_schema_privilege(current_user,'public','CREATE')
    or (not exists (select from pg_extension where extname = 'btree_gist')
      and (not has_schema_privilege(current_user,'extensions','CREATE')
        or not has_database_privilege(current_user,current_database(),'CREATE'))) then
    raise exception 'Stage 4B preflight: deployment role lacks required schema or extension privileges';
  end if;
  if to_regprocedure('auth.role()') is null or not has_function_privilege('service_role','auth.role()','execute') then
    raise exception 'Stage 4B preflight: missing accessible auth.role()';
  end if;

  for v_requirement in select * from (values
    ('site_settings','id','text'),('site_settings','updated_at','timestamp with time zone'),
    ('site_settings','announcement_text','text'),('site_settings','announcement_link','text'),
    ('site_settings','is_announcement_active','boolean'),('site_settings','marquee_phrases','text[]'),
    ('site_settings','category_tiles','jsonb'),('site_settings','curated_drop','jsonb'),
    ('site_settings','store_address','text'),('site_settings','contact_email','text'),
    ('site_settings','contact_phone','text'),('site_settings','whatsapp_number','text'),
    ('admin_users','id','uuid'),('admin_users','role','text'),('admin_users','email','text'),
    ('admin_users','full_name','text'),('admin_users','is_active','boolean'),('admin_users','password_hash','text'),
    ('admin_auth_sessions','id','uuid'),('admin_auth_sessions','user_id','uuid'),
    ('admin_auth_sessions','token_hash','text'),('admin_auth_sessions','expires_at','timestamp with time zone'),
    ('admin_auth_sessions','revoked_at','timestamp with time zone'),
    ('orders','id','uuid'),('orders','order_number','text'),('orders','customer_id','uuid'),
    ('orders','customer_name','text'),('orders','customer_email','text'),('orders','customer_phone','text'),
    ('orders','status','text'),('orders','payment_status','text'),('orders','payment_method','text'),
    ('orders','razorpay_order_id','text'),('orders','razorpay_payment_id','text'),
    ('orders','total_amount','bigint'),('orders','utr_number','text'),('orders','shipping_address','jsonb'),
    ('orders','created_at','timestamp with time zone'),('order_items','id','uuid'),('order_items','order_id','uuid'),
    ('customers','id','uuid'),('customers','user_id','uuid'),('customers','full_name','text'),
    ('customers','email','text'),('customers','phone','text'),('customers','tier','text'),
    ('customers','saved_addresses','jsonb'),('customers','staff_notes','text'),
    ('customers','created_at','timestamp with time zone'),
    ('fulfillments','order_id','uuid'),('fulfillments','status','text'),
    ('fulfillments','shipped_at','timestamp with time zone'),('fulfillments','delivered_at','timestamp with time zone'),
    ('activity_audit_logs','id','uuid'),('activity_audit_logs','actor_id','text'),
    ('activity_audit_logs','actor_role','text'),('activity_audit_logs','actor_email','text'),
    ('activity_audit_logs','table_name','text'),('activity_audit_logs','record_id','text'),
    ('activity_audit_logs','action','text'),('activity_audit_logs','ip_address','text'),
    ('activity_audit_logs','before_state','jsonb'),('activity_audit_logs','after_state','jsonb'),
    ('activity_audit_logs','created_at','timestamp with time zone'),
    ('products','id','uuid'),('products','name','text'),('events','id','uuid'),
    ('events','date','timestamp with time zone'),('event_registrations','event_id','uuid'),
    ('rental_bookings','id','uuid'),('rental_bookings','product_id','uuid'),
    ('rental_bookings','customer_name','text'),('rental_bookings','customer_email','text'),
    ('rental_bookings','customer_phone','text'),('rental_bookings','size','text'),
    ('rental_bookings','start_date','date'),('rental_bookings','end_date','date'),
    ('rental_bookings','duration_days','integer'),('rental_bookings','status','text'),
    ('rental_bookings','rental_fee_paise','bigint'),('rental_bookings','security_deposit_paise','bigint'),
    ('rental_bookings','total_paise','bigint'),('rental_bookings','created_at','timestamp with time zone'),
    ('rental_catalog_items','id','uuid'),('rental_catalog_items','name','text'),('rental_catalog_items','size','text'),
    ('rental_catalog_items','is_available','boolean'),('rental_catalog_items','rental_price_3_days_paise','bigint'),
    ('rental_catalog_items','rental_price_7_days_paise','bigint'),('rental_catalog_items','rental_price_14_days_paise','bigint'),
    ('rental_catalog_items','security_deposit_paise','bigint'),('rate_limit_entries','key','text'),
    ('rate_limit_entries','hits','integer'),('rate_limit_entries','reset_at','timestamp with time zone'),
    ('rate_limit_entries','created_at','timestamp with time zone')
  ) r(table_name,column_name,data_type) loop
    if not exists (select from pg_class c join pg_attribute a on a.attrelid = c.oid
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and c.relname = v_requirement.table_name
        and a.attname = v_requirement.column_name and a.attnum > 0 and not a.attisdropped
        and format_type(a.atttypid,a.atttypmod) = v_requirement.data_type) then
      raise exception 'Stage 4B preflight: expected public.%.% (%)',v_requirement.table_name,v_requirement.column_name,v_requirement.data_type;
    end if;
  end loop;

  if exists (select from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relname in ('site_settings','activity_audit_logs','events','event_registrations','rental_bookings')
    and not pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'Stage 4B preflight: deployment role must own the affected tables or inherit their ownership';
  end if;
  for v_requirement in select * from (values
    ('orders','id'),('orders','order_number'),('rental_bookings','id'),('rental_catalog_items','id')
  ) r(table_name,column_name) loop
    if not exists (select from pg_index i join pg_attribute a on a.attrelid = i.indrelid
      and a.attname = v_requirement.column_name
      where i.indrelid = to_regclass(format('public.%I',v_requirement.table_name))
        and a.attnotnull and i.indisunique and i.indisvalid and i.indpred is null
        and i.indexprs is null and i.indnkeyatts = 1 and i.indkey[0] = a.attnum) then
      raise exception 'Stage 4B preflight: public.%.% must be a non-null unique identity',
        v_requirement.table_name,v_requirement.column_name;
    end if;
  end loop;
  for v_requirement in select * from (values
    ('orders','status'),('orders','payment_status'),('fulfillments','status')
  ) r(table_name,column_name) loop
    if not exists (select from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid
      and a.attname = v_requirement.column_name
      where c.conrelid = to_regclass(format('public.%I',v_requirement.table_name))
        and a.attnotnull and c.contype = 'c' and c.convalidated and a.attnum = any(c.conkey)) then
      raise exception 'Stage 4B preflight: missing validated lifecycle constraint for public.%.%',
        v_requirement.table_name,v_requirement.column_name;
    end if;
  end loop;

  for v_requirement in select * from (values
    ('site_settings','SELECT,UPDATE'),('admin_users','SELECT'),('admin_auth_sessions','SELECT'),
    ('orders','SELECT'),('order_items','SELECT'),('customers','SELECT'),('fulfillments','SELECT'),
    ('products','SELECT'),('events','SELECT,INSERT,UPDATE'),('event_registrations','SELECT,INSERT'),
    ('rental_catalog_items','SELECT,INSERT,UPDATE,DELETE')
  ) r(table_name,privileges) loop
    if exists (select from unnest(string_to_array(v_requirement.privileges,',')) h(privilege)
      where not has_table_privilege('service_role',format('public.%I',v_requirement.table_name),h.privilege)) then
      raise exception 'Stage 4B preflight: service_role lacks required table privileges on %',v_requirement.table_name;
    end if;
  end loop;

  -- The approved legacy production contract has these exact signatures.
  for v_requirement in select * from (values
    ('process_storefront_checkout(text,text,uuid,jsonb,jsonb,jsonb,text,text,text,text,timestamptz,text)','jsonb',null,null),
    ('storefront_cancel_pending_order(text,text)','boolean',null,null),
    ('storefront_verify_razorpay_payment(text,text,text,text)','jsonb',null,null),
    ('admin_release_expired_reservations(integer)','jsonb',null,null),
    ('admin_create_order_fulfillment(text,text,text,text,text,text,text,text,text)','jsonb',null,null),
    ('admin_mark_order_payment_received(text,text,text,text,text,text,text,text)','jsonb',null,null),
    ('increment_rate_limit(text,integer)','TABLE(total_hits integer, reset_at timestamp with time zone)',null,null),
    ('admin_update_order_status(text,text,text,text,text,text,text)','jsonb',
      'p_order_ref,p_new_status,p_actor_id,p_actor_email,p_actor_role,p_ip_address,p_user_agent',2),
    ('admin_get_crm_customers(integer,integer,text,text)','jsonb','p_page,p_limit,p_search,p_tier',4),
    ('admin_get_daily_reconciliation(integer)',
      'TABLE(reconciliation_date date, payment_method text, payment_status text, order_count bigint, total_paise bigint, verified_utr_count bigint)',
      'p_days,reconciliation_date,payment_method,payment_status,order_count,total_paise,verified_utr_count',1)
  ) r(signature,result,arg_names,default_count) loop
    v_oid := to_regprocedure('public.' || v_requirement.signature);
    if v_oid is null then
      raise exception 'Stage 4B preflight: missing public.%',v_requirement.signature;
    end if;
    select * into v_function from pg_proc where oid = v_oid;
    if pg_get_function_result(v_oid) is distinct from v_requirement.result
      or not v_function.prosecdef or v_function.proowner = 'service_role'::regrole
      or (v_requirement.arg_names is not null and
        (array_to_string(v_function.proargnames,',') is distinct from v_requirement.arg_names
          or v_function.pronargdefaults is distinct from v_requirement.default_count
          or pg_get_userbyid(v_function.proowner) <> current_user)) then
      raise exception 'Stage 4B preflight: incompatible result, arguments, defaults, or ownership/security mode for %',v_requirement.signature;
    end if;
    if has_function_privilege('anon',v_oid,'execute') or has_function_privilege('authenticated',v_oid,'execute')
      or not has_function_privilege('service_role',v_oid,'execute') then
      raise exception 'Stage 4B preflight: unexpected execute privileges on %',v_requirement.signature;
    end if;
  end loop;

  if exists (select from pg_proc where pronamespace = 'public'::regnamespace and proname in (
    'admin_update_order_status_before_stage4b','admin_cancel_order','admin_get_daily_reconciliation_evidence',
    'stage4b_increment_order_reauth_limit','admin_verify_order_payment',
    'submit_contact_inquiry','submit_rental_booking','admin_update_rental_booking'
  )) then
    raise exception 'Stage 4B preflight: modern payment or Stage 4B RPC already exists; review this baseline separately';
  end if;
  if to_regclass('public.inquiries') is not null then
    raise exception 'Stage 4B preflight: inquiries table already exists; validate its data and status constraint in a separate compatibility review';
  end if;
  if exists (select from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('admin_update_order_status','admin_get_crm_customers','admin_get_daily_reconciliation')
    group by p.proname having count(*) <> 1) then
    raise exception 'Stage 4B preflight: unexpected overload on a replaced admin RPC';
  end if;

  if (select count(*) from public.site_settings where id = 'default') <> 1 then
    raise exception 'Stage 4B preflight: expected exactly one existing site_settings default record';
  end if;

  for v_requirement in select * from (values
    ('site_settings','is_whatsapp_verified','boolean',true),
    ('site_settings','content_version','integer',true),
    ('activity_audit_logs','user_agent','text',false),
    ('events','date_label','text',false),
    ('event_registrations','notes','text',true),
    ('orders','is_reservation_held','boolean',true)
  ) r(table_name,column_name,data_type,not_null) loop
    if exists (select from pg_attribute a
      where a.attrelid = to_regclass(format('public.%I',v_requirement.table_name))
        and a.attname = v_requirement.column_name and not a.attisdropped
        and (format_type(a.atttypid,a.atttypmod) <> v_requirement.data_type
          or a.attnotnull is distinct from v_requirement.not_null)) then
      raise exception 'Stage 4B preflight: incompatible existing public.%.%',v_requirement.table_name,v_requirement.column_name;
    end if;
  end loop;
  for v_requirement in select * from (values
    ('activity_audit_logs','id'),('activity_audit_logs','created_at'),
    ('rental_bookings','id'),('rental_bookings','created_at'),('rate_limit_entries','created_at')
  ) r(table_name,column_name) loop
    if not exists (select from pg_attribute a where a.attrelid = to_regclass(format('public.%I',v_requirement.table_name))
      and a.attname = v_requirement.column_name and a.attnotnull and a.atthasdef and not a.attisdropped) then
      raise exception 'Stage 4B preflight: public.%.% must be non-null with a default',v_requirement.table_name,v_requirement.column_name;
    end if;
  end loop;

  if not exists (select from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attname = 'key'
    where i.indrelid = 'public.rate_limit_entries'::regclass and i.indisunique and i.indisvalid
      and i.indpred is null and i.indexprs is null and i.indnkeyatts = 1 and i.indkey[0] = a.attnum)
    or exists (select from pg_trigger t where t.tgrelid = 'public.rate_limit_entries'::regclass
      and not t.tgisinternal and t.tgenabled <> 'D') then
    raise exception 'Stage 4B preflight: rate limit storage needs an unconditional unique key and no custom write triggers';
  end if;

  -- Freeze writes before checking legacy rental data and installing constraints.
  lock table public.rental_bookings in share row exclusive mode;
  if exists (select from pg_attribute where attrelid = 'public.rental_bookings'::regclass
    and attname = 'rental_catalog_id' and not attisdropped) then
    raise exception 'Stage 4B preflight: unexpected existing rental_catalog_id';
  end if;
  if (select count(*) from pg_constraint c where c.conrelid = 'public.rental_bookings'::regclass
    and c.contype = 'f' and c.confrelid = 'public.products'::regclass and c.convalidated
    and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'product_id')]::smallint[]
    and c.confkey = array[(select attnum from pg_attribute where attrelid = c.confrelid and attname = 'id')]::smallint[]) <> 1 then
    raise exception 'Stage 4B preflight: rental_bookings must have one validated product_id FK to products.id';
  end if;
  if (select count(*) from pg_attribute where attrelid = 'public.rental_bookings'::regclass
    and attname in ('product_id','status','start_date','end_date') and attnotnull and not attisdropped) <> 4
    or not exists (select from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = 'public.rental_bookings'::regclass and a.attname = 'status'
        and pg_get_expr(d.adbin,d.adrelid) = '''REQUESTED''::text')
    or not exists (select from pg_constraint c where c.conrelid = 'public.rental_bookings'::regclass
      and c.contype = 'c' and c.convalidated
      and pg_get_expr(c.conbin,c.conrelid) = '(status = ANY (ARRAY[''REQUESTED''::text, ''CONFIRMED''::text, ''ACTIVE''::text, ''RETURNED''::text, ''CANCELLED''::text]))') then
    raise exception 'Stage 4B preflight: legacy rental status constraint/default or required nullability differs';
  end if;
  if exists (select from public.rental_bookings b left join public.products p on p.id = b.product_id
    where p.id is null or not isfinite(b.start_date) or not isfinite(b.end_date) or b.end_date < b.start_date) then
    raise exception 'Stage 4B preflight: invalid legacy rental links or date ranges require review';
  end if;
  if exists (select from public.rental_bookings a join public.rental_bookings b
    on a.id < b.id and a.product_id = b.product_id and a.start_date <= b.end_date and b.start_date <= a.end_date
    where a.status in ('CONFIRMED','ACTIVE') and b.status in ('CONFIRMED','ACTIVE')) then
    raise exception 'Stage 4B preflight: overlapping legacy bookings require review';
  end if;

  if exists (select from pg_trigger t where t.tgrelid = 'public.site_settings'::regclass
    and t.tgname = 'trg_site_settings_bump_version'
    and (t.tgfoid is distinct from to_regprocedure('public.fn_site_settings_bump_version()') or t.tgenabled <> 'O')) then
    raise exception 'Stage 4B preflight: unexpected existing settings version trigger';
  end if;
  if exists (select from pg_proc p where p.oid = to_regprocedure('public.fn_site_settings_bump_version()')
    and (p.prorettype <> 'trigger'::regtype or pg_get_userbyid(p.proowner) <> current_user)) then
    raise exception 'Stage 4B preflight: incompatible settings trigger function';
  end if;

  select md5(coalesce(string_agg(part,E'\n' order by part),'')) into v_fingerprint
  from (
    select p.oid::regprocedure::text || ':' || pg_get_userbyid(p.proowner) || ':' ||
      coalesce(p.proacl::text,'DEFAULT') || ':' || pg_get_functiondef(p.oid) as part
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in (
      'process_storefront_checkout','storefront_cancel_pending_order','storefront_verify_razorpay_payment',
      'admin_release_expired_reservations','expire_stale_stock_reservations','admin_authorize_reservation_release',
      'admin_create_order_fulfillment','admin_mark_order_payment_received','admin_verify_order_payment',
      'admin_process_order_refund','admin_update_order_status','admin_get_crm_customers',
      'admin_get_daily_reconciliation','increment_rate_limit','fn_site_settings_bump_version'
    )
    union all
    select t.tgrelid::regclass::text || ':' || t.tgenabled::text || ':' || pg_get_triggerdef(t.oid)
      || ':' || pg_get_functiondef(t.tgfoid)
    from pg_trigger t where not t.tgisinternal and t.tgrelid in (
      'public.site_settings'::regclass,'public.orders'::regclass,'public.fulfillments'::regclass,
      'public.products'::regclass,'public.rental_bookings'::regclass,'public.activity_audit_logs'::regclass,
      'public.rate_limit_entries'::regclass
    )
    union all
    select c.conrelid::regclass::text || ':' || c.conname || ':' || c.convalidated::text || ':' || pg_get_constraintdef(c.oid)
    from pg_constraint c where c.conrelid in (
      'public.site_settings'::regclass,'public.orders'::regclass,'public.fulfillments'::regclass,
      'public.rental_bookings'::regclass,'public.rental_catalog_items'::regclass,'public.activity_audit_logs'::regclass,
      'public.rate_limit_entries'::regclass
    )
  ) contract;
  if current_setting('circleup.stage4b_reviewed_rpc_fingerprint',true) is distinct from v_fingerprint then
    raise exception 'Stage 4B preflight: compare the installed RPC definitions and supply their privately reviewed fingerprint before deployment';
  end if;
end;
$preflight$;

create extension if not exists btree_gist with schema extensions;

alter table public.site_settings
  add column if not exists is_whatsapp_verified boolean not null default false,
  add column if not exists content_version integer not null default 1 check (content_version >= 1);

create or replace function public.fn_site_settings_bump_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.content_version := old.content_version + 1; end if;
  return new;
end;
$$;
drop trigger if exists trg_site_settings_bump_version on public.site_settings;
create trigger trg_site_settings_bump_version before update on public.site_settings
for each row execute function public.fn_site_settings_bump_version();

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  email text not null check (length(trim(email)) between 3 and 255),
  subject text not null default 'General Inquiry' check (length(trim(subject)) between 1 and 200),
  message text not null check (length(trim(message)) between 1 and 5000),
  status text not null default 'NEW' check (status in ('NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.inquiries
  add column if not exists phone text,
  add column if not exists category text not null default 'general',
  add column if not exists notes text,
  add column if not exists reply text,
  add column if not exists replied_at timestamptz;
create index if not exists idx_stage4b_inquiries_email_created on public.inquiries (lower(email), created_at desc);
create index if not exists idx_inquiries_created_at on public.inquiries (created_at desc);
alter table public.inquiries enable row level security;
revoke all on public.inquiries from public, anon, authenticated;
grant select, insert, update on public.inquiries to service_role;

create or replace function public.submit_contact_inquiry(p_name text, p_email text, p_subject text, p_message text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_row public.inquiries%rowtype;
  v_email text := lower(trim(p_email));
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended('contact:' || v_email, 0));
  select * into v_row from public.inquiries
  where lower(email) = v_email and subject = p_subject and message = p_message
    and created_at >= now() - interval '15 minutes'
  order by created_at desc limit 1;
  if not found then
    insert into public.inquiries (name,email,subject,message)
    values (p_name,v_email,p_subject,p_message) returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.submit_contact_inquiry(text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_contact_inquiry(text,text,text,text) to service_role;

alter table public.activity_audit_logs add column if not exists user_agent text;
alter table public.activity_audit_logs enable row level security;
revoke all on public.activity_audit_logs from public, anon, authenticated;
grant select, insert on public.activity_audit_logs to service_role;

alter table public.events add column if not exists date_label text, alter column date drop not null;
alter table public.event_registrations add column if not exists notes text not null default '';

-- Keep any production-specific accepted values while admitting existing CRM audit events.
do $$
declare
  v_expression text;
begin
  select pg_get_expr(conbin,conrelid) into v_expression from pg_constraint
  where conrelid = 'public.activity_audit_logs'::regclass and conname = 'activity_audit_logs_action_check';
  if v_expression is not null and strpos(v_expression,'RENTAL_BOOKING_UPDATE') = 0 then
    alter table public.activity_audit_logs drop constraint activity_audit_logs_action_check;
    execute format('alter table public.activity_audit_logs add constraint activity_audit_logs_action_check
      check ((%s) or action in (
        ''ADMIN_LOGIN'',''ADMIN_LOGOUT'',''CHANGE_PASSWORD'',''ADMIN_USER_CREATE'',''ADMIN_USER_UPDATE'',
        ''COUPON_CREATE'',''COUPON_UPDATE'',''COUPON_DELETE'',''EVENT_CREATE'',''EVENT_UPDATE'',''EVENT_DELETE'',
        ''MEDIA_UPLOAD'',''MEDIA_DELETE'',''ORDER_STATUS_UPDATE'',''ORDER_PAYMENT_VERIFIED'',
        ''PRODUCT_CREATE'',''PRODUCT_UPDATE'',''PRODUCT_DUPLICATE'',''PRODUCT_BULK_PUBLISH'',
        ''PRODUCT_BULK_UNPUBLISH'',''PRODUCT_BULK_ARCHIVE'',''PRODUCT_BULK_CHANGECATEGORY'',''PRODUCT_BULK_DELETE'',
        ''PRODUCT_SOFT_DELETE'',''PRODUCT_RESTORE'',''PRODUCT_PERMANENT_DELETE'',''SETTINGS_UPDATE'',
        ''RENTAL_CREATE'',''RENTAL_UPDATE'',''RENTAL_DELETE'',''RENTAL_BOOKING_UPDATE''))', v_expression);
  end if;
  select pg_get_expr(conbin,conrelid) into v_expression from pg_constraint
  where conrelid = 'public.activity_audit_logs'::regclass and conname = 'activity_audit_logs_actor_role_check';
  if v_expression is not null and strpos(v_expression,'staff') = 0 then
    alter table public.activity_audit_logs drop constraint activity_audit_logs_actor_role_check;
    execute format('alter table public.activity_audit_logs add constraint activity_audit_logs_actor_role_check
      check ((%s) or actor_role = ''staff'')', v_expression);
  end if;
end;
$$;

-- Keep the legacy FK valid, including when a product is permanently deleted.
do $$
declare v_fk name;
begin
  select conname into strict v_fk from pg_constraint
  where conrelid = 'public.rental_bookings'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute
      where attrelid = 'public.rental_bookings'::regclass and attname = 'product_id')]::smallint[];
  execute format('alter table public.rental_bookings drop constraint %I', v_fk);
  execute format('alter table public.rental_bookings add constraint %I foreign key (product_id) references public.products(id) on delete restrict', v_fk);
end;
$$;
alter table public.rental_bookings
  alter column product_id drop not null,
  add column if not exists rental_catalog_id uuid references public.rental_catalog_items(id) on delete restrict,
  add column if not exists notes text,
  add constraint stage4b_rental_exactly_one_item check (num_nonnulls(product_id,rental_catalog_id) = 1),
  add constraint stage4b_rental_valid_dates check (isfinite(start_date) and isfinite(end_date) and end_date >= start_date),
  add constraint stage4b_rental_catalog_no_overlap
    exclude using gist (rental_catalog_id with =, daterange(start_date,end_date,'[]') with &&)
    where (rental_catalog_id is not null and status in ('CONFIRMED','ACTIVE')),
  add constraint stage4b_rental_legacy_no_overlap
    exclude using gist (product_id with =, daterange(start_date,end_date,'[]') with &&)
    where (product_id is not null and status in ('CONFIRMED','ACTIVE'));
create index if not exists idx_rental_bookings_catalog_dates
  on public.rental_bookings (rental_catalog_id,start_date,end_date);
alter table public.rental_bookings enable row level security;
revoke all on public.rental_bookings from public, anon, authenticated;
grant select, insert, update on public.rental_bookings to service_role;

-- Catalog bookings use a new FK. Existing bookings retain their original product FK.
create or replace function public.submit_rental_booking(
  p_catalog_id uuid, p_name text, p_email text, p_phone text, p_size text,
  p_start date, p_end date, p_notes text
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_item public.rental_catalog_items%rowtype;
  v_booking public.rental_bookings%rowtype;
  v_days integer := p_end - p_start + 1;
  v_fee bigint;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  select * into v_item from public.rental_catalog_items where id = p_catalog_id for update;
  if not found or not v_item.is_available then raise exception 'RENTAL_UNAVAILABLE' using errcode = 'P0002'; end if;
  if p_start is null or p_end is null or p_start < (now() at time zone 'Asia/Kolkata')::date
    or v_days not between 3 and 14 or p_size is distinct from v_item.size then
    raise exception 'INVALID_RENTAL_BOOKING' using errcode = '22023';
  end if;
  if exists (select from public.rental_bookings
    where rental_catalog_id = p_catalog_id and status in ('CONFIRMED','ACTIVE')
      and start_date <= p_end and end_date >= p_start) then
    raise exception 'RENTAL_DATES_UNAVAILABLE' using errcode = '23P01';
  end if;
  v_fee := case v_days
    when 3 then v_item.rental_price_3_days_paise
    when 7 then v_item.rental_price_7_days_paise
    when 14 then v_item.rental_price_14_days_paise
    else round(v_item.rental_price_3_days_paise::numeric / 3)::bigint * v_days
  end;
  select * into v_booking from public.rental_bookings
  where rental_catalog_id = p_catalog_id and start_date = p_start and end_date = p_end
    and customer_phone = p_phone and lower(customer_name) = lower(p_name)
    and status = 'REQUESTED' order by created_at desc limit 1;
  if not found then
    insert into public.rental_bookings
      (rental_catalog_id, customer_name, customer_email, customer_phone, size,
       start_date,end_date,duration_days,rental_fee_paise,security_deposit_paise,total_paise,notes)
    values (p_catalog_id,p_name,coalesce(p_email,''),p_phone,p_size,p_start,p_end,v_days,
      v_fee,v_item.security_deposit_paise,v_fee + v_item.security_deposit_paise,p_notes)
    returning * into v_booking;
  end if;
  return to_jsonb(v_booking) || jsonb_build_object('product_name',v_item.name);
end;
$$;
revoke all on function public.submit_rental_booking(uuid,text,text,text,text,date,date,text) from public, anon, authenticated;
grant execute on function public.submit_rental_booking(uuid,text,text,text,text,date,date,text) to service_role;

create or replace function public.admin_update_rental_booking(p_id uuid, p_status text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_booking public.rental_bookings%rowtype;
  v_name text;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  select * into v_booking from public.rental_bookings where id = p_id for update;
  if not found then raise exception 'RENTAL_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_booking.rental_catalog_id is not null then
    select name into v_name from public.rental_catalog_items where id = v_booking.rental_catalog_id for update;
  elsif v_booking.product_id is not null then
    select name into v_name from public.products where id = v_booking.product_id for update;
  end if;
  if p_status is distinct from v_booking.status then
    if not coalesce((v_booking.status = 'REQUESTED' and p_status in ('CONFIRMED','CANCELLED'))
      or (v_booking.status = 'CONFIRMED' and p_status in ('ACTIVE','CANCELLED'))
      or (v_booking.status = 'ACTIVE' and p_status = 'RETURNED'), false) then
      raise exception 'INVALID_RENTAL_TRANSITION' using errcode = '22023';
    end if;
    if p_status in ('CONFIRMED','ACTIVE') and exists (
      select from public.rental_bookings b
      where b.id <> p_id and b.status in ('CONFIRMED','ACTIVE')
        and (b.rental_catalog_id = v_booking.rental_catalog_id or b.product_id = v_booking.product_id)
        and b.start_date <= v_booking.end_date and b.end_date >= v_booking.start_date
    ) then raise exception 'RENTAL_DATES_UNAVAILABLE' using errcode = '23P01'; end if;
    update public.rental_bookings set status = p_status where id = p_id returning * into v_booking;
  end if;
  return to_jsonb(v_booking) || jsonb_build_object('product_name',v_name);
end;
$$;
revoke all on function public.admin_update_rental_booking(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_update_rental_booking(uuid,text) to service_role;

create or replace function public.admin_get_crm_customers(
  p_page integer default 1, p_limit integer default 20, p_search text default null, p_tier text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_page integer := greatest(1, least(coalesce(p_page,1),1000000));
  v_limit integer := greatest(1, least(coalesce(p_limit,20),100));
  v_offset integer := (v_page - 1) * v_limit;
  v_search text := nullif(lower(trim(p_search)), '');
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  with customer_orders as (
    select o.*, coalesce(c.id::text,
      'auth_' || o.customer_id::text, 'guest_' || md5(lower(trim(o.customer_email)))) as identity
    from public.orders o
    left join lateral (
      select c.id from public.customers c
      where (o.customer_id is not null and (o.customer_id = c.user_id or o.customer_id = c.id))
         or (o.customer_id is null and lower(trim(c.email)) = lower(trim(o.customer_email)))
      order by c.created_at, c.id limit 1
    ) c on true
  ), totals as (
    select identity, min(created_at) as first_order, max(created_at) as last_order,
      count(*) filter (where status <> 'CANCELLED') as total_orders,
      coalesce(sum(total_amount) filter (where payment_status = 'PAID' and status not in ('CANCELLED','REFUNDED')),0) as spend
    from customer_orders where identity is not null group by identity
  ), latest as (
    select distinct on (identity) identity, customer_name, customer_email, customer_phone, shipping_address
    from customer_orders where identity is not null order by identity, created_at desc, id desc
  ), customers as (
    select coalesce(c.id::text,t.identity) as id,
      coalesce(c.full_name,l.customer_name,'Customer') as name,
      coalesce(c.email,l.customer_email,'') as email,
      coalesce(c.phone,l.customer_phone,'') as phone,
      coalesce(t.total_orders,0) as "totalOrders", coalesce(t.spend,0) as "totalSpendInPaise",
      t.first_order as "firstOrderAt", t.last_order as "lastOrderAt",
      coalesce(c.created_at,t.first_order) as "createdAt",
      coalesce(c.tier,case when t.spend >= 1000000 then 'VIP' when t.total_orders >= 2 then 'REGULAR' else 'NEW' end) as tier,
      c.staff_notes as notes,
      coalesce(l.shipping_address,c.saved_addresses->0)->>'city' as city,
      coalesce(l.shipping_address,c.saved_addresses->0)->>'state' as state,
      coalesce(l.shipping_address,c.saved_addresses->0)->>'postalCode' as "postalCode",
      coalesce(l.shipping_address,c.saved_addresses->0)->>'addressLine' as "addressLine"
    from public.customers c
    full join totals t on c.id::text = t.identity
    left join latest l on t.identity = l.identity
  ), filtered as (
    select * from customers c
    where (p_tier is null or p_tier in ('all','') or c.tier = p_tier)
      and (v_search is null or strpos(lower(concat_ws(' ',c.name,c.email,c.phone,c.city,c.notes)),v_search) > 0)
  ), paged as (
    select *, coalesce("lastOrderAt","createdAt") as sort_at from filtered
    order by sort_at desc nulls last, id limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'customers', (select coalesce(jsonb_agg(to_jsonb(paged) - 'sort_at' order by sort_at desc nulls last,id),'[]') from paged),
    'meta', jsonb_build_object('page',v_page,'limit',v_limit,'total',n,
      'totalPages',greatest(1,ceil(n::numeric/v_limit)), 'hasNext',v_offset+v_limit<n))
  into v_result from (select count(*) n from filtered) counts;
  return v_result;
end;
$$;
revoke all on function public.admin_get_crm_customers(integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.admin_get_crm_customers(integer,integer,text,text) to service_role;

create or replace function public.admin_get_daily_reconciliation(p_days integer default 30)
returns table (
  reconciliation_date date, payment_method text, payment_status text,
  order_count bigint, total_paise bigint, verified_utr_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  return query
  select (o.created_at at time zone 'Asia/Kolkata')::date, o.payment_method, o.payment_status,
    count(*), sum(o.total_amount)::bigint, 0::bigint
  from public.orders o
  where o.created_at >= now() - make_interval(days => greatest(1,least(365,coalesce(p_days,30))))
  group by 1,2,3
  order by 1 desc,2,3;
end;
$$;
revoke all on function public.admin_get_daily_reconciliation(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_reconciliation(integer) to service_role;

-- Keep the installed status function for ordinary lifecycle actions, while removing
-- direct service-role access to its legacy cancellation branch.
do $$
begin
  if to_regprocedure('public.admin_update_order_status_before_stage4b(text,text,text,text,text,text,text)') is null then
    alter function public.admin_update_order_status(text,text,text,text,text,text,text)
      rename to admin_update_order_status_before_stage4b;
  end if;
end;
$$;
revoke all on function public.admin_update_order_status_before_stage4b(text,text,text,text,text,text,text)
from public, anon, authenticated, service_role;
create or replace function public.admin_update_order_status(
  p_order_ref text, p_new_status text, p_actor_id text, p_actor_email text, p_actor_role text,
  p_ip_address text default null, p_user_agent text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  if upper(trim(p_new_status)) in ('CANCELLED','RETURNED','REFUNDED') then
    raise exception '%', jsonb_build_object('code','VALIDATION_ERROR','message','Use the authorized cancellation, return, or refund review workflow.')::text;
  end if;
  return public.admin_update_order_status_before_stage4b(
    p_order_ref,p_new_status,p_actor_id,p_actor_email,p_actor_role,p_ip_address,p_user_agent);
end;
$$;
revoke all on function public.admin_update_order_status(text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_update_order_status(text,text,text,text,text,text,text) to service_role;

create or replace function public.admin_cancel_order(
  p_order_ref text, p_reason text, p_actor_id uuid, p_ip_address text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_actor_email text;
  v_old_status text;
  v_outcome text;
  v_refund_required boolean;
  v_items jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  select email into v_actor_email from public.admin_users
  where id = p_actor_id and role = 'owner' and is_active for share;
  if not found then
    raise exception '%', jsonb_build_object('code','FORBIDDEN','message','An active Owner is required.')::text;
  end if;
  if p_order_ref is null or coalesce(length(trim(p_reason)),0) not between 1 and 1000 then
    raise exception '%', jsonb_build_object('code','VALIDATION_ERROR','message','A cancellation reason is required.')::text;
  end if;
  select * into v_order from public.orders
  where id::text = lower(trim(p_order_ref)) or order_number = upper(trim(p_order_ref)) for update;
  if not found then raise exception '%', jsonb_build_object('code','ORDER_NOT_FOUND','message','Order was not found.')::text; end if;

  v_old_status := v_order.status;
  v_refund_required := v_order.payment_status in ('PAID','PARTIALLY_REFUNDED');
  if v_old_status = 'CANCELLED' then
    v_outcome := 'CANCELLED';
  elsif v_old_status in ('RETURNED','REFUNDED') then
    raise exception '%', jsonb_build_object('code','ORDER_CONFLICT','message','This order has reached a terminal state.')::text;
  elsif v_old_status in ('SHIPPED','OUT_FOR_DELIVERY','DELIVERED','RETURN_REQUESTED') or exists (
    select from public.fulfillments where order_id = v_order.id
      and (shipped_at is not null or delivered_at is not null or status in ('SHIPPED','OUT_FOR_DELIVERY','DELIVERED'))
  ) then
    v_outcome := 'RETURN_REVIEW';
  elsif v_old_status not in ('PENDING','CONFIRMED','PROCESSING','PACKED') then
    raise exception '%', jsonb_build_object('code','ORDER_CONFLICT','message','This order has reached a terminal state.')::text;
  elsif (to_jsonb(v_order)->>'is_reservation_held')::boolean is true
    or v_order.razorpay_order_id is not null or v_order.razorpay_payment_id is not null
    or v_order.payment_method in ('RAZORPAY','ONLINE_UPI') then
    v_outcome := 'PAYMENT_REVIEW';
  else
    -- Neither an order line, a checkout idempotency row nor a reservation flag
    -- is a durable debit/release ledger. Preserve the order and inventory until
    -- every writer can prove and atomically consume the same stock movement.
    v_outcome := 'INVENTORY_REVIEW';
  end if;

  if v_old_status <> 'CANCELLED' and not exists (
    select from public.activity_audit_logs where table_name = 'Order' and record_id = v_order.id::text
      and action = 'ORDER_STATUS_UPDATE' and after_state->>'cancellationOutcome' = v_outcome
      and after_state->>'status' = v_order.status and after_state->>'paymentStatus' = v_order.payment_status
  ) then
    insert into public.activity_audit_logs
      (actor_id,actor_email,actor_role,table_name,record_id,action,ip_address,before_state,after_state)
    values (p_actor_id::text,v_actor_email,'owner','Order',v_order.id::text,'ORDER_STATUS_UPDATE',p_ip_address,
      jsonb_build_object('status',v_old_status,'paymentStatus',v_order.payment_status),
      jsonb_build_object('orderNumber',v_order.order_number,'status',v_order.status,
        'paymentStatus',v_order.payment_status,'refundRequired',v_refund_required,
        'refundStatus',case when v_refund_required then 'RECONCILIATION_REQUIRED'
          when v_order.payment_status = 'REFUNDED' then 'PREVIOUSLY_REFUNDED'
          else 'PAYMENT_EVIDENCE_UNRECONCILED' end,
        'cancellationOutcome',v_outcome,'reason',trim(p_reason),'inventory','[]'::jsonb));
  end if;
  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]') into v_items
    from public.order_items oi where oi.order_id = v_order.id;
  return jsonb_build_object('outcome',v_outcome,'refund_required',v_refund_required,
    'order',to_jsonb(v_order),'order_items',v_items);
end;
$$;
revoke all on function public.admin_cancel_order(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_cancel_order(text,text,uuid,text) to service_role;

-- Dedicated distributed password-attempt limit. Upsert uses the locked row's
-- current expiry, with a timestamptz clock and no delete-then-insert window.
create function public.stage4b_increment_order_reauth_limit(p_key text, p_window_ms integer)
returns table (total_hits integer, reset_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  if p_key is null or p_key !~ '^admin_order_reauth:[0-9a-f-]{36}$'
     or p_window_ms is distinct from 900000 then
    raise exception 'Invalid order reauthentication rate limit key or window' using errcode = '22023';
  end if;
  return query
  insert into public.rate_limit_entries as entry (key,hits,reset_at)
  values (p_key,1,statement_timestamp() + interval '15 minutes')
  on conflict (key) do update
    set hits = case when entry.reset_at <= statement_timestamp() then 1 else least(entry.hits,5) + 1 end,
        reset_at = case when entry.reset_at <= statement_timestamp() then excluded.reset_at else entry.reset_at end
  returning entry.hits,entry.reset_at;
end;
$$;
revoke all on function public.stage4b_increment_order_reauth_limit(text,integer) from public, anon, authenticated;
grant execute on function public.stage4b_increment_order_reauth_limit(text,integer) to service_role;

-- This release has no reconciled payment or settlement evidence source.
-- Preserve the legacy report's output signature and offer additive, explicit
-- evidence fields to the new API. A legacy PAID flag is an order-state label.
create function public.admin_get_daily_reconciliation_evidence(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
    'order_value_paise',r.total_paise,
    'confirmed_payment_paise',null::bigint,
    'verified_refund_paise',null::bigint,
    'net_settled_revenue_paise',null::bigint,
    'evidence_status','UNAVAILABLE',
    'verified_utr_count',null::bigint
  ) order by r.reconciliation_date desc,r.payment_method,r.payment_status),'[]'::jsonb)
  from public.admin_get_daily_reconciliation(p_days) r;
$$;
revoke all on function public.admin_get_daily_reconciliation_evidence(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_reconciliation_evidence(integer) to service_role;

-- Defer legacy money and stock writers to Stage 4B.2. Preserve the installed
-- definitions for review and keep their application grants closed at cutover.
do $revoke_legacy$
declare v_rpc oid;
begin
  for v_rpc in select oid from pg_proc where pronamespace = 'public'::regnamespace
    and proname in (
      'admin_update_order_status_before_stage4b','admin_mark_order_payment_received',
      'admin_process_order_refund','storefront_finalize_order_refund',
      'admin_record_physical_return_inspection','admin_authorize_reservation_release',
      'admin_release_expired_reservations','expire_stale_stock_reservations','storefront_cancel_pending_order'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',v_rpc::regprocedure);
    if has_function_privilege('anon',v_rpc,'execute') or has_function_privilege('authenticated',v_rpc,'execute')
      or has_function_privilege('service_role',v_rpc,'execute') then
      raise exception 'Stage 4B: inherited execute grant remains on %',v_rpc::regprocedure;
    end if;
  end loop;
end;
$revoke_legacy$;

do $check_private$
declare v_rpc oid;
begin
  for v_rpc in select oid from pg_proc where pronamespace = 'public'::regnamespace and proname in (
    'admin_update_order_status','admin_cancel_order','admin_get_crm_customers',
    'admin_get_daily_reconciliation','admin_get_daily_reconciliation_evidence',
    'stage4b_increment_order_reauth_limit','submit_contact_inquiry','submit_rental_booking','admin_update_rental_booking'
  ) loop
    if not has_function_privilege('service_role',v_rpc,'execute')
      or has_function_privilege('anon',v_rpc,'execute') or has_function_privilege('authenticated',v_rpc,'execute') then
      raise exception 'Stage 4B: unsafe effective execute grants on %',v_rpc::regprocedure;
    end if;
  end loop;
end;
$check_private$;

notify pgrst, 'reload schema';
commit;
