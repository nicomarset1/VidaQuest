-- Notificaciones push: suscripciones, banderas de aviso en recordatorios y log de dedupe.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.reminders
  add column if not exists notified_1h boolean not null default false,
  add column if not exists notified_due boolean not null default false;

create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  log_date date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, log_date)
);

alter table public.notification_log enable row level security;

select
  cron.schedule(
    'send-notifications-every-15-min',
    '*/15 * * * *',
    $$
    select net.http_post(
      url := 'https://xurazfrecgotkszoznab.supabase.co/functions/v1/send-notifications',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "ec8825191cbf4b2c909bbf16925b127ccf5fee91ad51f668"}'::jsonb,
      body := '{}'::jsonb
    );
    $$
  );
