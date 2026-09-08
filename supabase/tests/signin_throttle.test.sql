-- check_signin_allowed(): the layer above Supabase Auth.
--
-- Worth stating what this does not cover, because a test suite that passes can
-- read as a claim of protection: an attacker who posts straight to
-- /auth/v1/token never calls this. Nothing in the database can see that
-- request. These assertions cover the sign-in form, which is where ordinary
-- credential stuffing actually goes.
DO $$
DECLARE i int; v_blocked boolean := false;
BEGIN
  -- request_client_ip() reads the x-forwarded-for header PostgREST exposes,
  -- so the test has to present one rather than invent its own setting.
  PERFORM set_config('request.headers', '{"x-forwarded-for":"203.0.113.9"}', true);

  FOR i IN 1..10 LOOP
    PERFORM public.check_signin_allowed('jane.evans@example.com');
  END LOOP;
  BEGIN
    PERFORM public.check_signin_allowed('jane.evans@example.com');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL: an eleventh attempt on one address went through'; END IF;

  -- One person exhausting their own attempts must not lock the household out.
  PERFORM public.check_signin_allowed('someone.else@example.com');

  v_blocked := false;
  BEGIN
    PERFORM public.check_signin_allowed('  JANE.EVANS@example.com  ');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL: changing case or spacing reset the counter'; END IF;

  -- One attempt each across many addresses is the case a per-email limit
  -- cannot see; the per-IP budget is what catches it.
  v_blocked := false;
  FOR i IN 1..60 LOOP
    BEGIN
      PERFORM public.check_signin_allowed('user' || i || '@example.com');
    EXCEPTION WHEN OTHERS THEN v_blocked := true; EXIT;
    END;
  END LOOP;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL: spraying across addresses was never stopped'; END IF;

  PERFORM public.check_signin_allowed('');
  PERFORM public.check_signin_allowed(NULL);

  RAISE NOTICE 'signin_throttle: 5 assertions passed';
END $$;
