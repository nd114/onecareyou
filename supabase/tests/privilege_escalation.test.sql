-- Privilege-escalation regression tests.
--
-- Each case here was a working exploit found by red-teaming the row policies in
-- August 2026. RLS is row-level, so a policy that grants "your own row" grants
-- every column of it — including columns that decide entitlement, money, or
-- consent. These assert the column guards that close that gap, and that the
-- legitimate write each policy exists for still works.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/privilege_escalation.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', _label;
  END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  _patient uuid := 'a1000000-0000-0000-0000-000000000001';
  _doctor  uuid := 'a1000000-0000-0000-0000-000000000002';
  _owner   uuid := 'a1000000-0000-0000-0000-000000000003';
  _hosp    uuid := 'a1111111-0000-0000-0000-000000000001';
  _share   uuid;
  _tier text; _pct numeric; _active boolean; _perms jsonb; _txt text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'esc-patient@test.local'), (_doctor,'esc-doctor@test.local'),
    (_owner,'esc-owner@test.local');

  INSERT INTO public.practices (id, name, tenant_type, created_by, revenue_share_pct, storage_limit_gb)
  VALUES (_hosp, 'Escalation Test Hospital', 'hospital', _owner, 10, 1000);

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Test', 'esc-doctor@test.local', 'esctest',
          '{"vitals":true,"meds":false,"adherence":false,"profile":false}'::jsonb, false)
  RETURNING id INTO _share;

  -- ==========================================================================
  -- 1. A patient cannot buy the paid plan by editing their own profile
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.profiles
     SET subscription_tier = 'premium', name = 'Legitimate Rename'
   WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT subscription_tier, name INTO _tier, _txt FROM public.profiles WHERE user_id = _patient;
  PERFORM pg_temp.assert(_tier IS DISTINCT FROM 'premium',
    'a patient cannot grant themselves the paid plan');
  PERFORM pg_temp.assert(_txt = 'Legitimate Rename',
    'a patient can still edit the rest of their profile');

  -- ==========================================================================
  -- 2. A hospital admin cannot rewrite their own commercial terms
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.practices
     SET revenue_share_pct = 100, storage_limit_gb = 999999,
         patient_limit = 999999, name = 'Legitimate Rename'
   WHERE id = _hosp;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT revenue_share_pct, name INTO _pct, _txt FROM public.practices WHERE id = _hosp;
  PERFORM pg_temp.assert(_pct = 10, 'a tenant admin cannot change their revenue share');
  PERFORM pg_temp.assert(
    (SELECT storage_limit_gb FROM public.practices WHERE id = _hosp) = 1000,
    'a tenant admin cannot raise their own storage allowance');
  PERFORM pg_temp.assert(_txt = 'Legitimate Rename',
    'a tenant admin can still rename their hospital');

  -- ==========================================================================
  -- 3. A clinician cannot rewrite the consent a patient gave them
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.provider_shares
     SET is_active = true,
         permissions = '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb,
         clinician_notes = 'Review in two weeks'
   WHERE id = _share;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT is_active, permissions, clinician_notes INTO _active, _perms, _txt
    FROM public.provider_shares WHERE id = _share;
  PERFORM pg_temp.assert(_active = false,
    'a clinician cannot re-activate a share the patient revoked');
  PERFORM pg_temp.assert(COALESCE((_perms->>'meds')::boolean, false) = false,
    'a clinician cannot widen their own permissions');
  PERFORM pg_temp.assert(_txt = 'Review in two weeks',
    'a clinician can still write their own notes on the share');

  -- The patient remains in control of their own relationship.
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.provider_shares
     SET is_active = true,
         permissions = '{"vitals":true,"meds":true,"adherence":false,"profile":false}'::jsonb
   WHERE id = _share;
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT is_active, permissions INTO _active, _perms FROM public.provider_shares WHERE id = _share;
  PERFORM pg_temp.assert(_active AND (_perms->>'meds')::boolean,
    'the patient can still re-share and change what is shared');

  -- ==========================================================================
  -- 4. Server-side callers keep working (Stripe, cron, admin tooling)
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.profiles SET subscription_tier = 'premium' WHERE user_id = _patient;
  SELECT subscription_tier INTO _tier FROM public.profiles WHERE user_id = _patient;
  PERFORM pg_temp.assert(_tier = 'premium',
    'the service role can still set entitlement after payment');

  RAISE NOTICE 'ALL PRIVILEGE ESCALATION TESTS PASSED';
END $$;

ROLLBACK;
