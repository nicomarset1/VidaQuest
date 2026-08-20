-- Reduce la latencia de las notificaciones: de cada 15 min a cada 1 min.

select cron.unschedule('send-notifications-every-15-min');

select
  cron.schedule(
    'send-notifications-every-minute',
    '* * * * *',
    $$
    select net.http_post(
      url := 'https://xurazfrecgotkszoznab.supabase.co/functions/v1/send-notifications',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "ec8825191cbf4b2c909bbf16925b127ccf5fee91ad51f668"}'::jsonb,
      body := '{}'::jsonb
    );
    $$
  );
