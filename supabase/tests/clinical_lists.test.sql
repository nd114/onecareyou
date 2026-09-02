-- Conditions and allergies are lists, and the database now says so.
--
-- These columns are jsonb free text with no constraint, so a bare string was
-- storable — and the app reads them as arrays. The consequences were real, not
-- hypothetical: ClinicianDataConsentDialog counted the characters of a loose
-- string and offered the patient "22 health condition(s)" to consent to, and
-- ManagedRecordFilters called .map on it.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/clinical_lists.test.sql

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
  _patient uuid := 'c1a00000-0000-0000-0000-000000000001';
  _val jsonb; _ok boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_patient, 'cl-patient@test.local');

  -- ==========================================================================
  -- 1. The normaliser recovers a list from the shapes actually stored
  -- ==========================================================================
  PERFORM pg_temp.assert(
    public.normalise_clinical_list('"Diabetes, Hypertension"'::jsonb)
      = '["Diabetes", "Hypertension"]'::jsonb,
    'a comma-separated string becomes the list it meant');

  PERFORM pg_temp.assert(
    public.normalise_clinical_list('"Penicillin; Sulfa"'::jsonb)
      = '["Penicillin", "Sulfa"]'::jsonb,
    'a semicolon-separated string does too — that is what the CSV import writes');

  PERFORM pg_temp.assert(
    public.normalise_clinical_list('["Diabetes"]'::jsonb) = '["Diabetes"]'::jsonb,
    'an array is left exactly as it is');

  PERFORM pg_temp.assert(
    public.normalise_clinical_list('""'::jsonb) = '[]'::jsonb,
    'an empty string is an empty list, not a list with one empty entry');

  PERFORM pg_temp.assert(
    public.normalise_clinical_list('"Diabetes,,Asthma,"'::jsonb)
      = '["Diabetes", "Asthma"]'::jsonb,
    'stray separators do not produce blank entries');

  PERFORM pg_temp.assert(
    public.normalise_clinical_list('null'::jsonb) IS NULL,
    'a json null stays null, so withheld does not become empty');

  -- An object is not a list, but it is somebody's data. Wrapped, not dropped:
  -- the client normaliser reads the text out of it.
  PERFORM pg_temp.assert(
    public.normalise_clinical_list('{"name": "Asthma"}'::jsonb)
      = '[{"name": "Asthma"}]'::jsonb,
    'an object is kept as a single entry rather than discarded');

  -- ==========================================================================
  -- 2. The constraint refuses a new loose string
  -- ==========================================================================
  BEGIN
    UPDATE public.profiles SET health_conditions = '"Diabetes, Hypertension"'::jsonb
     WHERE user_id = _patient;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a bare string can no longer be stored as conditions');

  BEGIN
    UPDATE public.profiles SET allergies = '"Penicillin"'::jsonb WHERE user_id = _patient;
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'nor as allergies');

  -- ==========================================================================
  -- 3. Withheld and empty stay different, because they mean opposite things
  --
  -- A clinician reading "no known allergies" when the truth is "you were not
  -- told" is the failure the distinction exists to prevent, so the constraint
  -- must not collapse NULL into [].
  -- ==========================================================================
  UPDATE public.profiles SET health_conditions = NULL, allergies = NULL WHERE user_id = _patient;
  SELECT health_conditions INTO _val FROM public.profiles WHERE user_id = _patient;
  PERFORM pg_temp.assert(_val IS NULL, 'NULL is still allowed and still means withheld');

  UPDATE public.profiles SET health_conditions = '[]'::jsonb WHERE user_id = _patient;
  SELECT health_conditions INTO _val FROM public.profiles WHERE user_id = _patient;
  PERFORM pg_temp.assert(_val = '[]'::jsonb, 'an empty array is allowed and means none recorded');

  UPDATE public.profiles SET health_conditions = '["Diabetes"]'::jsonb WHERE user_id = _patient;
  SELECT health_conditions INTO _val FROM public.profiles WHERE user_id = _patient;
  PERFORM pg_temp.assert(_val = '["Diabetes"]'::jsonb, 'an ordinary list still writes');

  -- ==========================================================================
  -- 4. The same holds on the other two tables carrying these fields
  -- ==========================================================================
  BEGIN
    INSERT INTO public.clinician_patient_records
      (clinician_user_id, patient_name, health_conditions)
    VALUES (_patient, 'Loose String', '"Diabetes, Hypertension"'::jsonb);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'clinician_patient_records refuses it too');

  BEGIN
    INSERT INTO public.family_members (owner_user_id, name, allergies)
    VALUES (_patient, 'Loose String', '"Penicillin"'::jsonb);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'family_members refuses it too');

  RAISE NOTICE 'ALL CLINICAL LIST TESTS PASSED';
END
$$;

ROLLBACK;
