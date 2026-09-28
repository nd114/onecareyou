-- A KingsChat sign-in belongs to the browser that started it.
--
-- kingschat_claim_login(_nonce) handed the session token to whoever held the
-- nonce. The nonce is not a secret: it is the `origin` in the KingsChat link,
-- and anyone can be handed that link. So an attacker could begin a login, send
-- the link to someone, wait for them to approve it in KingsChat, and claim the
-- token that signs them in as that person. Nothing tied the login to the
-- browser that asked for it, or to the browser that approved it.
--
-- A claim now takes three things, and the nonce is the least of them.
--
-- The browser secret is issued with the nonce and kept by the browser that
-- asked, in its own storage. It is never part of the KingsChat link. Only its
-- hash is kept here. Without it the nonce claims nothing, and learns nothing:
-- a stranger's claim is answered exactly as a nonce that never existed.
--
-- The completion code is minted when KingsChat's callback fulfils the attempt,
-- and the callback hands it only to the browser that made the callback — the
-- one where the user approved — by redirecting it back to the OneCare origin
-- recorded when the login began. Only its hash is kept here either.
--
-- The secret alone is not enough, because in the attack the attacker started
-- the login and holds it. The completion code alone is not enough, because it
-- went to the victim's browser, which has no secret for someone else's login,
-- and because it would otherwise let an attacker sign a victim in to the
-- attacker's account. Both together means the browser that started the login
-- is the browser that finished it.
--
-- Both are 256 bits and compared as SHA-256 digests, so a comparison that
-- stops early says nothing useful about the value being guessed. A refused
-- claim does not spend the attempt, so holding the nonce is not enough to
-- break somebody else's sign-in either. A successful claim spends it and
-- clears the token from the row.
--
-- The return origin is checked for shape here and against an allowlist in the
-- callback, which is the only place that follows it.
--
-- The old one-argument claim and the no-argument begin are dropped rather
-- than left beside the new ones: a function that still hands out the token on
-- the nonce alone would be the whole bug, reachable by name. Logins already in
-- flight when this lands have no secret bound to them and cannot be claimed;
-- the user starts again.

ALTER TABLE public.kingschat_login_attempts
  ADD COLUMN IF NOT EXISTS browser_secret_hash text,
  ADD COLUMN IF NOT EXISTS completion_hash text,
  ADD COLUMN IF NOT EXISTS return_origin text;

COMMENT ON COLUMN public.kingschat_login_attempts.browser_secret_hash IS
  'SHA-256 (hex) of the secret held by the browser that began the login. Never in the KingsChat link.';
COMMENT ON COLUMN public.kingschat_login_attempts.completion_hash IS
  'SHA-256 (hex) of the code the callback hands to the browser that approved the login.';
COMMENT ON COLUMN public.kingschat_login_attempts.return_origin IS
  'The OneCare origin the approving browser is sent back to. Checked against an allowlist by the callback.';

DROP FUNCTION IF EXISTS public.kingschat_begin_login();
DROP FUNCTION IF EXISTS public.kingschat_claim_login(text);

-- ---------------------------------------------------------------------------
-- Begin: a nonce for the link, a secret for the browser
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kingschat_begin_login(_return_origin text)
RETURNS TABLE(nonce text, browser_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _nonce  text;
  _secret text;
BEGIN
  -- A bare scheme, host and optional port, nothing else. Where it may point is
  -- the callback's decision; this only keeps junk out of the row.
  IF _return_origin IS NULL
     OR length(_return_origin) > 255
     OR _return_origin !~ '^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$' THEN
    RAISE EXCEPTION 'Sign-in could not start from this address'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM public.enforce_rate_limit(
    'kingschat_login_start',
    COALESCE(public.request_client_ip(), 'unattributed'),
    20, interval '1 hour',
    'Too many sign-in attempts. Please wait a few minutes and try again.'
  );

  _nonce  := encode(gen_random_bytes(32), 'hex');
  _secret := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.kingschat_login_attempts AS a (nonce, browser_secret_hash, return_origin)
  VALUES (_nonce, encode(digest(_secret, 'sha256'), 'hex'), lower(_return_origin));

  IF random() < 0.05 THEN
    PERFORM public.purge_expired_kingschat_attempts();
  END IF;

  RETURN QUERY SELECT _nonce, _secret;
END;
$$;

REVOKE ALL ON FUNCTION public.kingschat_begin_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kingschat_begin_login(text) TO anon, authenticated;

COMMENT ON FUNCTION public.kingschat_begin_login(text) IS
  'Starts a KingsChat login. Returns the nonce that goes in the KingsChat link and a separate '
  'browser secret the caller keeps to itself; only the secret''s hash is stored. Callable '
  'without a session, rate limited per client address. See 20261009110000.';

-- ---------------------------------------------------------------------------
-- Fulfil: the callback records the token and gets a code for the approver
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kingschat_fulfil_login(
  _nonce text, _token_hash text, _subject text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _code text := encode(gen_random_bytes(32), 'hex');
  _id   uuid;
BEGIN
  UPDATE public.kingschat_login_attempts AS a
     SET status = 'fulfilled',
         token_hash = _token_hash,
         kingschat_subject = _subject,
         completion_hash = encode(digest(_code, 'sha256'), 'hex'),
         fulfilled_at = now()
   WHERE a.nonce = _nonce
     AND a.status = 'pending'
     AND a.expires_at > now()
     AND a.browser_secret_hash IS NOT NULL
  RETURNING a.id INTO _id;

  IF _id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN _code;
END;
$$;

REVOKE ALL ON FUNCTION public.kingschat_fulfil_login(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kingschat_fulfil_login(text, text, text) TO service_role;

COMMENT ON FUNCTION public.kingschat_fulfil_login(text, text, text) IS
  'Service role only. Records the session token for a live, browser-bound attempt, once, and '
  'returns the completion code the callback hands to the approving browser. NULL when the '
  'attempt is unknown, not pending, expired or unbound.';

-- ---------------------------------------------------------------------------
-- Claim: the token, once, to the browser that started and finished the login
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kingschat_claim_login(
  _nonce text, _browser_secret text, _completion_code text DEFAULT NULL
)
RETURNS TABLE(status text, token_hash text, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _row public.kingschat_login_attempts%ROWTYPE;
BEGIN
  IF _nonce IS NULL OR length(_nonce) > 128
     OR _browser_secret IS NULL OR length(_browser_secret) > 128 THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Locked, so two claims landing together are decided one after the other.
  SELECT * INTO _row FROM public.kingschat_login_attempts AS a
   WHERE a.nonce = _nonce
   FOR UPDATE;

  -- No attempt, an attempt with no browser bound to it, and an attempt bound to
  -- a different browser all get the same answer as a nonce that never existed.
  IF NOT FOUND
     OR _row.browser_secret_hash IS NULL
     OR _row.browser_secret_hash <> encode(digest(_browser_secret, 'sha256'), 'hex') THEN
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

  -- Fulfilled but presented without the approving browser's code reads as not
  -- finished yet: from this browser's point of view, it is not.
  IF _row.status <> 'fulfilled' OR _row.token_hash IS NULL OR _row.completion_hash IS NULL
     OR _completion_code IS NULL OR length(_completion_code) > 128
     OR _row.completion_hash <> encode(digest(_completion_code, 'sha256'), 'hex') THEN
    RETURN QUERY SELECT 'pending'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.kingschat_login_attempts AS a
     SET status = 'consumed', consumed_at = now(), token_hash = NULL
   WHERE a.id = _row.id;

  RETURN QUERY SELECT 'ready'::text, _row.token_hash, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.kingschat_claim_login(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kingschat_claim_login(text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.kingschat_claim_login(text, text, text) IS
  'Returns the one-time session token for a fulfilled login, exactly once, to a caller holding '
  'the nonce, the browser secret issued with it, and the completion code the callback gave the '
  'approving browser. Without the secret the answer is always ''unknown''. See 20261009110000.';
