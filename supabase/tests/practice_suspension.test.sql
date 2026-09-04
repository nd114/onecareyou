-- Suspending a patient must actually suspend them, and the admin must be able
-- to do it.
--
-- Two failures, both invisible to a test running as superuser, which is why
-- most of this suite runs as `authenticated` with a JWT subject set:
--
--   * The suspend button could not work. The only UPDATE policy a practice
--     admin has on practice_shares is "can only end shares to their practice",
--     whose WITH CHECK requires is_active = false. Setting practice_suspended_at
--     leaves is_active true, so every suspend and every restore failed with an
--     RLS violation.
--
--   * Suspension gated two of six access paths. practice_has_patient_access and
--     practice_has_clinical_access honoured it; the four institution_has_*
--     helpers — which gate vitals, medications, documents, guidance,
--     appointments, invoices and care plans — did not. A "suspended" patient's
--     record stayed fully visible to institution staff, while the interface
--     said access was suspended. A false confirmation is worse than no feature.

BEGIN;

DO $$
DECLARE
  v_patient  uuid := '11111111-1111-1111-1111-111111111111';
  v_admin    uuid := '22222222-2222-2222-2222-222222222222';
  v_practice uuid := gen_random_uuid();
  v_ok       boolean;
  v_failed   boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_patient, 'patient@example.com'),
    (v_admin,   'admin@example.com');

  INSERT INTO public.practices (id, name, created_by)
  VALUES (v_practice, 'City General', v_admin);

  -- A trigger already creates the owner's membership, so this tops up the
  -- fields the helpers read rather than inserting a second one.
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (v_practice, v_admin, 'owner', 'active', true)
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active', can_view_all_patients = true;

  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (v_practice, v_patient, true, false, '{"vitals": true, "medications": true}'::jsonb);

  -- ---------------------------------------------------------------
  -- An admin can suspend, and restore
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_failed := false;
  BEGIN
    PERFORM public.set_practice_suspension(v_practice, v_patient, true);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  IF v_failed THEN
    RAISE EXCEPTION 'a practice admin could not suspend a patient';
  END IF;

  SELECT practice_suspended_at IS NOT NULL AND practice_suspended_by = v_admin INTO v_ok
  FROM public.practice_shares WHERE practice_id = v_practice AND user_id = v_patient;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'the suspension was not recorded, or not attributed to whoever did it';
  END IF;
  RAISE NOTICE 'a practice admin can suspend a patient, and it is attributed: t';

  -- ---------------------------------------------------------------
  -- Suspension denies every institution path, not two of them
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT public.institution_has_patient_access(v_patient) INTO v_ok;
  IF v_ok THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'a suspended patient is still reachable through institution_has_patient_access';
  END IF;

  SELECT public.institution_has_patient_permission(v_patient, 'vitals') INTO v_ok;
  IF v_ok THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'a suspended patient''s vitals are still readable by institution staff';
  END IF;

  SELECT public.institution_has_clinical_access(v_patient) INTO v_ok;
  IF v_ok THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'a suspended patient is still reachable through institution_has_clinical_access';
  END IF;

  SELECT public.institution_has_clinical_permission(v_patient, 'medications') INTO v_ok;
  IF v_ok THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'a suspended patient''s medications are still readable by institution staff';
  END IF;

  SELECT public.practice_has_patient_access(v_patient) INTO v_ok;
  IF v_ok THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'a suspended patient is still reachable through practice_has_patient_access';
  END IF;
  EXECUTE 'SET LOCAL ROLE postgres';
  RAISE NOTICE 'suspension denies every access path, not two of six: t';

  -- ---------------------------------------------------------------
  -- Restoring puts it back
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_practice_suspension(v_practice, v_patient, false);
  SELECT public.institution_has_patient_permission(v_patient, 'vitals') INTO v_ok;
  EXECUTE 'SET LOCAL ROLE postgres';
  IF NOT v_ok THEN
    RAISE EXCEPTION 'restoring access did not restore it';
  END IF;
  RAISE NOTICE 'restoring access restores it: t';

  -- ---------------------------------------------------------------
  -- The patient's own switch stays the patient's
  -- ---------------------------------------------------------------
  -- practice_shares.is_active is the patient's decision. A practice suspending
  -- somebody must never be able to write it, or the practice could revoke on
  -- the patient's behalf and the patient could not tell the difference.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_failed := false;
  BEGIN
    UPDATE public.practice_shares SET is_active = true
    WHERE practice_id = v_practice AND user_id = v_patient;
    IF NOT FOUND THEN v_failed := true; END IF;
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  IF NOT v_failed THEN
    RAISE EXCEPTION 'a practice admin could write the patient''s own is_active switch';
  END IF;
  RAISE NOTICE 'the patient''s own switch is still only the patient''s: t';

  -- ---------------------------------------------------------------
  -- Somebody who does not run the practice cannot suspend for it
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_failed := false;
  BEGIN
    PERFORM public.set_practice_suspension(v_practice, v_patient, true);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  IF NOT v_failed THEN
    RAISE EXCEPTION 'somebody outside the practice suspended a patient on its behalf';
  END IF;
  RAISE NOTICE 'only somebody who runs the practice can suspend for it: t';

  RAISE NOTICE 'ALL PRACTICE SUSPENSION TESTS PASSED';
END $$;

ROLLBACK;
