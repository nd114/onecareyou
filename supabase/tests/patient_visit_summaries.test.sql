-- What a patient can and cannot read of what their clinician wrote.
--
-- The encounters table shipped with "Patients view their encounters" USING
-- (patient_user_id = auth.uid()) — every column of every row, drafts included,
-- scribe transcript included. Nothing in the app used it, so it never showed;
-- these assert the line that replaced it.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/patient_visit_summaries.test.sql

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
  _patient  uuid := 'c4000000-0000-0000-0000-000000000001';
  _doctor   uuid := 'c4000000-0000-0000-0000-000000000002';
  _stranger uuid := 'c4000000-0000-0000-0000-000000000003';
  _draft    uuid;
  _signed   uuid;
  _withheld uuid;
  _count integer; _txt text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'vs-patient@test.local'), (_doctor,'vs-doctor@test.local'),
    (_stranger,'vs-stranger@test.local');

  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Visit', 'vs-doctor@test.local', 'vstest',
          '{"vitals":true,"meds":true,"adherence":true,"profile":true,"documents":true}'::jsonb, true);

  INSERT INTO public.encounters
    (patient_user_id, clinician_user_id, visit_type, status, chief_complaint, assessment, plan,
     scribe_transcript, cpt_codes)
  VALUES
    (_patient, _doctor, 'follow_up', 'in_progress', 'Still being written', 'Draft assessment',
     'Draft plan', 'RAW TRANSCRIPT — everything said in the room', ARRAY['99213'])
  RETURNING id INTO _draft;

  INSERT INTO public.encounters
    (patient_user_id, clinician_user_id, visit_type, status, signed_at, chief_complaint,
     assessment, plan, scribe_transcript, cpt_codes)
  VALUES
    (_patient, _doctor, 'annual', 'signed', now(), 'Annual review', 'Diabetes well controlled',
     'Continue metformin; review in six months', 'RAW TRANSCRIPT — everything said in the room',
     ARRAY['99396'])
  RETURNING id INTO _signed;

  INSERT INTO public.encounters
    (patient_user_id, clinician_user_id, visit_type, status, signed_at, chief_complaint,
     assessment, shared_with_patient)
  VALUES
    (_patient, _doctor, 'acute', 'signed', now(), 'Withheld visit', 'Needs discussing in person', false)
  RETURNING id INTO _withheld;

  -- ==========================================================================
  -- 1. The patient reads their signed summary
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summaries();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the patient sees exactly the one signed, shared summary');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT plan INTO _txt FROM public.my_visit_summaries();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'Continue metformin; review in six months',
    'the summary carries the plan the clinician wrote');

  -- ==========================================================================
  -- 2. A note still being written is not a record
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summaries() WHERE chief_complaint = 'Still being written';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'an unsigned draft does not reach the patient');

  -- ==========================================================================
  -- 3. A withheld note stays withheld
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summaries() WHERE chief_complaint = 'Withheld visit';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'a signed note the clinician chose not to share does not reach the patient');

  -- ==========================================================================
  -- 4. The raw material behind the note is not in the summary
  --
  -- The whole reason a function replaced the row policy: RLS is row-level, so
  -- "your own encounters" meant the ambient transcript and the billing codes too.
  -- ==========================================================================
  SELECT count(*) INTO _count
    FROM information_schema.routines r
    JOIN information_schema.parameters p ON p.specific_name = r.specific_name
   WHERE r.routine_schema = 'public' AND r.routine_name = 'my_visit_summaries'
     AND p.parameter_name IN ('scribe_transcript','scribe_audio_path','scribe_draft',
                              'cpt_codes','icd_codes','metadata');
  PERFORM pg_temp.assert(_count = 0,
    'the summary returns no transcript, no audio path, no billing codes and no metadata');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'reading the encounters table directly returns the patient nothing at all');

  -- ==========================================================================
  -- 5. Someone else's visits are not yours
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_visit_summaries();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'another signed-in user reads none of these summaries');

  -- ==========================================================================
  -- 6. The clinician keeps the full note
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _patient;
  SELECT scribe_transcript INTO _txt FROM public.encounters WHERE id = _signed;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 3, 'the clinician still reads all three of their own notes');
  PERFORM pg_temp.assert(_txt LIKE 'RAW TRANSCRIPT%',
    'the clinician still reads the transcript behind their own note');

  -- ==========================================================================
  -- 7. A clinician can put a document in the patient's Vault
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.health_documents
    (user_id, uploaded_by_user_id, file_path, file_name, title, category, source_context)
  VALUES (_patient, _doctor, _patient || '/referral.pdf', 'referral.pdf',
          'Referral — ophthalmology', 'referral', 'clinician_upload');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.health_documents
   WHERE user_id = _patient AND uploaded_by_user_id = _doctor;
  PERFORM pg_temp.assert(_count = 1, 'a clinician can add a document to their patient''s Vault');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT title INTO _txt FROM public.health_documents WHERE uploaded_by_user_id = _doctor;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'Referral — ophthalmology',
    'the patient finds it in their own Vault');

  -- ==========================================================================
  -- 8. Adding is all a clinician may do
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.health_documents WHERE user_id = _patient;
  UPDATE public.health_documents SET title = 'Rewritten by the clinician' WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  PERFORM pg_temp.assert(_count = 1, 'a clinician cannot delete a document out of a patient''s Vault');
  SELECT count(*) INTO _count FROM public.health_documents WHERE title = 'Rewritten by the clinician';
  PERFORM pg_temp.assert(_count = 0, 'a clinician cannot rewrite a document in a patient''s Vault');

  -- ==========================================================================
  -- 9. Only for a patient you already have access to, and only as yourself
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.health_documents
      (user_id, uploaded_by_user_id, file_path, file_name, title, category, source_context)
    VALUES (_patient, _stranger, _patient || '/planted.pdf', 'planted.pdf',
            'Planted', 'other', 'clinician_upload');
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'a clinician with no access to the patient cannot plant a document in their Vault');

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.health_documents
      (user_id, uploaded_by_user_id, file_path, file_name, title, category, source_context)
    VALUES (_patient, _stranger, _patient || '/misattributed.pdf', 'misattributed.pdf',
            'Signed by someone else', 'other', 'clinician_upload');
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'a clinician cannot attribute a document they added to another clinician');

  -- The patient''s own uploads are unaffected by any of this.
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.health_documents (user_id, file_path, file_name, title, category)
  VALUES (_patient, _patient || '/mine.pdf', 'mine.pdf', 'My own upload', 'other');
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.health_documents
   WHERE user_id = _patient AND uploaded_by_user_id IS NULL;
  PERFORM pg_temp.assert(_count = 1, 'the patient can still upload to their own Vault');

  RAISE NOTICE 'ALL PATIENT VISIT SUMMARY TESTS PASSED';
END $$;

ROLLBACK;
