-- "Removed from your record, along with anything added to your record from
-- it" — docs/guide/notifications-and-privacy.md's promise to the patient.
-- withdraw_shared_file() stopped access to the document; this asserts it now
-- also removes the vitals and medications that document produced, and only
-- for the two reason codes that mean the values were never this patient's.

BEGIN;

DO $$
DECLARE
  v_doc_id        uuid := gen_random_uuid();
  v_other_doc_id  uuid := gen_random_uuid();
  v_clinician     uuid := gen_random_uuid();
  v_wrong_patient uuid := gen_random_uuid();
  v_vital_id      uuid;
  v_med_id        uuid;
  v_count         int;
  v_details       jsonb;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
    (v_clinician,     'clinician@example.com', now()),
    (v_wrong_patient, 'wrong.patient@example.com', now());

  INSERT INTO public.health_documents
    (id, user_id, uploaded_by_user_id, file_path, file_name, category, created_at)
  VALUES
    (v_doc_id, v_wrong_patient, v_clinician, 'x/lab.pdf', 'Lab report.pdf', 'lab_result', now()),
    (v_other_doc_id, v_wrong_patient, v_wrong_patient, 'x/other.pdf', 'Own report.pdf', 'lab_result', now());

  INSERT INTO public.vitals (id, user_id, type, value, unit, source, source_document_id)
  VALUES (gen_random_uuid(), v_wrong_patient, 'glucose', 350, 'mg/dL', 'manual', v_doc_id)
  RETURNING id INTO v_vital_id;

  INSERT INTO public.medications (id, user_id, name, dosage, frequency, source_document_id)
  VALUES (gen_random_uuid(), v_wrong_patient, 'Metformin', '500mg', 'twice daily', v_doc_id)
  RETURNING id INTO v_med_id;

  -- A reading from the patient's own, unrelated document — must survive.
  INSERT INTO public.vitals (id, user_id, type, value, unit, source, source_document_id)
  VALUES (gen_random_uuid(), v_wrong_patient, 'weight', 70, 'kg', 'manual', v_other_doc_id);

  -- ---------------------------------------------------------------
  -- Withdrawn as wrong-patient data: the derived values go with it
  -- ---------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  PERFORM public.withdraw_shared_file(v_doc_id, NULL, 'wrong_recipient', 'Filed to the wrong patient', NULL, NULL, NULL);

  SELECT count(*) INTO v_count FROM public.vitals WHERE id = v_vital_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: a wrong-patient vital survived its document''s withdrawal';
  END IF;
  RAISE NOTICE 'the wrong-patient vital is gone: t';

  SELECT count(*) INTO v_count FROM public.medications WHERE id = v_med_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: a wrong-patient medication survived its document''s withdrawal';
  END IF;
  RAISE NOTICE 'the wrong-patient medication is gone: t';

  -- The unrelated document's own reading is untouched.
  SELECT count(*) INTO v_count FROM public.vitals WHERE source_document_id = v_other_doc_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: an unrelated document''s reading was removed too';
  END IF;
  RAISE NOTICE 'a reading from a different document is untouched: t';

  -- The removal itself is audited, naming what was removed and why.
  SELECT details INTO v_details FROM public.hipaa_audit_logs
   WHERE resource_id = v_doc_id::text AND action = 'derived_data_removed';
  IF v_details IS NULL THEN
    RAISE EXCEPTION 'FAIL: the derived-data removal left no audit trail';
  END IF;
  IF (v_details->>'vitals_removed')::int <> 1 OR (v_details->>'medications_removed')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: the audit counts are wrong: %', v_details;
  END IF;
  RAISE NOTICE 'the removal is audited with correct counts: t';

  -- The row and file of the document itself still survive — this removes
  -- access and the values it produced, never the evidence of the incident.
  IF (SELECT count(*) FROM public.health_documents WHERE id = v_doc_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: the document row itself was deleted, not just its access';
  END IF;

  RAISE NOTICE 'ALL DERIVED DATA CASCADE TESTS PASSED (wrong-patient case)';
END $$;

ROLLBACK;

-- A second, separate transaction: a reason code that is NOT about wrong-
-- patient data must never cascade. This is still the patient's own data,
-- just sent in error — docs/withdrawal-and-derived-data.md §3's limit on
-- when authorship stops mattering does not apply here.
BEGIN;

DO $$
DECLARE
  v_doc_id    uuid := gen_random_uuid();
  v_clinician uuid := gen_random_uuid();
  v_patient   uuid := gen_random_uuid();
  v_vital_id  uuid;
  v_count     int;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
    (v_clinician, 'clinician2@example.com', now()),
    (v_patient,   'patient2@example.com', now());

  INSERT INTO public.health_documents
    (id, user_id, uploaded_by_user_id, file_path, file_name, category, created_at)
  VALUES (v_doc_id, v_patient, v_clinician, 'x/note.pdf', 'Note.pdf', 'other', now());

  INSERT INTO public.vitals (id, user_id, type, value, unit, source, source_document_id)
  VALUES (gen_random_uuid(), v_patient, 'weight', 68, 'kg', 'manual', v_doc_id)
  RETURNING id INTO v_vital_id;

  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  PERFORM public.withdraw_shared_file(v_doc_id, NULL, 'sent_in_error', 'Wrong document, right patient', NULL, NULL, NULL);

  SELECT count(*) INTO v_count FROM public.vitals WHERE id = v_vital_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: the patient''s own reading was removed on a non-wrong-patient reason code';
  END IF;

  RAISE NOTICE 'ALL DERIVED DATA CASCADE TESTS PASSED (own-data case: nothing removed)';
END $$;

ROLLBACK;
