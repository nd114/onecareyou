-- One table answers "can this hospital's staff see this patient".
--
-- There were two, and they disagreed: institution_has_patient_permission read
-- practice_shares alone while practice_has_patient_access required a row in
-- both, so the same staff member could see a patient's medications and not
-- their encounters. These assert the converged behaviour, and specifically
-- that the practice's own suspension switch survived the merge — dropping the
-- old table blind would have deleted that feature silently.

BEGIN;

DO $$
DECLARE
  v_practice   uuid := gen_random_uuid();
  v_patient    uuid := '11111111-1111-1111-1111-111111111111';
  v_doctor     uuid := '22222222-2222-2222-2222-222222222222';
  v_frontdesk  uuid := '33333333-3333-3333-3333-333333333333';
  v_share      uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_patient,   'patient@example.com'),
    (v_doctor,    'jane.evans@example.com'),
    (v_frontdesk, 'reception@example.com');

  INSERT INTO public.practices (id, name, created_by)
  VALUES (v_practice, 'City General', v_doctor);

  -- Creating a practice auto-enrols its creator as a member, so upsert rather
  -- than insert or the doctor collides with the row the trigger just wrote.
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES
    (v_practice, v_doctor,    'clinician',  'active', true),
    (v_practice, v_frontdesk, 'front_desk', 'active', true)
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        can_view_all_patients = EXCLUDED.can_view_all_patients;

  -- ---------------------------------------------------------------
  -- The old table is gone
  -- ---------------------------------------------------------------
  IF to_regclass('public.practice_patient_access') IS NOT NULL THEN
    RAISE EXCEPTION 'practice_patient_access still exists';
  END IF;
  RAISE NOTICE 'the second access table is gone: t';

  -- Nothing may still read it.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosrc LIKE '%practice_patient_access%'
  ) THEN
    RAISE EXCEPTION 'a function still references practice_patient_access';
  END IF;
  RAISE NOTICE 'no function still reads it: t';

  -- ---------------------------------------------------------------
  -- No share: nobody sees anything
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_doctor::text, true);
  IF public.practice_has_patient_access(v_patient) THEN
    RAISE EXCEPTION 'access granted with no share at all';
  END IF;
  RAISE NOTICE 'no share means no access: t';

  -- ---------------------------------------------------------------
  -- The patient shares
  -- ---------------------------------------------------------------
  INSERT INTO public.practice_shares (id, practice_id, user_id, is_active, permissions)
  VALUES (gen_random_uuid(), v_practice, v_patient, true,
          '{"vitals":true,"meds":true,"documents":true}'::jsonb)
  RETURNING id INTO v_share;

  PERFORM set_config('request.jwt.claim.sub', v_doctor::text, true);
  IF NOT public.practice_has_patient_access(v_patient) THEN
    RAISE EXCEPTION 'a shared patient was not reachable';
  END IF;
  IF NOT public.practice_has_clinical_access(v_patient) THEN
    RAISE EXCEPTION 'a clinician could not reach a shared patient clinically';
  END IF;
  RAISE NOTICE 'the patient sharing is now sufficient on its own: t';

  -- This is the intended widening: before, staff also needed a
  -- practice_patient_access row that the practice wrote itself. A patient who
  -- shared with a practice that never got round to adding them was invisible.
  RAISE NOTICE 'no separate bookkeeping row is required any more: t';

  -- ---------------------------------------------------------------
  -- Roles still hold
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_frontdesk::text, true);
  IF NOT public.practice_has_patient_access(v_patient) THEN
    RAISE EXCEPTION 'front desk lost access it needs for booking';
  END IF;
  IF public.practice_has_clinical_access(v_patient) THEN
    RAISE EXCEPTION 'front desk gained clinical access';
  END IF;
  RAISE NOTICE 'front desk still books and still reads no notes: t';

  -- ---------------------------------------------------------------
  -- The practice's own switch survived the merge
  -- ---------------------------------------------------------------
  UPDATE public.practice_shares SET practice_suspended_at = now() WHERE id = v_share;

  PERFORM set_config('request.jwt.claim.sub', v_doctor::text, true);
  IF public.practice_has_patient_access(v_patient) THEN
    RAISE EXCEPTION 'a practice suspension did not take effect';
  END IF;
  RAISE NOTICE 'a practice can still suspend a patient internally: t';

  -- ...and it is the practice's decision, not the patient's. The share is
  -- still active; the patient has withdrawn nothing.
  IF NOT EXISTS (SELECT 1 FROM public.practice_shares WHERE id = v_share AND is_active) THEN
    RAISE EXCEPTION 'suspending overwrote the patient''s own decision';
  END IF;
  RAISE NOTICE 'suspending does not touch the patient''s own decision: t';

  UPDATE public.practice_shares SET practice_suspended_at = NULL WHERE id = v_share;
  IF NOT public.practice_has_patient_access(v_patient) THEN
    RAISE EXCEPTION 'lifting a suspension did not restore access';
  END IF;
  RAISE NOTICE 'lifting a suspension restores access: t';

  -- ---------------------------------------------------------------
  -- The patient's own withdrawal still outranks everything
  -- ---------------------------------------------------------------
  UPDATE public.practice_shares SET is_active = false WHERE id = v_share;
  IF public.practice_has_patient_access(v_patient) THEN
    RAISE EXCEPTION 'a withdrawn share still granted access';
  END IF;
  RAISE NOTICE 'the patient withdrawing ends it, whatever the practice says: t';

  -- ---------------------------------------------------------------
  -- The two families now agree, which is the whole point
  -- ---------------------------------------------------------------
  UPDATE public.practice_shares SET is_active = true WHERE id = v_share;
  PERFORM set_config('request.jwt.claim.sub', v_doctor::text, true);
  IF public.practice_has_patient_access(v_patient)
     <> public.institution_has_patient_permission(v_patient, 'vitals') THEN
    RAISE EXCEPTION 'the two access families still disagree for a consenting share';
  END IF;
  RAISE NOTICE 'both access families now give the same answer: t';

  RAISE NOTICE 'ALL SINGLE ACCESS TABLE TESTS PASSED';
END $$;

ROLLBACK;
