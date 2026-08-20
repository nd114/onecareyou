-- Throttle the writes anyone on the internet can make.
--
-- Three tables accept INSERT from the anonymous role, deliberately, because
-- three surfaces need it: applying for a job without an account, anonymous beta
-- telemetry, and the enterprise enquiry form. 20260817110000 took anon's
-- blanket privileges away and handed these four back on purpose.
--
-- What none of them had was a limit. `/careers/:jobId` is an unguarded route,
-- so a loop could put ten thousand rows into job_applications — each carrying a
-- name, an email and a phone number — and the only sign would be the table
-- growing. Three consecutive security reviews recorded "no rate limiting
-- anywhere in the application" as an accepted risk. This closes it for the
-- surfaces that are actually exposed.
--
-- Deliberately not attempted here: sign-in. That is Supabase Auth's own
-- endpoint, not ours, and it carries its own limits — configured in the
-- dashboard, not in a migration.

-- ---------------------------------------------------------------------------
-- Where the counting happens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
  ON public.rate_limit_events (bucket, subject, created_at DESC);

-- It holds IP addresses and email addresses, so nobody reads it through the
-- API. enforce_rate_limit() is SECURITY DEFINER and does not need a grant.
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.rate_limit_events_id_seq FROM anon, authenticated;

COMMENT ON TABLE public.rate_limit_events IS
  'One row per throttled attempt. Contains client IPs and email addresses: no RLS policy '
  'and no grants, so it is unreachable through the API by design. Pruned opportunistically '
  'by enforce_rate_limit().';

-- ---------------------------------------------------------------------------
-- Who is asking
-- ---------------------------------------------------------------------------
-- PostgREST publishes the request headers as a GUC. x-forwarded-for is set by
-- the platform edge, so the first entry is the client. It can be absent —
-- direct SQL, a psql session, a migration — hence the null-safe read; callers
-- fall back to something else to key on rather than treating everyone as one
-- subject, which would let one applicant lock out all the others.
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _headers text;
  _xff text;
BEGIN
  _headers := current_setting('request.headers', true);
  IF _headers IS NULL OR _headers = '' THEN RETURN NULL; END IF;
  _xff := (_headers::json ->> 'x-forwarded-for');
  IF _xff IS NULL OR btrim(_xff) = '' THEN RETURN NULL; END IF;
  RETURN btrim(split_part(_xff, ',', 1));
EXCEPTION WHEN OTHERS THEN
  -- A malformed header must never be the reason a form submission fails.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.request_client_ip() IS
  'Client IP from the x-forwarded-for header PostgREST exposes, or NULL when there is no '
  'HTTP request behind the call. Never raises.';

-- ---------------------------------------------------------------------------
-- The limit itself
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_rate_limit(
  _bucket text,
  _subject text,
  _max integer,
  _window interval,
  _message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF _subject IS NULL OR btrim(_subject) = '' THEN
    _subject := 'unattributed';
  END IF;

  SELECT count(*) INTO _count
    FROM public.rate_limit_events
   WHERE bucket = _bucket
     AND subject = _subject
     AND created_at > now() - _window;

  IF _count >= _max THEN
    RAISE EXCEPTION '%', COALESCE(
      _message,
      'Too many attempts. Please wait a few minutes and try again.'
    ) USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_events (bucket, subject) VALUES (_bucket, _subject);

  -- Prune opportunistically rather than on a schedule: roughly one call in a
  -- hundred clears anything older than a day, which keeps the table small
  -- without depending on pg_cron being present in a given environment.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_events WHERE created_at < now() - interval '1 day';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_rate_limit(text, text, integer, interval, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_rate_limit(text, text, integer, interval, text) IS
  'Raises P0001 when _subject has already made _max attempts in _bucket within _window; '
  'otherwise records this attempt. Called from BEFORE INSERT triggers, so the refusal '
  'aborts the write. No grants: triggers run it as the definer.';

-- ---------------------------------------------------------------------------
-- Applied to the three anonymous surfaces
-- ---------------------------------------------------------------------------
-- Two limits each. The per-subject one stops one person or one address
-- hammering a form; the shared one stops a spread of addresses doing the same
-- thing more slowly, which the per-subject limit alone cannot see.

CREATE OR REPLACE FUNCTION public.throttle_job_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_rate_limit(
    'job_application',
    COALESCE(public.request_client_ip(), lower(btrim(NEW.email)), 'unattributed'),
    5, interval '1 hour',
    'You have sent several applications recently. Please wait an hour before sending another.'
  );
  PERFORM public.enforce_rate_limit(
    'job_application_all', 'all', 200, interval '1 hour',
    'We are receiving an unusual number of applications right now. Please try again shortly.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_throttle_job_application ON public.job_applications;
CREATE TRIGGER trg_throttle_job_application
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.throttle_job_application();

CREATE OR REPLACE FUNCTION public.throttle_enterprise_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_rate_limit(
    'enterprise_inquiry',
    COALESCE(public.request_client_ip(), lower(btrim(NEW.contact_email)), 'unattributed'),
    3, interval '1 hour',
    'You have already sent an enquiry. We will be in touch — please give us a little time before sending another.'
  );
  PERFORM public.enforce_rate_limit(
    'enterprise_inquiry_all', 'all', 60, interval '1 hour',
    'We are receiving an unusual number of enquiries right now. Please try again shortly.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_throttle_enterprise_inquiry ON public.enterprise_inquiries;
CREATE TRIGGER trg_throttle_enterprise_inquiry
  BEFORE INSERT ON public.enterprise_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.throttle_enterprise_inquiry();

-- Telemetry is meant to be chatty, so the ceiling is high enough that ordinary
-- use never reaches it and only a flood does.
CREATE OR REPLACE FUNCTION public.throttle_beta_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_rate_limit(
    'beta_event',
    COALESCE(public.request_client_ip(), 'unattributed'),
    300, interval '1 hour',
    'Too many events from this client.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_throttle_beta_event ON public.beta_events;
CREATE TRIGGER trg_throttle_beta_event
  BEFORE INSERT ON public.beta_events
  FOR EACH ROW EXECUTE FUNCTION public.throttle_beta_event();
