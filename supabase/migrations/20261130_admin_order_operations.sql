-- Atomic admin order status, cancellation/inventory, and payment operations.
-- Express authenticates and authorizes admins. These SECURITY DEFINER RPCs are
-- executable only by service_role; actor values are supplied by that trusted API.

create or replace function public.admin_update_order_status(
  p_order_ref text,
  p_new_status text,
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
  v_old_status text;
  v_item record;
  v_product_id uuid;
  v_items jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin order operation is not authorized.')::text using errcode = '42501';
  end if;
  if p_order_ref is null or length(trim(p_order_ref)) not between 8 and 100
     or not (trim(p_order_ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             or upper(trim(p_order_ref)) ~ '^ORD-[A-Z0-9-]{8,80}$')
     or p_new_status is null or p_new_status not in ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')
     or p_actor_id is null or length(trim(p_actor_id)) = 0
     or p_actor_role is null or p_actor_role not in ('owner', 'staff') then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Admin order status request is invalid.')::text using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;
  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  v_old_status := v_order.status;
  if not (
    (v_old_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED'))
    or (v_old_status = 'CONFIRMED' and p_new_status in ('SHIPPED', 'CANCELLED'))
    or (v_old_status = 'SHIPPED' and p_new_status in ('DELIVERED', 'CANCELLED'))
  ) then
    raise exception '%', jsonb_build_object('code', 'INVALID_STATUS_TRANSITION', 'message', 'This order status transition is not allowed.')::text using errcode = 'P0001';
  end if;

  if p_new_status = 'CANCELLED' then
    -- Aggregate duplicate order lines, then lock products in stable serial order.
    for v_item in
      select oi.serial_number, sum(oi.quantity)::integer as quantity
      from public.order_items as oi
      where oi.order_id = v_order.id
      group by oi.serial_number
      order by oi.serial_number
    loop
      if v_item.serial_number is null or v_item.quantity <= 0 then
        raise exception '%', jsonb_build_object('code', 'ORDER_INVENTORY_UNAVAILABLE', 'message', 'Order inventory could not be restored.')::text using errcode = 'P0001';
      end if;
      select p.id into v_product_id
      from public.products as p
      where p.serial_number = upper(v_item.serial_number)
      for update;
      if not found then
        raise exception '%', jsonb_build_object('code', 'ORDER_INVENTORY_UNAVAILABLE', 'message', 'A product required for inventory restoration no longer exists.')::text using errcode = 'P0001';
      end if;
      update public.products as p
      set stock = p.stock + v_item.quantity,
          status = 'ACTIVE',
          updated_at = timezone('utc'::text, now())
      where p.id = v_product_id;
    end loop;
  end if;

  update public.orders as o
  set status = p_new_status,
      updated_at = timezone('utc'::text, now())
  where o.id = v_order.id
  returning o.* into v_order;

  -- Preserve the existing explicit ORDER_STATUS_UPDATE audit event. The table
  -- trigger also records its generic status snapshot as it does for other updates.
  insert into public.activity_audit_logs (
    actor_id, actor_email, actor_role, table_name, record_id, action,
    after_state, ip_address, user_agent
  ) values (
    p_actor_id, p_actor_email, p_actor_role, 'Order', v_order.order_number,
    'ORDER_STATUS_UPDATE',
    jsonb_build_object('previousStatus', v_old_status, 'newStatus', p_new_status),
    coalesce(p_ip_address, '127.0.0.1'), left(coalesce(p_user_agent, 'CircleUp Admin'), 1024)
  );

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id), '[]'::jsonb)
  into v_items from public.order_items as oi where oi.order_id = v_order.id;
  return jsonb_build_object('order', to_jsonb(v_order), 'order_items', v_items);
end;
$$;

create or replace function public.admin_mark_order_payment_received(
  p_order_ref text,
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
      updated_at = timezone('utc'::text, now())
  where o.id = v_order.id
  returning o.* into v_order;

  -- Required audit insert is in the same transaction as payment verification.
  insert into public.activity_audit_logs (
    actor_id, actor_email, actor_role, table_name, record_id, action,
    after_state, ip_address, user_agent
  ) values (
    p_actor_id, p_actor_email, p_actor_role, 'Order', v_order.order_number,
    'ORDER_PAYMENT_VERIFIED',
    jsonb_build_object('previousPaymentStatus', 'PENDING', 'paymentStatus', 'PAID', 'paymentMethod', v_order.payment_method),
    coalesce(p_ip_address, '127.0.0.1'), left(coalesce(p_user_agent, 'CircleUp Admin'), 1024)
  );

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id), '[]'::jsonb)
  into v_items from public.order_items as oi where oi.order_id = v_order.id;
  return jsonb_build_object('order', to_jsonb(v_order), 'order_items', v_items);
end;
$$;

revoke all on function public.admin_update_order_status(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_order_status(text, text, text, text, text, text, text) to service_role;
revoke all on function public.admin_mark_order_payment_received(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_mark_order_payment_received(text, text, text, text, text, text) to service_role;
