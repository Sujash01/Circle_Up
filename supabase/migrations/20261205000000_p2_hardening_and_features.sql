-- ==============================================================================
-- CircleUp Migration: P2 Hardening & Features
-- 1. Atomic event registration locking capacity and unique email
-- 2. UTR number & payment proof capture on orders + payment verification RPC
-- 3. Daily payment reconciliation aggregate RPC
-- 4. Admin order refund processing with stock restock support
-- 5. Admin fulfillment creation with order status update
-- 6. Marketing newsletter subscriptions with consent and unsubscribe tracking
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Atomic Event Registration
-- ------------------------------------------------------------------------------
create unique index if not exists idx_event_reg_unique_email
  on public.event_registrations (event_id, lower(email));

create or replace function public.register_for_event_atomic(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_reg public.event_registrations%rowtype;
  v_clean_email text;
  v_clean_name text;
  v_clean_phone text;
begin
  if p_event_id is null then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Event ID is required.')::text using errcode = '22023';
  end if;

  v_clean_email := lower(trim(coalesce(p_email, '')));
  v_clean_name := trim(coalesce(p_name, ''));
  v_clean_phone := trim(coalesce(p_phone, ''));

  if length(v_clean_name) < 2 or length(v_clean_name) > 100 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Name must contain 2 to 100 characters.')::text using errcode = '22023';
  end if;
  if v_clean_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Valid email address is required.')::text using errcode = '22023';
  end if;
  if length(v_clean_phone) < 7 or length(v_clean_phone) > 20 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Valid phone number is required.')::text using errcode = '22023';
  end if;

  -- Acquire exclusive row lock on the event to prevent concurrent registration race conditions
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception '%', jsonb_build_object('code', 'EVENT_NOT_FOUND', 'message', 'Event was not found.')::text using errcode = 'P0002';
  end if;

  if not v_event.is_registration_open then
    raise exception '%', jsonb_build_object('code', 'EVENT_REGISTRATION_CLOSED', 'message', 'Registration for this event is closed.')::text using errcode = 'P0001';
  end if;

  if v_event.capacity is not null and v_event.registered_count >= v_event.capacity then
    raise exception '%', jsonb_build_object('code', 'EVENT_CAPACITY_REACHED', 'message', 'This event has reached full capacity.')::text using errcode = 'P0001';
  end if;

  -- Check duplicate registration
  if exists (
    select 1 from public.event_registrations
    where event_id = p_event_id and lower(email) = v_clean_email
  ) then
    raise exception '%', jsonb_build_object('code', 'DUPLICATE_REGISTRATION', 'message', 'A registration for this email has already been received for this event.')::text using errcode = '23505';
  end if;

  -- Insert registration
  insert into public.event_registrations (
    event_id, name, email, phone, notes
  ) values (
    p_event_id, v_clean_name, v_clean_email, v_clean_phone, coalesce(trim(p_notes), '')
  )
  returning * into v_reg;

  -- Increment registered_count atomically
  update public.events
  set registered_count = registered_count + 1,
      updated_at = timezone('utc'::text, now())
  where id = p_event_id;

  return jsonb_build_object(
    'id', v_reg.id,
    'eventId', v_reg.event_id,
    'eventTitle', v_event.title,
    'name', v_reg.name,
    'email', v_reg.email,
    'phone', v_reg.phone,
    'notes', nullif(v_reg.notes, ''),
    'createdAt', v_reg.created_at
  );
end;
$$;

revoke all on function public.register_for_event_atomic(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_for_event_atomic(uuid, text, text, text, text) to service_role;

-- ------------------------------------------------------------------------------
-- 2. UTR Number, Payment Proof & Marketing Consent on Orders
-- ------------------------------------------------------------------------------
alter table public.orders
  add column if not exists utr_number text,
  add column if not exists payment_proof_url text,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;

-- Update admin_mark_order_payment_received to capture UTR & proof
create or replace function public.admin_mark_order_payment_received(
  p_order_ref text,
  p_actor_id text,
  p_actor_email text,
  p_actor_role text,
  p_ip_address text default null,
  p_user_agent text default null,
  p_utr_number text default null,
  p_payment_proof_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin order operation is not authorized.')::text using errcode = '42501';
  end if;
  if p_order_ref is null or length(trim(p_order_ref)) not between 8 and 100
     or not (trim(p_order_ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             or upper(trim(p_order_ref)) ~ '^ORD-[A-Z0-9-]{8,80}$')
     or p_actor_id is null or length(trim(p_actor_id)) = 0
     or p_actor_role is null or p_actor_role <> 'owner' then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Owner payment verification request is invalid.')::text using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;
  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;
  if v_order.payment_method = 'ONLINE_UPI' then
    raise exception '%', jsonb_build_object('code', 'PAYMENT_PROVIDER_UNAVAILABLE', 'message', 'Online payment cannot be manually marked received; provider verification is unavailable.')::text using errcode = 'P0001';
  end if;
  if v_order.payment_method not in ('CASH_ON_DELIVERY', 'WHATSAPP_UPI') then
    raise exception '%', jsonb_build_object('code', 'INVALID_MANUAL_PAYMENT_METHOD', 'message', 'This payment method cannot be manually verified.')::text using errcode = 'P0001';
  end if;
  if v_order.status not in ('CONFIRMED', 'SHIPPED', 'DELIVERED') then
    raise exception '%', jsonb_build_object('code', 'INVALID_PAYMENT_ORDER_STATE', 'message', 'Payment cannot be recorded for an order in its current state.')::text using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'PENDING' then
    raise exception '%', jsonb_build_object('code', 'PAYMENT_ALREADY_RECORDED', 'message', 'Payment has already been recorded for this order.')::text using errcode = 'P0001';
  end if;

  update public.orders as o
  set payment_status = 'PAID',
      utr_number = coalesce(nullif(trim(p_utr_number), ''), o.utr_number),
      payment_proof_url = coalesce(nullif(trim(p_payment_proof_url), ''), o.payment_proof_url),
      updated_at = timezone('utc'::text, now())
  where o.id = v_order.id
  returning o.* into v_order;

  -- Required audit insert
  insert into public.activity_audit_logs (
    actor_id, actor_email, actor_role, table_name, record_id, action,
    after_state, ip_address, user_agent
  ) values (
    p_actor_id, p_actor_email, p_actor_role, 'Order', v_order.order_number,
    'ORDER_PAYMENT_VERIFIED',
    jsonb_build_object(
      'previousPaymentStatus', 'PENDING',
      'paymentStatus', 'PAID',
      'paymentMethod', v_order.payment_method,
      'utrNumber', v_order.utr_number,
      'paymentProofUrl', v_order.payment_proof_url
    ),
    coalesce(p_ip_address, '127.0.0.1'), left(coalesce(p_user_agent, 'CircleUp Admin'), 1024)
  );

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id), '[]'::jsonb)
  into v_items from public.order_items as oi where oi.order_id = v_order.id;
  return jsonb_build_object('order', to_jsonb(v_order), 'order_items', v_items);
end;
$$;

revoke all on function public.admin_mark_order_payment_received(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_mark_order_payment_received(text, text, text, text, text, text, text, text) to service_role;

-- ------------------------------------------------------------------------------
-- 3. Daily Payment Reconciliation View & RPC
-- ------------------------------------------------------------------------------
create or replace function public.admin_get_daily_reconciliation(
  p_days integer default 30
)
returns table (
  reconciliation_date date,
  payment_method text,
  payment_status text,
  order_count bigint,
  total_paise bigint,
  verified_utr_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Reconciliation report is not authorized.')::text using errcode = '42501';
  end if;

  return query
  select
    date_trunc('day', o.created_at)::date as reconciliation_date,
    o.payment_method,
    o.payment_status,
    count(o.id)::bigint as order_count,
    coalesce(sum(o.total_paise), 0)::bigint as total_paise,
    count(o.utr_number)::bigint as verified_utr_count
  from public.orders as o
  where o.created_at >= (timezone('utc'::text, now()) - (coalesce(p_days, 30) || ' days')::interval)
  group by 1, 2, 3
  order by reconciliation_date desc, o.payment_method asc;
end;
$$;

revoke all on function public.admin_get_daily_reconciliation(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_reconciliation(integer) to service_role;

-- ------------------------------------------------------------------------------
-- 4. Admin Refund Processing with Stock Restock
-- ------------------------------------------------------------------------------
create or replace function public.admin_process_order_refund(
  p_order_ref text,
  p_amount_paise bigint,
  p_reason text,
  p_routing_action text,
  p_actor_id text,
  p_actor_email text,
  p_actor_role text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_refund public.refunds%rowtype;
  v_new_payment_status text;
  v_new_order_status text;
  v_clean_action text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin refund operation is not authorized.')::text using errcode = '42501';
  end if;
  if p_actor_role is null or p_actor_role <> 'owner' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Only owners may process refunds.')::text using errcode = '42501';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Refund amount must be greater than zero.')::text using errcode = '22023';
  end if;

  v_clean_action := upper(trim(coalesce(p_routing_action, 'RESTOCK')));
  if v_clean_action not in ('RESTOCK', 'DRY_CLEAN', 'ALTERATION', 'DISCARD') then
    v_clean_action := 'RESTOCK';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;

  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  if v_order.payment_status not in ('PAID', 'PARTIALLY_REFUNDED') then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_PAID', 'message', 'Cannot refund an unpaid order.')::text using errcode = 'P0001';
  end if;

  if p_amount_paise > v_order.total_paise then
    raise exception '%', jsonb_build_object('code', 'REFUND_EXCEEDS_TOTAL', 'message', 'Refund amount cannot exceed order total.')::text using errcode = '22023';
  end if;

  if p_amount_paise >= v_order.total_paise then
    v_new_payment_status := 'REFUNDED';
    v_new_order_status := 'REFUNDED';
  else
    v_new_payment_status := 'PARTIALLY_REFUNDED';
    v_new_order_status := v_order.status;
  end if;

  -- Insert into public.refunds
  insert into public.refunds (
    order_id, amount_paise, reason, status, approved_by, routing_action
  ) values (
    v_order.id, p_amount_paise, trim(coalesce(p_reason, 'Customer requested refund')), 'APPROVED', p_actor_email, v_clean_action
  )
  returning * into v_refund;

  -- Update order status
  update public.orders
  set payment_status = v_new_payment_status,
      status = v_new_order_status,
      updated_at = timezone('utc'::text, now())
  where id = v_order.id
  returning * into v_order;

  -- If restock action chosen, restore inventory
  if v_clean_action = 'RESTOCK' then
    for v_item in select product_id, quantity from public.order_items where order_id = v_order.id loop
      update public.products
      set stock = stock + v_item.quantity,
          status = case when status = 'SOLD_OUT' then 'ACTIVE' else status end,
          updated_at = timezone('utc'::text, now())
      where id = v_item.product_id;
    end loop;
  end if;

  -- Insert audit log
  insert into public.activity_audit_logs (
    actor_id, actor_email, actor_role, table_name, record_id, action,
    after_state, ip_address, user_agent
  ) values (
    p_actor_id, p_actor_email, p_actor_role, 'Refund', v_refund.id::text,
    'ORDER_REFUNDED',
    jsonb_build_object(
      'orderNumber', v_order.order_number,
      'refundAmountPaise', p_amount_paise,
      'routingAction', v_clean_action,
      'newPaymentStatus', v_new_payment_status
    ),
    coalesce(p_ip_address, '127.0.0.1'), left(coalesce(p_user_agent, 'CircleUp Admin'), 1024)
  );

  return jsonb_build_object(
    'refund', to_jsonb(v_refund),
    'order', to_jsonb(v_order)
  );
end;
$$;

revoke all on function public.admin_process_order_refund(text, bigint, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_process_order_refund(text, bigint, text, text, text, text, text, text, text) to service_role;

-- ------------------------------------------------------------------------------
-- 5. Admin Fulfillment Creation
-- ------------------------------------------------------------------------------
create or replace function public.admin_create_order_fulfillment(
  p_order_ref text,
  p_tracking_number text,
  p_carrier text,
  p_notes text default null,
  p_actor_id text default null,
  p_actor_email text default null,
  p_actor_role text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_fulfillment public.fulfillments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin fulfillment operation is not authorized.')::text using errcode = '42501';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;

  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  insert into public.fulfillments (
    order_id, tracking_number, carrier, status, shipped_at, notes
  ) values (
    v_order.id, trim(p_tracking_number), trim(p_carrier), 'SHIPPED', timezone('utc'::text, now()), nullif(trim(p_notes), '')
  )
  returning * into v_fulfillment;

  -- Advance order status to SHIPPED if it was CONFIRMED or PACKED
  if v_order.status in ('CONFIRMED', 'PACKED') then
    update public.orders
    set status = 'SHIPPED',
        updated_at = timezone('utc'::text, now())
    where id = v_order.id
    returning * into v_order;
  end if;

  -- Insert audit log
  insert into public.activity_audit_logs (
    actor_id, actor_email, actor_role, table_name, record_id, action,
    after_state, ip_address, user_agent
  ) values (
    coalesce(p_actor_id, 'system'), coalesce(p_actor_email, 'admin@circleuponline.com'), coalesce(p_actor_role, 'staff'),
    'Fulfillment', v_fulfillment.id::text, 'ORDER_FULFILLED',
    jsonb_build_object(
      'orderNumber', v_order.order_number,
      'trackingNumber', v_fulfillment.tracking_number,
      'carrier', v_fulfillment.carrier,
      'status', v_fulfillment.status
    ),
    coalesce(p_ip_address, '127.0.0.1'), left(coalesce(p_user_agent, 'CircleUp Admin'), 1024)
  );

  return jsonb_build_object(
    'fulfillment', to_jsonb(v_fulfillment),
    'order', to_jsonb(v_order)
  );
end;
$$;

revoke all on function public.admin_create_order_fulfillment(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_order_fulfillment(text, text, text, text, text, text, text, text, text) to service_role;

-- ------------------------------------------------------------------------------
-- 6. Marketing Newsletter Subscriptions & Consent
-- ------------------------------------------------------------------------------
create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  consent boolean not null default true,
  consent_at timestamptz not null default timezone('utc'::text, now()),
  source text not null default 'exit_intent',
  unsubscribed boolean not null default false,
  unsubscribed_at timestamptz,
  ip_address text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_newsletter_email on public.newsletter_subscriptions (lower(email));
alter table public.newsletter_subscriptions enable row level security;

-- Allow anon and authenticated to subscribe, but not read/modify existing entries
revoke all on table public.newsletter_subscriptions from anon, authenticated;
grant insert on table public.newsletter_subscriptions to anon, authenticated;
grant all on table public.newsletter_subscriptions to service_role;

drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscriptions;
create policy "Public can subscribe to newsletter"
  on public.newsletter_subscriptions for insert
  to anon, authenticated
  with check (true);
