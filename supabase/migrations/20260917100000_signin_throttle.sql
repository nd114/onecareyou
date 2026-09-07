-- Throttling sign-in attempts, and being honest about what that covers.
--
-- The three anonymous write surfaces were throttled in August 2026. Sign-in was
-- left outstanding for a real reason: it is Supabase Auth's own endpoint, so
-- there is no table to put a trigger on and no way to limit it from a
-- migration. The limits that actually protect `/auth/v1/token` are configured
-- in the Supabase dashboard, and this file cannot set them. See
-- docs/handbook/auth-hardening.md for what to set and how to check it.
--
-- What this adds is the layer above: OneCare's own sign-in form asks before it
-- tries, and records the failures. That is worth having and worth being precise
-- about —
--
--   * It stops the ordinary case: someone working through a password list in
--     the app, a stuck client retrying, a script driving the real UI.
--   * It does NOT stop an attacker who posts straight to Supabase Auth and
--     never loads our page. Nothing in the database can, which is exactly why
--     the dashboard limits are not optional.
--
-- Keyed on both the address being tried and the caller's IP, because either one
-- alone misses a real attack: per-address only lets someone spray one attempt
-- across ten thousand addresses, and per-IP only lets a botnet through.

CREATE OR REPLACE FUNCTION public.check_signin_allowed(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _key text := lower(btrim(COALESCE(_email, '')));
  _ip text := public.request_client_ip();
BEGIN
  IF _key = '' THEN
    RETURN;
  END IF;

  -- Ten tries against one address in fifteen minutes. Generous for somebody
  -- who has genuinely forgotten which password they used; cheap to exhaust if
  -- you are guessing.
  PERFORM public.enforce_rate_limit(
    'signin_email', _key, 10, interval '15 minutes',
    'Too many sign-in attempts for this email. Wait a few minutes, or reset your password.'
  );

  -- And fifty from one address across all accounts, which is the spraying case
  -- the per-email limit cannot see.
  IF _ip IS NOT NULL AND btrim(_ip) <> '' THEN
    PERFORM public.enforce_rate_limit(
      'signin_ip', _ip, 50, interval '15 minutes',
      'Too many sign-in attempts from this connection. Please wait a few minutes.'
    );
  END IF;
END;
$function$;

-- Callable before sign-in, so by definition before there is a session.
REVOKE ALL ON FUNCTION public.check_signin_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signin_allowed(text) TO anon, authenticated;

COMMENT ON FUNCTION public.check_signin_allowed(text) IS
  'Raises when sign-in attempts for an address or from an IP exceed the window. Client-side defence only: it cannot see requests that go straight to Supabase Auth, which is what the dashboard limits are for.';
