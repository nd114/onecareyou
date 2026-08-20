-- A clinician can record an observation into their patient's chart.
--
-- vitals accepted INSERT only from `auth.uid() = user_id`, so every clinical
-- route into a patient's readings dead-ended: a blood pressure taken in the
-- room, a device at the bedside, and the dictation that mentioned one. The
-- dictation surface transcribed and summarised and then stopped, because there
-- was nowhere for any of it to go.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/dictation_filing.test.sql

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
  _patient   uuid := 'd5000000-0000-0000-0000-000000000001';
  _doctor    uuid := 'd5000000-0000-0000-0000-000000000002';
  _novitals  uuid := 'd5000000-0000-0000-0000-000000000003';
  _stranger  uuid := 'd5000000-0000-0000-0000-000000000004';
  _enc uuid; _dict uuid;
  _count integer; _txt text; _num numeric;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'df-patient@test.local'), (_doctor,'df-doctor@test.local'),
    (_novitals,'df-novitals@test.local'), (_stranger,'df-stranger@test.local');

  -- One clinician the patient shares vitals with, one they do not.
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES
    (_patient, _doctor, 'Dr Dictation', 'df-doctor@test.local', 'dfdoc',
     '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb, true),
    (_patient, _novitals, 'Dr NoVitals', 'df-novitals@test.local', 'dfnov',
     '{"vitals":false,"meds":true,"adherence":false,"profile":true}'::jsonb, true);

  -- ==========================================================================
  -- 1. The reading the clinician took goes in the chart
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.vitals (user_id, recorded_by_user_id, source, type, value, secondary_value, unit, notes)
  VALUES (_patient, _doctor, 'clinician', 'blood_pressure', 128, 82, 'mmHg',
          'Dictated: "blood pressure one twenty eight over eighty two"');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.vitals
   WHERE user_id = _patient AND recorded_by_user_id = _doctor;
  PERFORM pg_temp.assert(_count = 1, 'a clinician can record a reading for their patient');

  SELECT value INTO _num FROM public.vitals WHERE recorded_by_user_id = _doctor;
  PERFORM pg_temp.assert(_num = 128, 'the reading is stored as dictated');

  -- ==========================================================================
  -- 2. It is attributable, and it says so in the row
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.vitals (user_id, recorded_by_user_id, source, type, value, unit)
    VALUES (_patient, _stranger, 'clinician', 'heart_rate', 72, 'bpm');
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'a clinician cannot attribute a reading they recorded to someone else');

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.vitals (user_id, recorded_by_user_id, source, type, value, unit)
    VALUES (_patient, _doctor, 'manual', 'heart_rate', 72, 'bpm');
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'a clinician-recorded reading cannot pass itself off as the patient''s own entry');

  -- ==========================================================================
  -- 3. Only where the patient shares vitals
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _novitals::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.vitals (user_id, recorded_by_user_id, source, type, value, unit)
    VALUES (_patient, _novitals, 'clinician', 'weight', 80, 'kg');
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'a clinician the patient does not share vitals with cannot record one');

  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.vitals (user_id, recorded_by_user_id, source, type, value, unit)
    VALUES (_patient, _stranger, 'clinician', 'weight', 80, 'kg');
    _txt := 'inserted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    _txt := 'refused';
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_txt = 'refused',
    'a clinician with no relationship at all cannot record one');

  -- ==========================================================================
  -- 4. Recording is all a clinician may do
  --
  -- Same asymmetry the Vault got: it is the patient's record. A clinician who
  -- mis-recorded adds the correction rather than erasing the history.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.vitals SET value = 999 WHERE user_id = _patient;
  DELETE FROM public.vitals WHERE user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.vitals WHERE user_id = _patient;
  PERFORM pg_temp.assert(_count = 1, 'a clinician cannot delete a reading from the chart');
  SELECT value INTO _num FROM public.vitals WHERE user_id = _patient;
  PERFORM pg_temp.assert(_num = 128, 'a clinician cannot rewrite a reading in the chart');

  -- The patient stays in charge of their own record.
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.vitals (user_id, type, value, unit) VALUES (_patient, 'weight', 78, 'kg');
  DELETE FROM public.vitals WHERE user_id = _patient AND recorded_by_user_id = _doctor;
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO _count FROM public.vitals WHERE user_id = _patient;
  PERFORM pg_temp.assert(_count = 1,
    'the patient can still add their own readings and remove one recorded for them');

  -- ==========================================================================
  -- 5. A dictation records what it became
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, visit_type, status, plan)
  VALUES (_patient, _doctor, 'follow_up', 'in_progress', 'Continue as discussed')
  RETURNING id INTO _enc;

  INSERT INTO public.clinician_dictations
    (clinician_user_id, patient_user_id, audio_path, transcript, summary, status,
     encounter_id, filed_at)
  VALUES (_doctor, _patient, _doctor || '/take1.webm', 'transcript', 'summary', 'filed',
          _enc, now())
  RETURNING id INTO _dict;
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.clinician_dictations
   WHERE encounter_id = _enc AND filed_at IS NOT NULL;
  PERFORM pg_temp.assert(_count = 1, 'a filed dictation points at the encounter it became');

  -- ==========================================================================
  -- 6. The recording stays with whoever made it
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _novitals::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.clinician_dictations WHERE encounter_id = _enc;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'a colleague who can see the encounter still cannot read the dictation behind it');

  -- ==========================================================================
  -- 7. Deleting the encounter does not delete the dictation
  -- ==========================================================================
  DELETE FROM public.encounters WHERE id = _enc;
  SELECT count(*) INTO _count FROM public.clinician_dictations WHERE id = _dict;
  PERFORM pg_temp.assert(_count = 1, 'the dictation survives the encounter it was filed into');
  SELECT count(*) INTO _count FROM public.clinician_dictations
   WHERE id = _dict AND encounter_id IS NULL;
  PERFORM pg_temp.assert(_count = 1, 'and its link is cleared rather than left dangling');

  RAISE NOTICE 'ALL DICTATION FILING TESTS PASSED';
END $$;

ROLLBACK;
