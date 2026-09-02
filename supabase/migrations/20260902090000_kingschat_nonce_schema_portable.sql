-- Find gen_random_bytes wherever pgcrypto happens to live.
--
-- kingschat_begin_login() first called `gen_random_bytes(32)` unqualified with
-- `SET search_path = public`. That works where pgcrypto is installed into
-- public, and fails on Lovable Cloud, where it sits in `extensions` — which is
-- what stopped sign-in working and was fixed in 20260901185028 by qualifying
-- the call as `extensions.gen_random_bytes(32)`.
--
-- That trades one environment for the other: the qualified form now fails
-- anywhere pgcrypto is in public, which is the default for a plain Postgres and
-- for the local replay this repo's SQL suites run against. A function that only
-- works in one deployment is a function nobody can test before shipping it.
--
-- Putting both schemas on the function's search_path resolves the call in
-- either, with no name to keep in step. The path stays explicit rather than
-- inherited, which is what a SECURITY DEFINER function needs.

CREATE OR REPLACE FUNCTION public.kingschat_begin_login()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  -- 256 bits from the CSPRNG. Unqualified on purpose: pgcrypto is in
  -- `extensions` on Lovable Cloud and in `public` on a stock Postgres, and both
  -- are on this function's search_path.
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
  'search_path carries both public and extensions so gen_random_bytes resolves wherever '
  'pgcrypto is installed — see 20260902090000.';
