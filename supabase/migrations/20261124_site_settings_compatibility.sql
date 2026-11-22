-- Additive compatibility for the existing public.site_settings row.
-- customDrop continues to map to curated_drop; no parallel column is needed.
alter table public.site_settings
  add column if not exists is_whatsapp_verified boolean not null default false,
  add column if not exists content_version integer not null default 1 check (content_version >= 1);

-- Keep API cache version and updated_at consistent for settings edits and for
-- existing catalog/coupon callers of settingsRepository.bumpVersion().
create or replace function public.fn_site_settings_bump_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  if tg_op = 'UPDATE' then
    new.content_version := old.content_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_site_settings_bump_version on public.site_settings;
create trigger trg_site_settings_bump_version
  before update on public.site_settings
  for each row execute function public.fn_site_settings_bump_version();
