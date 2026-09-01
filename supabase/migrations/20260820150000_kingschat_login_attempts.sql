-- Reconnecting the two halves of a KingsChat login.
--
-- KingsChat's authorization-code flow does not redirect the browser back with
-- the code. It POSTs `{code, origin}` to the redirect_url registered on the
-- application — server to server, out of band — and the docs are explicit that
-- the callback always goes to that registered URL and cannot be overridden at
-- request time. So the browser that started the login never sees the code, and
-- the server that receives the code has no idea which browser it belongs to.
--
-- `origin` is the thread between them: an unguessable value the server issues
-- before the user leaves, echoed back verbatim in the callback. This table is
-- where an issued value lives while the login is in flight.
--
-- It is also the CSRF binding the flow otherwise has none of. Without a value
-- the server issued and remembers, an authorization code obtained by an
-- attacker could be redeemed inside somebody else's session — the standard
-- login-CSRF against an OAuth callback.
--
-- Short-lived, single-use, and unreachable from the client: only the edge
-- functions touch it, using the service role.

CREATE TABLE IF NOT EXISTS public.kingschat_login_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce          text NOT NULL UNIQUE,
  status         text NOT NULL DEFAULT 'pending',
  -- The one-time magic-link token the browser exchanges for a real session.
  token_hash     text,
  failure_reason text,
  -- Whoever KingsChat says this is, for support and for linking later.
  kingschat_subject text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  fulfilled_at   timestamptz,
  consumed_at    timestamptz,
  CONSTRAINT kingschat_login_attempts_status_check
    CHECK (status IN ('pending', 'fulfilled', 'failed', 'consumed'))
);

CREATE INDEX IF NOT EXISTS idx_kingschat_login_attempts_nonce
  ON public.kingschat_login_attempts (nonce);
CREATE INDEX IF NOT EXISTS idx_kingschat_login_attempts_expiry
  ON public.kingschat_login_attempts (expires_at);

-- A row holds a token that establishes a session, so nothing but the service
-- role may read or write it. RLS on with no policy is the belt; the missing
-- grant is the braces.
ALTER TABLE public.kingschat_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kingschat_login_attempts FROM anon, authenticated;

COMMENT ON TABLE public.kingschat_login_attempts IS
  'One row per KingsChat login in flight, keyed by the nonce sent as `origin`. Holds the '
  'magic-link token between the server-to-server callback and the browser that started the '
  'login. No grants and no RLS policy: reachable only by the edge functions through the '
  'service role. Rows are single-use and expire in ten minutes.';

COMMENT ON COLUMN public.kingschat_login_attempts.nonce IS
  'Unguessable value issued before the user leaves for KingsChat and echoed back as `origin`. '
  'Treated as untrusted on arrival — it is looked up, never interpreted.';

-- Housekeeping. An abandoned login leaves a row behind, and these carry a
-- session token, so they should not accumulate.
CREATE OR REPLACE FUNCTION public.purge_expired_kingschat_attempts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _removed integer;
BEGIN
  DELETE FROM public.kingschat_login_attempts
   WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS _removed = ROW_COUNT;
  RETURN _removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_kingschat_attempts() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.purge_expired_kingschat_attempts() IS
  'Removes login attempts an hour past expiry. Called opportunistically by the start '
  'function; the grace period is so a support question about a failed login is still '
  'answerable for a while.';
