-- Eventos completos en la agenda: hora de fin, todo el día, descripción,
-- lugar, color, repetición y avisos configurables (minutos antes).
-- Los recordatorios que ya existen quedan con {60,0}: aviso 1 h antes y
-- a la hora, igual que hasta ahora.

alter table public.reminders
  add column if not exists end_time text,
  add column if not exists all_day boolean not null default false,
  add column if not exists description text not null default '',
  add column if not exists location text not null default '',
  add column if not exists color text,
  add column if not exists recurrence text not null default 'none',
  add column if not exists recurrence_until text,
  add column if not exists alert_offsets integer[] not null default '{60,0}';

alter table public.reminders
  drop constraint if exists reminders_recurrence_check;

alter table public.reminders
  add constraint reminders_recurrence_check
  check (recurrence in ('none', 'daily', 'weekly', 'monthly'));
