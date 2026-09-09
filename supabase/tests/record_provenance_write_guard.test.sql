-- The rule isMedicationEditable() and isVitalEditable() state on the client —
-- a row someone else recorded is theirs to change, not the patient's — tested
-- directly against RLS rather than trusted.
--
-- Before 20260929100000_the_record_is_not_the_patients_to_rewrite.sql, vitals
-- had no source check on UPDATE or DELETE at all, and medications had one on
-- DELETE but not UPDATE. Both were reachable directly through PostgREST with
-- no client code in the way, and vitals' DELETE was additionally reachable
-- through the assistant's delete_vital action, which never checked source.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/record_provenance_write_guard.test.sql

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
  _patient uuid := gen_random_uuid();
  _clin    uuid := gen_random_uuid();
  _vital   uuid;
  _med     uuid;
  _own_vital uuid;
  _n int;
  _v numeric;
  _d text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient, 'rpwg-patient@test.local'), (_clin, 'rpwg-clin@test.local');

  INSERT INTO public.vitals (user_id, type, value, unit, source, recorded_by_user_id)
  VALUES (_patient, 'blood_pressure', 148, 'mmHg', 'clinician', _clin)
  RETURNING id INTO _vital;

  INSERT INTO public.vitals (user_id, type, value, unit, source)
  VALUES (_patient, 'weight', 70, 'kg', 'manual')
  RETURNING id INTO _own_vital;

  INSERT INTO public.medications (user_id, name, dosage, frequency, source, external_id)
  VALUES (_patient, 'Warfarin', '5 mg', 'once_daily', 'City General EHR', 'mr-rpwg')
  RETURNING id INTO _med;

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- ---------------------------------------------------------------------
  -- A clinician-recorded vital: neither writable nor erasable by the patient.
  -- ---------------------------------------------------------------------
  UPDATE public.vitals SET value = 90 WHERE id = _vital;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 0, 'the patient cannot rewrite the clinician''s reading');

  DELETE FROM public.vitals WHERE id = _vital;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 0, 'the patient cannot delete the clinician''s reading');

  SELECT value INTO _v FROM public.vitals WHERE id = _vital;
  PERFORM pg_temp.assert(_v = 148, 'the reading is unchanged after both attempts');

  -- ---------------------------------------------------------------------
  -- Their own manual reading is unaffected by the guard.
  -- ---------------------------------------------------------------------
  UPDATE public.vitals SET value = 71 WHERE id = _own_vital;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'the patient can still edit their own manual reading');

  DELETE FROM public.vitals WHERE id = _own_vital;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'and still delete it');

  -- ---------------------------------------------------------------------
  -- An EHR-sourced medication: not writable by the patient either.
  -- ---------------------------------------------------------------------
  UPDATE public.medications SET dosage = '50 mg' WHERE id = _med;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 0, 'the patient cannot silently change an EHR-sourced dosage');

  SELECT dosage INTO _d FROM public.medications WHERE id = _med;
  PERFORM pg_temp.assert(_d = '5 mg', 'the dosage on file is unchanged');

  EXECUTE 'SET LOCAL ROLE postgres';

  -- ---------------------------------------------------------------------
  -- The legitimate paths still work: stop_medication and
  -- apply_medication_proposal run SECURITY DEFINER and do not go through
  -- this policy at all, so tightening it must not have touched them.
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.stop_medication(_med, 'switched to a different anticoagulant', CURRENT_DATE);
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT stopped_by INTO _d FROM public.medications WHERE id = _med;
  PERFORM pg_temp.assert(_d = 'patient', 'stop_medication still works on an EHR-sourced medication');

  RAISE NOTICE 'ALL RECORD PROVENANCE WRITE-GUARD TESTS PASSED';
END $$;

ROLLBACK;
