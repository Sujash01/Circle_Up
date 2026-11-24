-- Restore the admin login dependencies defined in 20261131_admin_auth_sessions.sql.
-- This repair does not create, reset, or promote an administrator.
begin;

alter table public.admin_users
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

do $constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.admin_users'::regclass
      and conname = 'admin_users_failed_attempts_nonnegative'
  ) then
    alter table public.admin_users
      add constraint admin_users_failed_attempts_nonnegative check (failed_attempts >= 0);
  end if;
end;
$constraint$;

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
create index if not exists idx_admin_auth_sessions_expiry
  on public.admin_auth_sessions(expires_at);

alter table public.admin_users enable row level security;
alter table public.admin_auth_sessions enable row level security;

drop policy if exists admin_auth_sessions_service_role on public.admin_auth_sessions;
create policy admin_auth_sessions_service_role on public.admin_auth_sessions
  for all to service_role using (true) with check (true);

revoke all on public.admin_users, public.admin_auth_sessions from public, anon, authenticated;
grant select, insert, update on public.admin_users, public.admin_auth_sessions to service_role;

create or replace function public.record_admin_login_failure(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  update public.admin_users
  set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
      updated_at = now()
  where id = p_user_id and is_active;
end;
$function$;

revoke all on function public.record_admin_login_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_admin_login_failure(uuid) to service_role;

create or replace function public.change_admin_password(
  p_user_id uuid,
  p_password_hash text,
  p_keep_session_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_password_hash is null or length(p_password_hash) < 30 or length(p_password_hash) > 512
    or p_password_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'INVALID_PASSWORD_HASH';
  end if;

  if p_keep_session_id is not null and not exists (
    select 1 from public.admin_auth_sessions
    where id = p_keep_session_id and user_id = p_user_id and revoked_at is null and expires_at > now()
  ) then
    raise exception using errcode = '22023', message = 'INVALID_CURRENT_SESSION';
  end if;

  update public.admin_users set password_hash = p_password_hash, updated_at = now()
  where id = p_user_id and is_active;
  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;

  update public.admin_auth_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null and (p_keep_session_id is null or id <> p_keep_session_id);
end;
$function$;

revoke all on function public.change_admin_password(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.change_admin_password(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
