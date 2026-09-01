-- The table that joins the two halves of a KingsChat login.
--
-- KingsChat POSTs the authorization code to the registered callback URL, server
-- to server — the browser never sees it. A row here holds the one-time session
-- token between the callback arriving and the browser asking for it, keyed by a
-- nonce the server issued. It therefore holds something that opens a session,
-- and must be unreachable from the client and usable only once.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/kingschat_login_attempts.test.sql

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
  _user uuid := 'f1000000-0000-0000-0000-000000000001';
  _count integer; _txt text; _claimed text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_user, 'kc-user@test.local');

  INSERT INTO public.kingschat_login_attempts (nonce) VALUES ('nonce-pending');
  INSERT INTO public.kingschat_login_attempts (nonce, status, token_hash, fulfilled_at)
  VALUES ('nonce-ready', 'fulfilled', 'the-one-time-token', now());

  -- ==========================================================================
  -- 1. No client can reach it, signed in or not
  --
  -- The row holds a token that establishes a session. A missing grant is the
  -- real barrier; RLS with no policy is the second one behind it.
  -- ==========================================================================
  SELECT count(*) INTO _count
    FROM information_schema.role_table_grants
   WHERE table_name = 'kingschat_login_attempts' AND grantee IN ('anon', 'authenticated');
  PERFORM pg_temp.assert(_count = 0, 'neither anon nor authenticated holds any grant on it');

  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.kingschat_login_attempts LIMIT 1;
    _txt := 'readable';
  EXCEPTION WHEN insufficient_privilege THEN
    _txt := 'denied';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'denied', 'a signed-in user cannot read a pending session token');

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.kingschat_login_attempts LIMIT 1;
    _txt := 'readable';
  EXCEPTION WHEN insufficient_privilege THEN
    _txt := 'denied';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'denied', 'nor can an anonymous caller');

  PERFORM pg_temp.assert(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'kingschat_login_attempts'),
    'row level security is on behind the missing grant');

  -- ==========================================================================
  -- 2. A nonce cannot be reused
  --
  -- Two callbacks quoting the same origin must not both produce a session.
  -- ==========================================================================
  BEGIN
    INSERT INTO public.kingschat_login_attempts (nonce) VALUES ('nonce-pending');
    _txt := 'inserted';
  EXCEPTION WHEN unique_violation THEN
    _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'the same nonce cannot be issued twice');

  -- ==========================================================================
  -- 3. The token is handed out exactly once
  --
  -- This is the conditional update the poll function relies on: whichever of
  -- two simultaneous polls transitions the row out of 'fulfilled' wins, and the
  -- other gets nothing.
  -- ==========================================================================
  UPDATE public.kingschat_login_attempts
     SET status = 'consumed', consumed_at = now()
   WHERE nonce = 'nonce-ready' AND status = 'fulfilled'
  RETURNING token_hash INTO _claimed;
  PERFORM pg_temp.assert(_claimed = 'the-one-time-token', 'the first claim gets the token');

  _claimed := NULL;
  UPDATE public.kingschat_login_attempts
     SET status = 'consumed', consumed_at = now()
   WHERE nonce = 'nonce-ready' AND status = 'fulfilled'
  RETURNING token_hash INTO _claimed;
  PERFORM pg_temp.assert(_claimed IS NULL, 'a second claim on the same nonce gets nothing');

  -- ==========================================================================
  -- 4. Only the four states the flow actually has
  -- ==========================================================================
  BEGIN
    INSERT INTO public.kingschat_login_attempts (nonce, status)
    VALUES ('nonce-bogus', 'whatever');
    _txt := 'inserted';
  EXCEPTION WHEN check_violation THEN
    _txt := 'refused';
  END;
  PERFORM pg_temp.assert(_txt = 'refused', 'an unrecognised status is refused');

  -- ==========================================================================
  -- 5. An attempt expires on its own
  -- ==========================================================================
  SELECT count(*) INTO _count FROM public.kingschat_login_attempts
   WHERE nonce = 'nonce-pending' AND expires_at > now() AND expires_at < now() + interval '11 minutes';
  PERFORM pg_temp.assert(_count = 1, 'a new attempt expires within ten minutes');

  -- ==========================================================================
  -- 6. Housekeeping clears old rows, and only old ones
  --
  -- These rows carry session tokens, so an abandoned login should not sit
  -- around indefinitely — but a recent failure has to stay long enough to be
  -- worth asking about.
  -- ==========================================================================
  INSERT INTO public.kingschat_login_attempts (nonce, status, expires_at)
  VALUES ('nonce-ancient', 'failed', now() - interval '3 hours');

  SELECT public.purge_expired_kingschat_attempts() INTO _count;
  PERFORM pg_temp.assert(_count = 1, 'the purge removes an attempt well past expiry');

  SELECT count(*) INTO _count FROM public.kingschat_login_attempts WHERE nonce = 'nonce-ancient';
  PERFORM pg_temp.assert(_count = 0, 'and it is gone');

  SELECT count(*) INTO _count FROM public.kingschat_login_attempts WHERE nonce = 'nonce-pending';
  PERFORM pg_temp.assert(_count = 1, 'while a live attempt is untouched');

  RAISE NOTICE 'ALL KINGSCHAT LOGIN ATTEMPT TESTS PASSED';
END $$;

ROLLBACK;
