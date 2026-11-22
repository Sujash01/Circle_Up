-- Preserve the existing Express/Argon2 admin auth model on Supabase.
-- All browser access remains denied; the backend uses its validated service-role client.

alter table public.admin_users add column if not exists failed_attempts integer not null default 0;
alter table public.admin_users add column if not exists locked_until timestamptz;
alter table public.admin_users add constraint admin_users_failed_attempts_nonnegative check (failed_attempts >= 0);

-- The application contract uses owner/staff. Older schema rows used admin for staff.
alter table public.admin_users drop constraint if exists admin_users_role_check;
update public.admin_users set role = 'staff' where role = 'admin';
alter table public.admin_users alter column role set default 'staff';
alter table public.admin_users add constraint admin_users_role_check check (role in ('owner', 'staff'));

create table if not exists public.admin_auth_sessions (
  id uuid primary key,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_auth_sessions_sha256_hash check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_auth_sessions_expiry_after_creation check (expires_at > created_at)
);

create index if not exists idx_admin_auth_sessions_user_active
  on public.admin_auth_sessions(user_id, expires_at desc) where revoked_at is null;
create index if not exists idx_admin_auth_sessions_expiry on public.admin_auth_sessions(expires_at);

alter table public.admin_auth_sessions enable row level security;
drop policy if exists admin_auth_sessions_service_role on public.admin_auth_sessions;
create policy admin_auth_sessions_service_role on public.admin_auth_sessions
  for all to service_role using (true) with check (true);
revoke all on public.admin_auth_sessions from public, anon, authenticated, service_role;
grant select, insert, update on public.admin_auth_sessions to service_role;

revoke all on public.admin_users from public, anon, authenticated, service_role;
grant select, insert, update on public.admin_users to service_role;

create or replace function public.record_admin_login_failure(p_user_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
begin
  update public.admin_users
    set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
        updated_at = now()
    where id = p_user_id and is_active = true;
end;
$$;
revoke all on function public.record_admin_login_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_admin_login_failure(uuid) to service_role;

create or replace function public.admin_update_user(
  p_actor_id uuid,
  p_target_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target public.admin_users;
  owner_count integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or
     (p_patch - array['email', 'name', 'role', 'is_active', 'password_hash']) <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'INVALID_USER_PATCH';
  end if;
  if p_patch ? 'email' and (length(trim(p_patch->>'email')) > 254 or (p_patch->>'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
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
    updated_at = now()
    where id = p_target_id returning * into target;
  if p_patch->>'is_active' = 'false' or p_patch ? 'role' or p_patch ? 'password_hash' then
    update public.admin_auth_sessions set revoked_at = now() where user_id = p_target_id and revoked_at is null;
  end if;
  return jsonb_build_object(
    'id', target.id,
    'email', target.email,
    'full_name', target.full_name,
    'role', target.role,
    'is_active', target.is_active,
    'last_login_at', target.last_login_at,
    'created_at', target.created_at,
    'updated_at', target.updated_at
  );
end;
$$;
revoke all on function public.admin_update_user(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_user(uuid, uuid, jsonb) to service_role;

create or replace function public.change_admin_password(p_user_id uuid, p_password_hash text, p_keep_session_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_password_hash is null or length(p_password_hash) < 30 or length(p_password_hash) > 512 or p_password_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'INVALID_PASSWORD_HASH';
  end if;
  if p_keep_session_id is not null and not exists (
    select 1 from public.admin_auth_sessions
      where id = p_keep_session_id and user_id = p_user_id and revoked_at is null and expires_at > now()
  ) then
    raise exception using errcode = '42501', message = 'INVALID_CURRENT_SESSION';
  end if;
  update public.admin_users set password_hash = p_password_hash, updated_at = now()
    where id = p_user_id and is_active = true;
  if not found then raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND'; end if;
  update public.admin_auth_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null and (p_keep_session_id is null or id <> p_keep_session_id);
end;
$$;
revoke all on function public.change_admin_password(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.change_admin_password(uuid, text, uuid) to service_role;
