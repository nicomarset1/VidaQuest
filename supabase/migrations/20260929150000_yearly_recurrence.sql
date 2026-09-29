-- Repetición anual (cumpleaños, aniversarios).

alter table public.reminders
  drop constraint if exists reminders_recurrence_check;

alter table public.reminders
  add constraint reminders_recurrence_check
  check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly'));
