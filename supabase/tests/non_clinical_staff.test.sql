-- Front desk is not a clinician.
--
-- Ten roles existed and meant nothing: practice_role_permissions was empty and
-- access was decided entirely by can_view_all_patients, so a receptionist given
-- the roster read signed assessments and ambient transcripts alongside the
-- diary. This suite holds the split that fixed it.
--
-- Both halves are asserted. A rule that only takes things away is easy and
-- wrong: a receptionist who cannot see the appointment book cannot do the job
-- they were hired for, and a platform that stops them is not protecting anyone.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/non_clinical_staff.test.sql

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
  _patient uuid := '4c000000-0000-0000-0000-00000000000a';
  _doctor  uuid := '4c000000-0000-0000-0000-00000000000b';
  _desk    uuid := '4c000000-0000-0000-0000-00000000000c';
  _biller  uuid := '4c000000-0000-0000-0000-00000000000d';
  _nurse   uuid := '4c000000-0000-0000-0000-00000000000e';
  _owner   uuid := '4c000000-0000-0000-0000-00000000000f';
  _practice uuid := '4c000000-0000-0000-0000-0000000000c1';
  _enc uuid; _count integer;
  _med uuid; _who uuid; _label text; _blocked boolean;
  _conditions jsonb; _allergies jsonb;
BEGIN
  INSERT INTO auth.users (id,email) VALUES
    (_patient,'nc-p@test.local'), (_doctor,'nc-d@test.local'), (_desk,'nc-fd@test.local'),
    (_biller,'nc-b@test.local'), (_nurse,'nc-n@test.local'), (_owner,'nc-o@test.local');

  INSERT INTO public.practices (id,name,created_by,tenant_type)
  VALUES (_practice,'General Hospital',_owner,'hospital');

  -- Everyone has the roster. Only their role differs.
  INSERT INTO public.practice_members (practice_id,user_id,role,status,can_view_all_patients)
  VALUES (_practice,_doctor,'provider','active',true),
         (_practice,_desk,'front_desk','active',true),
         (_practice,_biller,'billing','active',true),
         (_practice,_nurse,'nurse','active',true);

  INSERT INTO public.practice_shares (practice_id,user_id,is_active)
  VALUES (_practice,_patient,true);
  -- practice_patient_access is gone: the one-access-table migration moved the
  -- practice's own suspension onto practice_shares and left assignment to
  -- practice_patient_assignments. This fixture had not been updated, so the
  -- suite had not run since — which is what the runner exists to surface.
  INSERT INTO public.practice_patient_assignments
    (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_practice, _patient, _doctor, _doctor);

  INSERT INTO public.encounters
    (patient_user_id,clinician_user_id,practice_id,visit_type,status,signed_at,assessment,scribe_transcript)
  VALUES (_patient,_doctor,_practice,'annual','signed',now(),
          'Depression, started sertraline','everything said in the room')
  RETURNING id INTO _enc;

  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_patient,_doctor,'Family situation is difficult','team');

  INSERT INTO public.vitals (user_id,type,value,unit,recorded_at)
  VALUES (_patient,'blood_pressure',128,'mmHg',now());

  INSERT INTO public.fhir_appointments
    (patient_user_id,clinician_user_id,practice_id,status,start_time,end_time,created_by)
  VALUES (_patient,_doctor,_practice,'booked',now()+interval '7 days',
          now()+interval '7 days 30 minutes',_doctor);

  INSERT INTO public.fhir_invoices (patient_user_id,practice_id,status,created_by,issued_at)
  VALUES (_patient,_practice,'issued',_doctor,now());

  -- The rest of the clinical record: what they take, whether they take it,
  -- the letters and results they filed, and what they are known to have.
  INSERT INTO public.medications (user_id,name,dosage,frequency)
  VALUES (_patient,'Sertraline','50mg','daily')
  RETURNING id INTO _med;

  INSERT INTO public.schedule_entries (user_id,medication_id,scheduled_time,status)
  VALUES (_patient,_med,now()-interval '1 day','taken');

  INSERT INTO public.health_documents (user_id,file_path,file_name,category)
  VALUES (_patient,_patient::text || '/discharge.pdf','discharge.pdf','other');

  UPDATE public.profiles
     SET health_conditions = '["Major depressive disorder"]'::jsonb,
         allergies         = '["Penicillin"]'::jsonb
   WHERE user_id = _patient;

  -- ==========================================================================
  -- 1. The receptionist does not read the clinical record
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _desk::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'front desk reads no clinical notes');

  PERFORM set_config('request.jwt.claim.sub', _desk::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.internal_notes WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'nor the team notes about the patient');

  PERFORM set_config('request.jwt.claim.sub', _desk::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.vitals WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'nor their readings');

  -- ==========================================================================
  -- 2. But they can do their job
  --
  -- The half that makes this a fix rather than a restriction.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _desk::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_appointments WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'front desk sees the appointment, which is their work');

  PERFORM set_config('request.jwt.claim.sub', _biller::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_invoices WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'billing staff see the invoice, which is theirs');

  PERFORM set_config('request.jwt.claim.sub', _biller::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'and billing staff read no clinical notes either');

  -- ==========================================================================
  -- 3. Clinical roles are unaffected
  --
  -- A change that quietly took access from a nurse would be a worse bug than
  -- the one it fixed.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the doctor still reads the note');

  PERFORM set_config('request.jwt.claim.sub', _nurse::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'and so does the nurse');

  PERFORM set_config('request.jwt.claim.sub', _nurse::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.vitals WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'including the readings they take');

  -- ==========================================================================
  -- 4. Nor the rest of the record, and they cannot write to it
  --
  -- Vitals were fixed and medications, adherence, documents and the
  -- diagnosis/allergy profile were not, so a receptionist could still read
  -- "Sertraline 50mg, taken yesterday" and "Major depressive disorder". The
  -- same gap let them record a reading or propose a prescription change.
  -- ==========================================================================
  FOREACH _who IN ARRAY ARRAY[_desk, _biller] LOOP
    _label := CASE WHEN _who = _desk THEN 'front desk' ELSE 'billing' END;

    PERFORM set_config('request.jwt.claim.sub', _who::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO _count FROM public.medications WHERE user_id = _patient;
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM pg_temp.assert(_count = 0, _label || ' reads no medications');

    PERFORM set_config('request.jwt.claim.sub', _who::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO _count FROM public.schedule_entries WHERE user_id = _patient;
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM pg_temp.assert(_count = 0, _label || ' reads no adherence history');

    PERFORM set_config('request.jwt.claim.sub', _who::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM pg_temp.assert(_count = 0, _label || ' reads no documents');

    _conditions := NULL; _allergies := NULL;
    PERFORM set_config('request.jwt.claim.sub', _who::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT cp.health_conditions, cp.allergies INTO _conditions, _allergies
      FROM public.get_patient_clinical_profile(ARRAY[_patient]) cp;
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM pg_temp.assert(_conditions IS NULL AND _allergies IS NULL,
      _label || ' gets no diagnoses or allergies from the clinical profile');

    _blocked := false;
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', _who::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      INSERT INTO public.vitals (user_id,type,value,unit,recorded_at,source,recorded_by_user_id)
      VALUES (_patient,'heart_rate',72,'bpm',now()-interval '2 hours','clinician',_who);
      EXECUTE 'SET LOCAL ROLE postgres';
    EXCEPTION WHEN insufficient_privilege THEN
      _blocked := true;
    END;
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM pg_temp.assert(_blocked, _label || ' cannot record a vital');

    _blocked := false;
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', _who::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      INSERT INTO public.record_change_proposals
        (patient_user_id,proposed_by_user_id,kind,payload)
      VALUES (_patient,_who,'medication_start','{"name":"Lorazepam"}'::jsonb);
      EXECUTE 'SET LOCAL ROLE postgres';
    EXCEPTION WHEN insufficient_privilege THEN
      _blocked := true;
    END;
    EXECUTE 'SET LOCAL ROLE postgres';
    PERFORM pg_temp.assert(_blocked, _label || ' cannot propose a medication change');
  END LOOP;

  -- ==========================================================================
  -- 5. While the clinical team keeps all of it
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _nurse::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.medications WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the nurse reads the medication list');

  PERFORM set_config('request.jwt.claim.sub', _nurse::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.schedule_entries WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'and whether the doses were taken');

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.health_documents WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the doctor reads the shared document');

  _conditions := NULL; _allergies := NULL;
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT cp.health_conditions, cp.allergies INTO _conditions, _allergies
    FROM public.get_patient_clinical_profile(ARRAY[_patient]) cp;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_conditions = '["Major depressive disorder"]'::jsonb
                         AND _allergies = '["Penicillin"]'::jsonb,
    'and the diagnoses and allergies');

  PERFORM set_config('request.jwt.claim.sub', _nurse::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.vitals (user_id,type,value,unit,recorded_at,source,recorded_by_user_id)
  VALUES (_patient,'heart_rate',72,'bpm',now()-interval '2 hours','clinician',_nurse);
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.vitals
   WHERE user_id = _patient AND recorded_by_user_id = _nurse;
  PERFORM pg_temp.assert(_count = 1, 'the nurse records a reading');

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.record_change_proposals
    (patient_user_id,proposed_by_user_id,kind,payload)
  VALUES (_patient,_doctor,'medication_start','{"name":"Lorazepam"}'::jsonb);
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.record_change_proposals
   WHERE patient_user_id = _patient AND proposed_by_user_id = _doctor;
  PERFORM pg_temp.assert(_count = 1, 'the doctor proposes a medication change');

  -- ==========================================================================
  -- 6. The classifier itself
  --
  -- An allowlist: a role added later is not clinical until somebody says so.
  -- ==========================================================================
  PERFORM pg_temp.assert(public.practice_role_is_clinical('provider'), 'provider is clinical');
  PERFORM pg_temp.assert(public.practice_role_is_clinical('clinician'), 'clinician is clinical');
  PERFORM pg_temp.assert(public.practice_role_is_clinical('nurse'), 'nurse is clinical');
  PERFORM pg_temp.assert(public.practice_role_is_clinical('owner'), 'owner is clinical — usually the doctor here');
  PERFORM pg_temp.assert(public.practice_role_is_clinical('sub_admin'), 'a department lead is clinical');
  PERFORM pg_temp.assert(NOT public.practice_role_is_clinical('front_desk'), 'front_desk is not');
  PERFORM pg_temp.assert(NOT public.practice_role_is_clinical('billing'), 'billing is not');
  PERFORM pg_temp.assert(NOT public.practice_role_is_clinical('read_only'), 'read_only is not');
  PERFORM pg_temp.assert(NOT public.practice_role_is_clinical('staff'), 'the generic staff role is not');

  -- ==========================================================================
  -- 7. Losing the clinical role loses the clinical reach
  -- ==========================================================================
  UPDATE public.practice_members SET role = 'front_desk'
   WHERE practice_id = _practice AND user_id = _nurse;

  PERFORM set_config('request.jwt.claim.sub', _nurse::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.encounters WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'moving someone to a non-clinical role takes the record away');

  RAISE NOTICE 'ALL NON-CLINICAL STAFF TESTS PASSED';
END
$$;

ROLLBACK;
