-- Dos interruptores de notificaciones por dispositivo: avisos del
-- calendario y avisos de hábitos (racha, tareas, resumen, enfoque).
-- Las suscripciones existentes quedan con los dos activados, igual que
-- hasta ahora.

alter table public.push_subscriptions
  add column if not exists notify_calendar boolean not null default true,
  add column if not exists notify_habits boolean not null default true;
