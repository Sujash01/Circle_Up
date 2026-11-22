-- Preserve the event date display label and registration notes already collected by the UI.
alter table public.events
  add column if not exists date_label text,
  alter column date drop not null;

alter table public.event_registrations
  add column if not exists notes text not null default '';
