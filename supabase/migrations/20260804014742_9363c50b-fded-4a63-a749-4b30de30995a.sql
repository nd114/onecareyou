-- Internal credential used by pg_cron to prove a request came from the scheduler.
CREATE TABLE IF NOT EXISTS public.cron_auth (
  id text PRIMARY KEY,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backend services only: never exposed to anon or authenticated roles.
REVOKE ALL ON public.cron_auth FROM PUBLIC;
GRANT ALL ON public.cron_auth TO service_role;

ALTER TABLE public.cron_auth ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only service_role (which bypasses RLS) may read it.

DROP TRIGGER IF EXISTS update_cron_auth_updated_at ON public.cron_auth;
CREATE TRIGGER update_cron_auth_updated_at
BEFORE UPDATE ON public.cron_auth
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cron_auth (id) VALUES ('internal')
ON CONFLICT (id) DO NOTHING;

-- Re-register scheduled jobs so they present the internal credential.
SELECT cron.unschedule('check-vital-alerts-hourly');
SELECT cron.schedule(
  'check-vital-alerts-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cwngpcxxwvspcpkbxeax.supabase.co/functions/v1/check-vital-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_auth WHERE id = 'internal')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('reset-demo-accounts-daily');
SELECT cron.schedule(
  'reset-demo-accounts-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://cwngpcxxwvspcpkbxeax.supabase.co/functions/v1/reset-demo-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_auth WHERE id = 'internal')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Also schedule the care-alert check (previously unscheduled) using the same credential.
SELECT cron.schedule(
  'check-care-alerts-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://cwngpcxxwvspcpkbxeax.supabase.co/functions/v1/check-care-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_auth WHERE id = 'internal')
    ),
    body := '{}'::jsonb
  );
  $$
);