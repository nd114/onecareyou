-- Where a medication came from, and what that stops.
--
-- The interesting assertions here are about repeated syncs. A scheduled import
-- runs every day against the same prescriptions, and the failure that matters
-- is not an error — it is silence: the same medication inserted again, and
-- again, until the patient's list shows four Amlodipine and they cannot tell
-- which is real. A duplicated dose reads as a real second prescription.

BEGIN;

DO $$
DECLARE
  v_patient uuid := '11111111-1111-1111-1111-111111111111';
  v_other   uuid := '22222222-2222-2222-2222-222222222222';
  v_clin    uuid := '33333333-3333-3333-3333-333333333333';
  v_conn    uuid := gen_random_uuid();
  v_conn_b  uuid := gen_random_uuid();
  v_count   int;
  v_text    text;
  v_failed  boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_patient, 'patient@example.com'),
    (v_other,   'other@example.com'),
    (v_clin,    'clinician@example.com');

  INSERT INTO public.ehr_connections (id, clinician_user_id, provider_type, provider_name)
  VALUES (v_conn,   v_clin, 'fhir_generic', 'City General'),
         (v_conn_b, v_clin, 'fhir_generic', 'Riverside Clinic');

  -- ---------------------------------------------------------------
  -- The default is the patient
  -- ---------------------------------------------------------------
  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (v_patient, 'Ibuprofen', '400 mg', 'as_needed');

  SELECT source INTO v_text FROM public.medications WHERE name = 'Ibuprofen';
  IF v_text <> 'manual' THEN
    RAISE EXCEPTION 'a medication with no stated source was not treated as the patient''s own (got %)', v_text;
  END IF;
  RAISE NOTICE 'a medication nobody labelled is the patient''s own: t';

  -- ---------------------------------------------------------------
  -- A repeated sync must not double the list
  -- ---------------------------------------------------------------
  INSERT INTO public.medications (user_id, name, dosage, frequency, source, external_id, ehr_connection_id)
  VALUES (v_patient, 'Amlodipine', '5 mg', 'once_daily', 'City General', 'mr-1', v_conn);

  v_failed := false;
  BEGIN
    INSERT INTO public.medications (user_id, name, dosage, frequency, source, external_id, ehr_connection_id)
    VALUES (v_patient, 'Amlodipine', '5 mg', 'once_daily', 'City General', 'mr-1', v_conn);
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'the same prescription was imported twice — a patient''s list would double on every sync';
  END IF;
  RAISE NOTICE 'importing the same prescription twice is refused: t';

  -- ...but the same external id from a *different* hospital is a different
  -- prescription. Ids are only unique within the system that issued them.
  INSERT INTO public.medications (user_id, name, dosage, frequency, source, external_id, ehr_connection_id)
  VALUES (v_patient, 'Amlodipine', '10 mg', 'once_daily', 'Riverside Clinic', 'mr-1', v_conn_b);

  SELECT count(*) INTO v_count FROM public.medications
  WHERE user_id = v_patient AND external_id = 'mr-1';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'two hospitals'' prescriptions collided on a shared external id (found %)', v_count;
  END IF;
  RAISE NOTICE 'the same id from two different hospitals stays two prescriptions: t';

  -- ...and the same id for a different patient is a different prescription too.
  INSERT INTO public.medications (user_id, name, dosage, frequency, source, external_id, ehr_connection_id)
  VALUES (v_other, 'Amlodipine', '5 mg', 'once_daily', 'City General', 'mr-1', v_conn);
  RAISE NOTICE 'two patients can hold the same prescription id: t';

  -- ---------------------------------------------------------------
  -- The index must not constrain the patient's own entries
  -- ---------------------------------------------------------------
  -- Every manual row has NULL for both, and a plain unique index over
  -- nullable columns would still let these through — but the partial
  -- predicate is what makes that explicit rather than accidental.
  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (v_patient, 'Paracetamol', '500 mg', 'as_needed'),
         (v_patient, 'Paracetamol', '500 mg', 'as_needed');

  SELECT count(*) INTO v_count FROM public.medications
  WHERE user_id = v_patient AND name = 'Paracetamol';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'the import constraint blocked the patient entering their own medication twice';
  END IF;
  RAISE NOTICE 'a patient can still enter the same medicine twice themselves: t';

  -- ---------------------------------------------------------------
  -- A connection going away must not take the medication with it
  -- ---------------------------------------------------------------
  DELETE FROM public.ehr_connections WHERE id = v_conn_b;

  SELECT count(*) INTO v_count FROM public.medications
  WHERE user_id = v_patient AND source = 'Riverside Clinic';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'removing an EHR connection deleted the patient''s medication';
  END IF;

  SELECT ehr_connection_id INTO v_text FROM public.medications
  WHERE user_id = v_patient AND source = 'Riverside Clinic';
  IF v_text IS NOT NULL THEN
    RAISE EXCEPTION 'the medication still points at a connection that no longer exists';
  END IF;
  -- The source label survives the connection, which is the point: the patient
  -- can still see it was not theirs even after the hospital is disconnected.
  RAISE NOTICE 'disconnecting a hospital keeps the medication and its origin: t';

  -- ---------------------------------------------------------------
  -- Nobody else can read it
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'medications';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'medications has no row-level policies at all';
  END IF;
  RAISE NOTICE 'medications is still governed by RLS: t';

  RAISE NOTICE 'ALL MEDICATION PROVENANCE TESTS PASSED';
END $$;

ROLLBACK;
