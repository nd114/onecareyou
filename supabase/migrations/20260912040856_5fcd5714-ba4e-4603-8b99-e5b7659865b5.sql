-- Hourly so each admin's chosen send hour is honoured; the function itself
-- decides who is due and never sends twice in one day.
SELECT cron.schedule(
  'send-admin-digest-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cwngpcxxwvspcpkbxeax.supabase.co/functions/v1/send-admin-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_auth WHERE id = 'internal')
    ),
    body := '{}'::jsonb
  );
  $$
);