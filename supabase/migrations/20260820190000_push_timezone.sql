-- Guarda la zona horaria del dispositivo para adaptar horarios de notificación.

alter table public.push_subscriptions
  add column if not exists timezone text not null default 'America/Argentina/Buenos_Aires';
