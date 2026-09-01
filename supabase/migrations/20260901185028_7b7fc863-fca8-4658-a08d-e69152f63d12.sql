CREATE OR REPLACE FUNCTION public.kingschat_begin_login()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nonce text;
BEGIN
  PERFORM public.enforce_rate_limit(
    'kingschat_login_start',
    COALESCE(public.request_client_ip(), 'unattributed'),
    20, interval '1 hour',
    'Too many sign-in attempts. Please wait a few minutes and try again.'
  );

  -- pgcrypto is installed in the extensions schema on Lovable Cloud.
  _nonce := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.kingschat_login_attempts (nonce) VALUES (_nonce);

  IF random() < 0.05 THEN
    PERFORM public.purge_expired_kingschat_attempts();
  END IF;

  RETURN _nonce;
END;
$$;

REVOKE ALL ON FUNCTION public.kingschat_begin_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kingschat_begin_login() TO anon, authenticated;

COMMENT ON FUNCTION public.kingschat_begin_login() IS
  'Issues a cryptographically secure nonce for a pending KingsChat login. Callable before authentication and rate limited per client address.';