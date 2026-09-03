-- A practice cannot let itself into a patient's record.
--
-- This suite exists because the platform allowed it. A staff member with
-- can_invite_patients could insert a practice_patient_access row for any
-- patient at all — one who had never shared with the practice, never heard of
-- it — and immediately read their signed clinical notes and raw ambient
-- transcript. The INSERT policy asked for practice membership and the invite
-- capability, and nothing about the patient agreeing.
--
-- Test 1 is that exact attack.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/practice_access_consent.test.sql

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
  _stranger uuid := 'ac000000-0000-0000-0000-00000000000a';  -- never shared with anyone
  _sharer   uuid := 'ac000000-0000-0000-0000-00000000000b';  -- shared with the practice
  _staff    uuid := 'ac000000-0000-0000-0000-00000000000c';
  _owner    uuid := 'ac000000-0000-0000-0000-00000000000d';
  _practice uuid := 'ac000000-0000-0000-0000-0000000000c1';
  _count integer; _ok boolean;
BEGIN
  INSERT INTO auth.users (id,email) VALUES
    (_stranger,'ac-stranger@test.local'), (_sharer,'ac-sharer@test.local'),
    (_staff,'ac-staff@test.local'), (_owner,'ac-owner@test.local');

  INSERT INTO public.practices (id,name,created_by,tenant_type)
  VALUES (_practice,'General Hospital',_owner,'hospital');

  -- A clinical role on purpose: this suite is about consent, not about which
  -- roles may read clinical content. non_clinical_staff.test.sql covers that,
  -- and using front_desk here made this file fail once that split landed —
  -- for the right reason, which is the two suites meeting rather than a bug.
  INSERT INTO public.practice_members
    (practice_id,user_id,role,status,can_view_all_patients,can_invite_patients)
  VALUES (_practice,_staff,'provider','active',true,true);

  INSERT INTO public.encounters
    (patient_user_id,clinician_user_id,visit_type,status,signed_at,assessment,scribe_transcript)
  VALUES (_stranger,_owner,'annual','signed',now(),'Depression, started sertraline','everything said in the room'),
         (_sharer,_owner,'annual','signed',now(),'Diabetes well controlled','everything said in the room');

  -- ==========================================================================
  -- 1. The attack, refused
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.practice_patient_access
      (practice_id,patient_user_id,primary_clinician_id,is_active)
    VALUES (_practice,_stranger,_staff,true);
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok,
    'a practice cannot record access to a patient who never shared with it');

  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _stranger;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'and reads none of their clinical notes');

  -- ==========================================================================
  -- 2. A row written before this was enforced still grants nothing
  --
  -- Closing only the door would leave every row already through it working
  -- forever, so the gate checks consent too.
  -- ==========================================================================
  INSERT INTO public.practice_patient_access
    (practice_id,patient_user_id,primary_clinician_id,is_active)
  VALUES (_practice,_stranger,_owner,true);

  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
  PERFORM pg_temp.assert(
    public.practice_has_patient_access(_stranger) = false,
    'an existing access row is not evidence of consent');

  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _stranger;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'so the notes stay unreadable regardless');

  -- ==========================================================================
  -- 3. The legitimate path still works
  --
  -- A tightening that breaks real access is not a fix.
  -- ==========================================================================
  INSERT INTO public.practice_shares (practice_id,user_id,is_active)
  VALUES (_practice,_sharer,true);

  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.practice_patient_access
      (practice_id,patient_user_id,primary_clinician_id,is_active)
    VALUES (_practice,_sharer,_owner,true);
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_ok, 'a patient who shared can be recorded normally');

  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
  PERFORM pg_temp.assert(
    public.practice_has_patient_access(_sharer) = true,
    'and the practice reaches them');

  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _sharer;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'including their clinical notes, as intended');

  -- ==========================================================================
  -- 4. Withdrawing the share withdraws the access
  --
  -- The row stays; the consent is what moved.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _sharer::text, true);
  UPDATE public.practice_shares SET is_active = false
   WHERE practice_id = _practice AND user_id = _sharer;

  PERFORM set_config('request.jwt.claim.sub', _staff::text, true);
  PERFORM pg_temp.assert(
    public.practice_has_patient_access(_sharer) = false,
    'ending the share ends the access, whatever the access row says');

  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _sharer;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'and the notes go with it');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.practice_patient_access
      WHERE practice_id = _practice AND patient_user_id = _sharer) = 1,
    'the access row itself survives — it is a record, not a permission');

  RAISE NOTICE 'ALL PRACTICE ACCESS CONSENT TESTS PASSED';
END
$$;

ROLLBACK;
