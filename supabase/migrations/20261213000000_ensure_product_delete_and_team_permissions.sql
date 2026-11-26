begin;

-- ==============================================================================
-- CircleUp Migration: Ensure Permanent Product Deletion & Granular Team RBAC
-- Migration: 20261213000000_ensure_product_delete_and_team_permissions.sql
-- ==============================================================================

-- 1. Ensure delete_product_if_unordered exists and has service_role grant
create or replace function public.delete_product_if_unordered(p_product_id uuid)
returns table (deleted_id uuid, serial_number text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.order_items
    where product_id = p_product_id
       or pg_catalog.upper(pg_catalog.btrim(serial_number)) = pg_catalog.upper(pg_catalog.btrim(v_product.serial_number))
  ) then
    raise exception using errcode = '23503', message = 'PRODUCT_IN_ORDERS';
  end if;

  delete from public.products where id = p_product_id;
  return query select v_product.id, v_product.serial_number;
end;
$$;

revoke all on function public.delete_product_if_unordered(uuid) from public, anon, authenticated;
grant execute on function public.delete_product_if_unordered(uuid) to service_role;

-- 2. Add permissions column to admin_users table
alter table public.admin_users
  add column if not exists permissions text[] default '{}'::text[];

-- 3. Update admin_update_user RPC to handle permissions and enforce owner security
create or replace function public.admin_update_user(p_actor_id uuid, p_target_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target public.admin_users;
  owner_count integer;
begin
  if p_patch ? 'email' and (length(trim(p_patch->>'email')) < 3 or length(p_patch->>'email') > 254) then
    raise exception using errcode = '22023', message = 'INVALID_EMAIL';
  end if;
  if p_patch ? 'name' and (length(trim(p_patch->>'name')) < 1 or length(p_patch->>'name') > 120) then
    raise exception using errcode = '22023', message = 'INVALID_NAME';
  end if;
  if p_patch ? 'role' and p_patch->>'role' not in ('owner', 'staff') then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;
  if p_patch ? 'is_active' and jsonb_typeof(p_patch->'is_active') <> 'boolean' then
    raise exception using errcode = '22023', message = 'INVALID_ACTIVE_STATE';
  end if;
  if p_patch ? 'password_hash' and (p_patch->>'password_hash' not like '$argon2id$%' or length(p_patch->>'password_hash') > 512) then
    raise exception using errcode = '22023', message = 'INVALID_PASSWORD_HASH';
  end if;
  if not exists (select 1 from public.admin_users where id = p_actor_id and role = 'owner' and is_active = true) then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;
  select * into target from public.admin_users where id = p_target_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND'; end if;
  if p_actor_id = p_target_id and ((p_patch ? 'role' and p_patch->>'role' <> target.role) or (p_patch->>'is_active' = 'false')) then
    raise exception using errcode = '42501', message = 'SELF_ADMIN_CHANGE_FORBIDDEN';
  end if;
  if target.role = 'owner' and target.is_active and
    ((p_patch->>'role' = 'staff') or (p_patch->>'is_active' = 'false')) then
    perform id from public.admin_users where role = 'owner' and is_active = true for update;
    select count(*) into owner_count from public.admin_users where role = 'owner' and is_active = true;
    if owner_count <= 1 then raise exception using errcode = '23514', message = 'LAST_OWNER_REQUIRED'; end if;
  end if;
  update public.admin_users set
    email = case when p_patch ? 'email' then lower(trim(p_patch->>'email')) else email end,
    full_name = case when p_patch ? 'name' then p_patch->>'name' else full_name end,
    role = case when p_patch ? 'role' then p_patch->>'role' else role end,
    is_active = case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean else is_active end,
    password_hash = case when p_patch ? 'password_hash' then p_patch->>'password_hash' else password_hash end,
    permissions = case
      when p_patch ? 'permissions' and jsonb_typeof(p_patch->'permissions') = 'array' then
        array(select jsonb_array_elements_text(p_patch->'permissions'))
      else permissions
    end,
    updated_at = now()
    where id = p_target_id returning * into target;
  if p_patch->>'is_active' = 'false' or p_patch ? 'role' or p_patch ? 'password_hash' or p_patch ? 'permissions' then
    update public.admin_auth_sessions set revoked_at = now() where user_id = p_target_id and revoked_at is null;
  end if;
  return jsonb_build_object(
    'id', target.id,
    'email', target.email,
    'full_name', target.full_name,
    'role', target.role,
    'permissions', coalesce(target.permissions, '{}'::text[]),
    'is_active', target.is_active,
    'last_login_at', target.last_login_at,
    'created_at', target.created_at,
    'updated_at', target.updated_at
  );
end;
$$;
revoke all on function public.admin_update_user(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_user(uuid, uuid, jsonb) to service_role;

-- 4. Delete user function protecting owner
create or replace function public.admin_delete_user(p_actor_id uuid, p_target_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target public.admin_users;
begin
  if not exists (select 1 from public.admin_users where id = p_actor_id and role = 'owner' and is_active = true) then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;
  if p_actor_id = p_target_id then
    raise exception using errcode = '42501', message = 'SELF_ADMIN_CHANGE_FORBIDDEN';
  end if;
  select * into target from public.admin_users where id = p_target_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;
  if target.role = 'owner' then
    raise exception using errcode = '42501', message = 'CANNOT_DELETE_OWNER';
  end if;
  update public.admin_auth_sessions set revoked_at = now() where user_id = p_target_id and revoked_at is null;
  delete from public.admin_users where id = p_target_id;
  return jsonb_build_object('success', true, 'deleted_id', p_target_id);
end;
$$;
revoke all on function public.admin_delete_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_user(uuid, uuid) to service_role;

-- 5. Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';

commit;
