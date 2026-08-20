-- The anonymous write surfaces refuse a flood.
--
-- Three tables accept INSERT from the open internet: job_applications (the
-- unguarded /careers/:jobId route), enterprise_inquiries and beta_events. None
-- had any limit, so a loop could put ten thousand rows of names, emails and
-- phone numbers into job_applications and the only sign would be the table
-- growing. Recorded as an accepted risk in three consecutive security reviews.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/rate_limit.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  _job uuid;
  _count integer; _txt text; _i integer;
BEGIN
  INSERT INTO public.job_postings (slug, title, location, description, is_published)
  VALUES ('test-role', 'Test Role', 'Remote', 'A role for the test suite.', true)
  RETURNING id INTO _job;

  -- ==========================================================================
  -- 1. An ordinary application still goes through
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE anon';
  INSERT INTO public.job_applications (job_id, job_title, full_name, email)
  VALUES (_job, 'Test Role', 'First Applicant', 'one@applicant.test');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.job_applications WHERE email = 'one@applicant.test';
  PERFORM pg_temp.assert(_count = 1, 'someone can still apply for a job without an account');

  -- ==========================================================================
  -- 2. The fifth is fine; the sixth is refused
  --
  -- No x-forwarded-for in a psql session, so the subject falls back to the
  -- email — which is the case that matters most anyway: one address cannot
  -- flood the form even from a rotating set of IPs.
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE anon';
  FOR _i IN 2..5 LOOP
    INSERT INTO public.job_applications (job_id, job_title, full_name, email)
    VALUES (_job, 'Test Role', 'First Applicant', 'one@applicant.test');
  END LOOP;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.job_applications WHERE email = 'one@applicant.test';
  PERFORM pg_temp.assert(_count = 5, 'five applications from one address are allowed through');

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    INSERT INTO public.job_applications (job_id, job_title, full_name, email)
    VALUES (_job, 'Test Role', 'First Applicant', 'one@applicant.test');
    _txt := 'inserted';
  EXCEPTION WHEN raise_exception THEN
    _txt := SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';

  PERFORM pg_temp.assert(_txt <> 'inserted', 'the sixth application in an hour is refused');
  PERFORM pg_temp.assert(_txt LIKE '%wait an hour%',
    'and the refusal says what to do rather than showing a database error');

  SELECT count(*) INTO _count FROM public.job_applications WHERE email = 'one@applicant.test';
  PERFORM pg_temp.assert(_count = 5, 'the refused row was not written');

  -- ==========================================================================
  -- 3. One flooder does not lock out everyone else
  --
  -- The limit keys on the subject, so a second applicant is unaffected. Getting
  -- this wrong would turn a spam filter into a denial of service against real
  -- candidates.
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE anon';
  INSERT INTO public.job_applications (job_id, job_title, full_name, email)
  VALUES (_job, 'Test Role', 'Second Applicant', 'two@applicant.test');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.job_applications WHERE email = 'two@applicant.test';
  PERFORM pg_temp.assert(_count = 1, 'a different applicant is unaffected by the first one''s limit');

  -- ==========================================================================
  -- 4. The enterprise form has its own, tighter limit
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE anon';
  FOR _i IN 1..3 LOOP
    INSERT INTO public.enterprise_inquiries (contact_email, contact_name, practice_name)
    VALUES ('buyer@hospital.test', 'A Buyer', 'Test Hospital');
  END LOOP;
  BEGIN
    INSERT INTO public.enterprise_inquiries (contact_email, contact_name, practice_name)
    VALUES ('buyer@hospital.test', 'A Buyer', 'Test Hospital');
    _txt := 'inserted';
  EXCEPTION WHEN raise_exception THEN
    _txt := SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';

  PERFORM pg_temp.assert(_txt <> 'inserted', 'a fourth enterprise enquiry in an hour is refused');
  SELECT count(*) INTO _count FROM public.enterprise_inquiries WHERE contact_email = 'buyer@hospital.test';
  PERFORM pg_temp.assert(_count = 3, 'three got through and the fourth did not');

  -- ==========================================================================
  -- 5. Telemetry is chatty and stays chatty
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE anon';
  FOR _i IN 1..50 LOOP
    INSERT INTO public.beta_events (event_name, source) VALUES ('page_view', 'beta-landing');
  END LOOP;
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.beta_events WHERE event_name = 'page_view';
  PERFORM pg_temp.assert(_count = 50,
    'ordinary telemetry volume is well under the ceiling and is not throttled');

  -- ==========================================================================
  -- 6. The counting table is not reachable through the API
  --
  -- It holds client IPs and email addresses. RLS is on with no policy, and the
  -- grant is gone, so neither role can read it even though a definer function
  -- writes to it on their behalf.
  -- ==========================================================================
  SELECT count(*) INTO _count
    FROM information_schema.role_table_grants
   WHERE table_name = 'rate_limit_events' AND grantee IN ('anon', 'authenticated');
  PERFORM pg_temp.assert(_count = 0, 'neither anon nor authenticated holds any grant on rate_limit_events');

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.rate_limit_events LIMIT 1;
    _txt := 'readable';
  EXCEPTION WHEN insufficient_privilege THEN
    _txt := 'denied';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'denied', 'an anonymous caller cannot read the IPs it recorded');

  PERFORM pg_temp.assert(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'rate_limit_events'),
    'row level security is on as a second line behind the missing grant');

  -- ==========================================================================
  -- 7. request_client_ip() never breaks a submission
  --
  -- It reads a header that is absent outside an HTTP request and malformed if
  -- someone sets it oddly. A form must not fail because of either.
  -- ==========================================================================
  PERFORM pg_temp.assert(public.request_client_ip() IS NULL,
    'with no HTTP request behind the call there is no IP, and no error');

  PERFORM set_config('request.headers', 'not json at all', true);
  PERFORM pg_temp.assert(public.request_client_ip() IS NULL,
    'a malformed header returns nothing rather than raising');

  PERFORM set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 70.41.3.18"}', true);
  PERFORM pg_temp.assert(public.request_client_ip() = '203.0.113.7',
    'the client is the first entry in x-forwarded-for, not the proxies after it');

  RAISE NOTICE 'ALL RATE LIMIT TESTS PASSED';
END $$;

ROLLBACK;
