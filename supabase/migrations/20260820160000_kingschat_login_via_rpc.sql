-- Fewer things that have to deploy.
--
-- The login needed three edge functions: one to issue a nonce, one to receive
-- KingsChat's callback, one to hand the browser its token. Two of those exist
-- only because the browser needed to talk to this table, and each is a separate
-- deployment that has to land before sign-in works at all — which is precisely
-- what did not happen: the browser's CORS preflight to kingschat-start never
-- got an HTTP-ok response, before or after the verify_jwt change.
--
-- PostgREST is already there and already answers the browser correctly; every
-- other query in the app proves it. So the two halves that only touch this
-- table become database functions the client calls over the same channel, and
-- the one function that genuinely must be an edge function — the callback,
-- which KingsChat POSTs to and which calls out to KingsChat and the admin API —
-- stays a lone deployment.
--
-- Same guarantees, one deployable instead of three.

-- ---------------------------------------------------------------------------
-- Begin: issue a nonce
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kingschat_begin_login()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nonce text;
BEGIN
  -- Unauthenticated by necessity: nobody is signed in when they click sign in.
  -- Throttled per client address through the limiter added in 20260820130000
  -- so an open endpoint cannot be used to fill the table.
  PERFORM public.enforce_rate_limit(
    'kingschat_login_start',
    COALESCE(public.request_client_ip(), 'unattributed'),
    20, interval '1 hour',
    'Too many sign-in attempts. Please wait a few minutes and try again.'
  );

  -- 256 bits from the CSPRNG. This is the only thing standing between an
  -- attacker's authorization code and somebody else's session.
  _nonce := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.kingschat_login_attempts (nonce) VALUES (_nonce);

  -- Abandoned logins leave rows holding a session token behind them.
  IF random() < 0.05 THEN
    PERFORM public.purge_expired_kingschat_attempts();
  END IF;

  RETURN _nonce;
END;
$$;

REVOKE ALL ON FUNCTION public.kingschat_begin_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kingschat_begin_login() TO anon, authenticated;

COMMENT ON FUNCTION public.kingschat_begin_login() IS
  'Issues the nonce sent to KingsChat as `origin` and records it as a pending login. '
  'Callable without a session because nobody has one yet; rate limited per client address. '
  'Returns only the nonce — never anything about other attempts.';

-- ---------------------------------------------------------------------------
-- Claim: hand over the token, once
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kingschat_claim_login(_nonce text)
RETURNS TABLE(status text, token_hash text, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.kingschat_login_attempts%ROWTYPE;
  _claimed text;
BEGIN
  IF _nonce IS NULL OR length(_nonce) > 128 THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO _row FROM public.kingschat_login_attempts AS a WHERE a.nonce = _nonce;

  -- An unknown nonce and an expired one get the same answer: this is not a live
  -- sign-in. Distinguishing them would confirm a guess.
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF _row.status = 'failed' THEN
    RETURN QUERY SELECT 'failed'::text, NULL::text,
                        COALESCE(_row.failure_reason, 'Sign-in failed');
    RETURN;
  END IF;

  IF _row.status = 'consumed' THEN
    RETURN QUERY SELECT 'consumed'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF _row.expires_at < now() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF _row.status <> 'fulfilled' OR _row.token_hash IS NULL THEN
    RETURN QUERY SELECT 'pending'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Single-use, even if two polls land together: only one transition out of
  -- 'fulfilled' can win.
  --
  -- Every column is qualified because this function's RETURNS TABLE names —
  -- status, token_hash, error — shadow the table's own, and an unqualified
  -- `status` here is ambiguous rather than wrong-looking.
  UPDATE public.kingschat_login_attempts AS a
     SET status = 'consumed', consumed_at = now()
   WHERE a.nonce = _nonce AND a.status = 'fulfilled'
  RETURNING a.token_hash INTO _claimed;

  IF _claimed IS NULL THEN
    RETURN QUERY SELECT 'consumed'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ready'::text, _claimed, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.kingschat_claim_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kingschat_claim_login(text) TO anon, authenticated;

COMMENT ON FUNCTION public.kingschat_claim_login(text) IS
  'Returns the one-time session token for a fulfilled login, exactly once, to whoever '
  'holds the nonce. Callable without a session; the nonce is the whole credential, which '
  'is why it is 256 bits and short-lived.';
