-- Hospital staff create patient records; how someone came onboard is recorded once.
--
-- The identity rule this defends: a person has ONE OneCare identity. The
-- pre-claim row has an id, but that is the id of a record, not a second
-- identity for the human — and a tenant's own reference is an attribute
-- (external_mrn), never a competing key. Two ids for one person is how a record
-- gets merged wrongly, or billed twice, or attributed to nobody.
BEGIN;

DO $$
DECLARE
  v_practice uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_nurse uuid := gen_random_uuid();
  v_biller uuid := gen_random_uuid();
  v_patient uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_record uuid := gen_random_uuid();
  v_count int;
  v_via uuid;
  v_source text;
  v_ok boolean;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_owner,'owner@example.com',now()), (v_nurse,'nurse@example.com',now()),
    (v_biller,'biller@example.com',now()), (v_patient,'patient@example.com',now()),
    (v_other,'other@example.com',now());
  INSERT INTO public.profiles(user_id) VALUES (v_patient) ON CONFLICT DO NOTHING;

  INSERT INTO public.practices(id,name,created_by) VALUES (v_practice,'St Martins Hospital',v_owner);
  INSERT INTO public.practice_members(practice_id,user_id,role,status)
    VALUES (v_practice,v_owner,'owner','active')
    ON CONFLICT (practice_id,user_id) DO UPDATE SET role='owner', status='active';
  INSERT INTO public.practice_members(practice_id,user_id,role,status)
    VALUES (v_practice,v_nurse,'nurse','active') ON CONFLICT DO NOTHING;
  INSERT INTO public.practice_members(practice_id,user_id,role,status)
    VALUES (v_practice,v_biller,'billing','active') ON CONFLICT DO NOTHING;

  -- A nurse creates a record for someone not yet on OneCare.
  PERFORM set_config('request.jwt.claim.sub', v_nurse::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.clinician_patient_records
    (id, clinician_user_id, practice_id, patient_name, patient_email, external_mrn)
  VALUES (v_record, v_nurse, v_practice, 'Jane Evans', 'patient@example.com', 'MRN-4471');
  RESET ROLE;
  RAISE NOTICE 'ok — authorized clinical staff can create a record';

  -- A colleague at the same practice can read it. Before this it was visible
  -- only to its author, so cover and oversight both failed.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.clinician_patient_records WHERE id = v_record;
  RESET ROLE;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL: the practice owner cannot see a record their practice created'; END IF;
  RAISE NOTICE 'ok — the practice sees records it created';

  -- Somebody outside the practice sees nothing.
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.clinician_patient_records WHERE id = v_record;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: a stranger read a practice record'; END IF;
  RAISE NOTICE 'ok — nobody outside the practice sees it';

  -- Claiming stamps how the person came onboard.
  UPDATE public.clinician_patient_records
     SET linked_user_id = v_patient, invitation_status = 'accepted'
   WHERE id = v_record;

  SELECT onboarded_via_practice_id, onboarding_source INTO v_via, v_source
    FROM public.profiles WHERE user_id = v_patient;
  IF v_via IS DISTINCT FROM v_practice THEN
    RAISE EXCEPTION 'FAIL: the introducing practice was not recorded';
  END IF;
  IF v_source IS NULL THEN RAISE EXCEPTION 'FAIL: no onboarding source recorded'; END IF;
  RAISE NOTICE 'ok — the introducing practice is recorded on the profile';

  -- And cannot be rewritten. An attribution that can be edited is a claim by
  -- whoever edited last, which is no basis for a revenue split.
  v_ok := false;
  BEGIN
    UPDATE public.profiles SET onboarded_via_practice_id = gen_random_uuid()
     WHERE user_id = v_patient;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL: the introduction was rewritten'; END IF;
  RAISE NOTICE 'ok — the introduction is immutable once recorded';

  -- The patient keeps ONE identity: the record links to their user_id rather
  -- than standing in for it, and the hospital's MRN is an attribute beside it.
  IF (SELECT linked_user_id FROM public.clinician_patient_records WHERE id = v_record) <> v_patient THEN
    RAISE EXCEPTION 'FAIL: the record does not resolve to the patient''s own identity';
  END IF;
  IF (SELECT external_mrn FROM public.clinician_patient_records WHERE id = v_record) <> 'MRN-4471' THEN
    RAISE EXCEPTION 'FAIL: the hospital reference was lost';
  END IF;
  RAISE NOTICE 'ok — one identity, with the hospital reference kept beside it';

  -- A claimed record belongs to the patient; staff stop editing it.
  PERFORM set_config('request.jwt.claim.sub', v_nurse::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.clinician_patient_records SET patient_name = 'Changed' WHERE id = v_record;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL: staff edited a record the patient had claimed'; END IF;
  RAISE NOTICE 'ok — a claimed record is the patient''s';

  RAISE NOTICE 'practice_created_patients: 7 assertions passed';
END $$;

ROLLBACK;
