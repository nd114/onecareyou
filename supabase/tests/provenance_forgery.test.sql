-- The mirror image of record_provenance_write_guard.test.sql: not "can the
-- patient rewrite what a clinician recorded", but "can the patient write a
-- row that claims to be the clinician's in the first place".
--
-- Found in the final audit's second pass. Before
-- 20260930100000_only_the_source_may_claim_to_be_the_source.sql, both INSERT
-- policies checked only auth.uid() = user_id — nothing stopped a patient
-- inserting their own fabricated reading with source = 'clinician' and any
-- recorded_by_user_id, or their own self-typed medication with
-- source = a real hospital's name and a made-up external_id.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/provenance_forgery.test.sql

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
  _patient  uuid := gen_random_uuid();
  _clin     uuid := gen_random_uuid();
  _stranger uuid := gen_random_uuid();  -- a real clinician the patient has never met
  _share    uuid;
  _n        int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient, 'forge-patient@test.local'),
    (_clin, 'forge-clin@test.local'),
    (_stranger, 'forge-stranger@test.local');

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- -------------------------------------------------------------------
  -- Vitals: cannot claim clinician provenance, with anyone as the "author".
  -- -------------------------------------------------------------------
  BEGIN
    INSERT INTO public.vitals (user_id, type, value, unit, source, recorded_by_user_id)
    VALUES (_patient, 'blood_pressure', 118, 'mmHg', 'clinician', _stranger);
    PERFORM pg_temp.assert(false, 'a patient cannot forge a clinician-attributed reading');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE '  ok — a patient cannot forge a clinician-attributed reading';
  END;

  -- Not even naming a real clinician they genuinely share with.
  EXECUTE 'SET LOCAL ROLE postgres';
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active)
  VALUES (_patient, 'Dr Real', 'FORGECODE1', _clin, true) RETURNING id INTO _share;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  BEGIN
    INSERT INTO public.vitals (user_id, type, value, unit, source, recorded_by_user_id)
    VALUES (_patient, 'weight', 70, 'kg', 'clinician', _clin);
    PERFORM pg_temp.assert(false, 'a real share does not let the patient claim the clinician wrote it themselves');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE '  ok — a real share does not let the patient claim the clinician wrote it themselves';
  END;

  -- Their own manual entry, naming themselves, is fine.
  INSERT INTO public.vitals (user_id, type, value, unit, source, recorded_by_user_id)
  VALUES (_patient, 'weight', 70, 'kg', 'manual', _patient);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'a patient can still record their own manual reading, naming themselves');

  -- And the column default (no source given at all) still works.
  INSERT INTO public.vitals (user_id, type, value, unit)
  VALUES (_patient, 'heart_rate', 72, 'bpm');
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'the plain insert path — no source given — is unaffected');

  -- -------------------------------------------------------------------
  -- Medications: cannot claim to have come from a hospital or connection.
  -- -------------------------------------------------------------------
  BEGIN
    INSERT INTO public.medications (user_id, name, dosage, frequency, source, external_id)
    VALUES (_patient, 'Oxycodone', '30 mg', 'as_needed', 'City General Hospital', 'RX-FORGED');
    PERFORM pg_temp.assert(false, 'a patient cannot forge an EHR-sourced medication');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE '  ok — a patient cannot forge an EHR-sourced medication';
  END;

  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (_patient, 'Paracetamol', '500 mg', 'as_needed');
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'entering their own medication is unaffected');

  -- -------------------------------------------------------------------
  -- The legitimate clinician path is untouched: a separate, correctly-scoped
  -- policy, unaffected by tightening the patient's own.
  -- -------------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('request.jwt.claim.sub', _clin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.vitals (user_id, recorded_by_user_id, source, type, value, unit)
  VALUES (_patient, _clin, 'clinician', 'blood_pressure', 130, 'mmHg');
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'the clinician can still record a real reading through their own policy');

  -- -------------------------------------------------------------------
  -- Health documents: cannot claim to be filed by a clinician, or wear the
  -- badge and the DELETE immunity that comes with it.
  -- -------------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.health_documents
      (user_id, file_path, file_name, title, uploaded_by_user_id, source_context)
    VALUES (_patient, _patient || '/forged.pdf', 'forged.pdf', 'Fit to work certificate',
            _stranger, 'clinician_upload');
    PERFORM pg_temp.assert(false, 'a patient cannot forge a clinician-uploaded document');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE '  ok — a patient cannot forge a clinician-uploaded document';
  END;

  -- Every other source_context a patient legitimately uses is untouched —
  -- this is a denylist on the one reserved value, not an allowlist.
  INSERT INTO public.health_documents
    (user_id, file_path, file_name, title, source_context)
  VALUES (_patient, _patient || '/scan.pdf', 'scan.pdf', 'Lab result', 'vitals_upload');
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'every other source_context a patient legitimately uses still works');

  INSERT INTO public.health_documents (user_id, file_path, file_name, title)
  VALUES (_patient, _patient || '/plain.pdf', 'plain.pdf', 'Just a scan');
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'the plain upload path — no source_context given — is unaffected');

  -- The real clinician path is a separate, correctly-scoped policy.
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('request.jwt.claim.sub', _clin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.health_documents
    (user_id, file_path, file_name, title, uploaded_by_user_id, source_context)
  VALUES (_patient, _patient || '/real-letter.pdf', 'real-letter.pdf', 'Referral letter',
          _clin, 'clinician_upload');
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.assert(_n = 1, 'the clinician can still file a real document through their own policy');

  RAISE NOTICE 'ALL PROVENANCE FORGERY TESTS PASSED';
END $$;

ROLLBACK;
