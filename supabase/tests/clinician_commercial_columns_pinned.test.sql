-- A clinician cannot grant themselves a tier, a patient limit or a longer trial
-- by writing their own clinician_profiles row (RLS is row-level). Billing
-- writes (service role, SECURITY DEFINER code, platform admin) still work.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text, ''), true);
  IF _uid IS NOT NULL THEN EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
END;
$$;

-- Owned by the session user (not authenticated), like a SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION pg_temp.definer_set_tier(_uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.clinician_profiles SET subscription_tier = 'pro' WHERE user_id = _uid;
END;
$$;

DO $$
DECLARE
  _doc  uuid := 'a1c70000-0000-4000-8000-0000000000d1';
  _new  uuid := 'a1c70000-0000-4000-8000-0000000000d2';
  _adm  uuid := 'a1c70000-0000-4000-8000-0000000000d3';
  _tier text; _lim integer; _trial timestamptz; _name text; _cust text;
  _trial0 timestamptz;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_doc, 'ccp-doc@test.local', now()), (_new, 'ccp-new@test.local', now()),
    (_adm, 'ccp-adm@test.local', now());
  INSERT INTO public.clinician_profiles (user_id, first_name) VALUES (_doc, 'Pinned');
  SELECT trial_ends_at INTO _trial0 FROM public.clinician_profiles WHERE user_id = _doc;
  INSERT INTO public.clinician_profiles (user_id, first_name) VALUES (_adm, 'Admin');
  INSERT INTO public.user_roles (user_id, role) VALUES (_adm, 'admin');

  -- 1. The owner cannot rewrite their entitlement.
  PERFORM pg_temp.as_user(_doc);
  UPDATE public.clinician_profiles
     SET subscription_tier = 'enterprise', subscription_status = 'active',
         patient_limit = 999999, trial_ends_at = now() + interval '10 years',
         subscription_ends_at = now() + interval '10 years', stripe_customer_id = 'cus_x'
   WHERE user_id = _doc;
  PERFORM pg_temp.as_user(NULL);
  SELECT subscription_tier, patient_limit, trial_ends_at, stripe_customer_id
    INTO _tier, _lim, _trial, _cust FROM public.clinician_profiles WHERE user_id = _doc;
  PERFORM pg_temp.assert(_tier = 'trial', 'owner cannot set own subscription_tier');
  PERFORM pg_temp.assert(_lim = 5, 'owner cannot set own patient_limit');
  PERFORM pg_temp.assert(_trial = _trial0, 'owner cannot extend own trial_ends_at');
  PERFORM pg_temp.assert(_cust IS NULL, 'owner cannot set stripe ids');

  -- 2. Non-commercial edits still work, even alongside a dropped commercial one.
  PERFORM pg_temp.as_user(_doc);
  UPDATE public.clinician_profiles SET first_name = 'Renamed', subscription_tier = 'pro'
   WHERE user_id = _doc;
  PERFORM pg_temp.as_user(NULL);
  SELECT first_name, subscription_tier INTO _name, _tier
    FROM public.clinician_profiles WHERE user_id = _doc;
  PERFORM pg_temp.assert(_name = 'Renamed' AND _tier = 'trial',
    'a profile edit lands; the tier riding along is dropped');

  -- 3. Service role (billing webhook, check-clinician-subscription) may write.
  EXECUTE 'SET LOCAL ROLE service_role';
  UPDATE public.clinician_profiles
     SET subscription_tier = 'solo', patient_limit = 50, stripe_customer_id = 'cus_real'
   WHERE user_id = _doc;
  EXECUTE 'RESET ROLE';
  SELECT subscription_tier, patient_limit INTO _tier, _lim
    FROM public.clinician_profiles WHERE user_id = _doc;
  PERFORM pg_temp.assert(_tier = 'solo' AND _lim = 50, 'service role can change commercial columns');

  -- 4. A SECURITY DEFINER function called by the clinician may write.
  PERFORM pg_temp.as_user(_doc);
  PERFORM pg_temp.definer_set_tier(_doc);
  PERFORM pg_temp.as_user(NULL);
  SELECT subscription_tier INTO _tier FROM public.clinician_profiles WHERE user_id = _doc;
  PERFORM pg_temp.assert(_tier = 'pro', 'a definer-owned path can change the tier');

  -- 5. A platform admin may (on their own row; RLS decides which rows they reach).
  PERFORM pg_temp.as_user(_adm);
  UPDATE public.clinician_profiles SET patient_limit = 77 WHERE user_id = _adm;
  PERFORM pg_temp.as_user(NULL);
  SELECT patient_limit INTO _lim FROM public.clinician_profiles WHERE user_id = _adm;
  PERFORM pg_temp.assert(_lim = 77, 'platform admin can change commercial columns');

  -- 6. Sign-up insert as the user: elevated values are reset to the defaults.
  PERFORM pg_temp.as_user(_new);
  INSERT INTO public.clinician_profiles
    (user_id, first_name, subscription_tier, subscription_status, patient_limit, trial_ends_at, stripe_subscription_id)
  VALUES (_new, 'Fresh', 'enterprise', 'active', 999999, now() + interval '10 years', 'sub_x');
  PERFORM pg_temp.as_user(NULL);
  SELECT subscription_tier, patient_limit, trial_ends_at, first_name
    INTO _tier, _lim, _trial, _name FROM public.clinician_profiles WHERE user_id = _new;
  PERFORM pg_temp.assert(_tier = 'trial' AND _lim = 5, 'insert with elevated tier/limit is reset to defaults');
  PERFORM pg_temp.assert(_trial < now() + interval '15 days', 'insert cannot set a long trial');
  PERFORM pg_temp.assert(_name = 'Fresh', 'sign-up insert keeps the profile fields');

  RAISE NOTICE 'ALL CLINICIAN COMMERCIAL COLUMN TESTS PASSED';
END $$;

ROLLBACK;
