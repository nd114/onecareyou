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
  _nonce text; _secret text; _code text;
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

  -- ==========================================================================
  -- 7. The browser's two halves, over PostgREST
  --
  -- Issuing and claiming are database functions rather than edge functions, so
  -- signing in depends on one deployment instead of three. Both are callable
  -- without a session — nobody has one yet — which makes what they refuse to
  -- say as important as what they return.
  --
  -- The nonce travels in the KingsChat link, so it is not a secret: anyone can
  -- be handed it. Claiming therefore takes two more things. The browser secret
  -- is issued with the nonce and never leaves the browser that asked for it.
  -- The completion code is minted when KingsChat approves, and is delivered
  -- only to the browser that did the approving. A claim needs both, which is
  -- to say the browser that started the login must be the one that finished it.
  -- ==========================================================================
  PERFORM pg_temp.assert(to_regprocedure('public.kingschat_claim_login(text)') IS NULL,
    'the claim that took the nonce alone is gone');
  PERFORM pg_temp.assert(to_regprocedure('public.kingschat_begin_login()') IS NULL,
    'and so is the begin that bound nothing');

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT b.nonce, b.browser_secret INTO _nonce, _secret
    FROM public.kingschat_begin_login('https://onecare.you') AS b;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(length(_nonce) = 64 AND length(_secret) = 64 AND _nonce <> _secret,
    'an anonymous caller can begin a login and gets a 256-bit nonce and a separate 256-bit browser secret');

  SELECT count(*) INTO _count FROM public.kingschat_login_attempts
   WHERE nonce = _nonce
     AND browser_secret_hash = encode(digest(_secret, 'sha256'), 'hex')
     AND return_origin = 'https://onecare.you';
  PERFORM pg_temp.assert(_count = 1,
    'only a hash of the browser secret is kept, with the origin the browser will come back to');

  SELECT count(*) INTO _count FROM public.kingschat_login_attempts
   WHERE browser_secret_hash = _secret OR completion_hash = _secret;
  PERFORM pg_temp.assert(_count = 0, 'the secret itself is stored nowhere');

  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT b.nonce INTO _txt FROM public.kingschat_begin_login('http://localhost:8080') AS b;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(length(_txt) = 64, 'a signed-in caller can begin one too');

  FOREACH _txt IN ARRAY ARRAY['javascript:alert(1)', 'https://onecare.you/path', 'onecare.you', '']
  LOOP
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      PERFORM public.kingschat_begin_login(_txt);
      _claimed := 'accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
      _claimed := 'refused';
    END;
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM pg_temp.assert(_claimed = 'refused', format('a return origin of %L is refused', _txt));
  END LOOP;

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status INTO _claimed FROM public.kingschat_claim_login(_nonce, _secret, NULL) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'pending', 'it reads as pending until the callback lands');

  -- Only the callback, as the service role, can fulfil an attempt.
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.kingschat_fulfil_login(_nonce, 'tok_forged', 'kc-forger');
    _txt := 'fulfilled';
  EXCEPTION WHEN insufficient_privilege THEN
    _txt := 'denied';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'denied', 'an anonymous caller cannot fulfil a login');

  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT public.kingschat_fulfil_login(_nonce, 'tok_rpc', 'kc-victim') INTO _code;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(length(_code) = 64, 'the callback gets a 256-bit completion code to hand the approving browser');

  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT public.kingschat_fulfil_login(_nonce, 'tok_again', 'kc-victim') INTO _txt;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt IS NULL, 'an attempt is fulfilled once');

  SELECT count(*) INTO _count FROM public.kingschat_login_attempts
   WHERE nonce = _nonce AND completion_hash = encode(digest(_code, 'sha256'), 'hex')
     AND token_hash = 'tok_rpc';
  PERFORM pg_temp.assert(_count = 1, 'only a hash of the completion code is kept');

  -- The attack: whoever holds the link's nonce polls for the token.
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.token_hash INTO _claimed, _txt FROM public.kingschat_claim_login(_nonce, NULL, _code) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'unknown' AND _txt IS NULL,
    'the nonce and completion code without the browser secret get nothing, and learn nothing');

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.token_hash INTO _claimed, _txt
    FROM public.kingschat_claim_login(_nonce, repeat('0', 64), _code) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'unknown' AND _txt IS NULL, 'nor does a wrong browser secret');

  -- The attacker who started the login holds the secret, but the approval
  -- happened in the victim's browser, which is where the completion code went.
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.token_hash INTO _claimed, _txt FROM public.kingschat_claim_login(_nonce, _secret, NULL) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'pending' AND _txt IS NULL,
    'the browser secret without the completion code gets nothing');

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.token_hash INTO _claimed, _txt
    FROM public.kingschat_claim_login(_nonce, _secret, repeat('0', 64)) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'pending' AND _txt IS NULL, 'nor does a wrong completion code');

  SELECT count(*) INTO _count FROM public.kingschat_login_attempts
   WHERE nonce = _nonce AND status = 'fulfilled' AND token_hash = 'tok_rpc';
  PERFORM pg_temp.assert(_count = 1, 'and none of those refusals spends the attempt');

  -- The browser that started it, and finished it.
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.token_hash INTO _claimed, _txt FROM public.kingschat_claim_login(_nonce, _secret, _code) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'ready' AND _txt = 'tok_rpc',
    'the browser holding both the secret and the completion code gets the token');

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.token_hash INTO _claimed, _txt FROM public.kingschat_claim_login(_nonce, _secret, _code) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'consumed' AND _txt IS NULL, 'exactly once');

  SELECT count(*) INTO _count FROM public.kingschat_login_attempts
   WHERE nonce = _nonce AND token_hash IS NULL AND consumed_at IS NOT NULL;
  PERFORM pg_temp.assert(_count = 1, 'and the spent token is not left lying in the row');

  -- An attempt issued before this binding existed has no secret to match.
  INSERT INTO public.kingschat_login_attempts (nonce, status, token_hash, fulfilled_at)
  VALUES ('nonce-legacy', 'fulfilled', 'tok_legacy', now());
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.token_hash INTO _claimed, _txt
    FROM public.kingschat_claim_login('nonce-legacy', NULL, NULL) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'unknown' AND _txt IS NULL,
    'an attempt with no browser bound to it can never be claimed');

  -- A failure is reported only to the browser that started the login.
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT b.nonce, b.browser_secret INTO _nonce, _secret
    FROM public.kingschat_begin_login('https://onecare.you') AS b;
  EXECUTE 'SET LOCAL ROLE postgres';
  UPDATE public.kingschat_login_attempts SET status = 'failed', failure_reason = 'No such user'
   WHERE nonce = _nonce;
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status INTO _claimed FROM public.kingschat_claim_login(_nonce, NULL, NULL) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'unknown', 'a stranger with the nonce cannot read a failure');
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status, c.error INTO _claimed, _txt FROM public.kingschat_claim_login(_nonce, _secret, NULL) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'failed' AND _txt = 'No such user', 'the browser that started it can');

  -- An expired attempt cannot be fulfilled or claimed.
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT b.nonce, b.browser_secret INTO _nonce, _secret
    FROM public.kingschat_begin_login('https://onecare.you') AS b;
  EXECUTE 'SET LOCAL ROLE postgres';
  UPDATE public.kingschat_login_attempts SET expires_at = now() - interval '1 second' WHERE nonce = _nonce;
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT public.kingschat_fulfil_login(_nonce, 'tok_late', 'kc-late') INTO _code;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_code IS NULL, 'an expired attempt cannot be fulfilled');

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT c.status INTO _claimed FROM public.kingschat_claim_login('not-a-real-nonce', _secret, NULL) AS c;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_claimed = 'unknown',
    'a guessed nonce is answered the same way an expired one is, confirming nothing');

  RAISE NOTICE 'ALL KINGSCHAT LOGIN ATTEMPT TESTS PASSED';
END $$;

ROLLBACK;
