-- A patient can see who their hospital gave access to — and nobody else's.
--
-- Care Circle showed the doctors a patient invited and the hospitals they
-- connected to, but not the clinicians the hospital then assigned. Those rows
-- are readable only by practice members, so the delegation was invisible to the
-- person whose record it concerned. my_institution_care_team() closes that.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/patient_care_team_visibility.test.sql

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
  _patient uuid := 'e1000000-0000-0000-0000-000000000001';
  _other   uuid := 'e1000000-0000-0000-0000-000000000002';
  _doc     uuid := 'e1000000-0000-0000-0000-000000000003';
  _doc2    uuid := 'e1000000-0000-0000-0000-000000000004';
  _owner   uuid := 'e1000000-0000-0000-0000-000000000005';
  _hosp    uuid := 'e1111111-0000-0000-0000-000000000001';
  _count integer; _name text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'ct-patient@test.local'), (_other,'ct-other@test.local'),
    (_doc,'ct-doc@test.local'), (_doc2,'ct-doc2@test.local'), (_owner,'ct-owner@test.local');

  INSERT INTO public.practices (id, name, tenant_type, created_by, slug)
  VALUES (_hosp, 'St Aidan''s Hospital', 'hospital', _owner, 'aidan');

  INSERT INTO public.clinician_profiles (user_id, title, first_name, last_name, specialty)
  VALUES (_doc, 'Dr.', 'Emily', 'Williams', 'Endocrinology'),
         (_doc2, 'Dr.', 'Sarah', 'Mitchell', 'Cardiology');

  -- Both patients share with the hospital; both have a clinician assigned.
  INSERT INTO public.practice_shares (practice_id, user_id, is_active)
  VALUES (_hosp, _patient, true), (_hosp, _other, true);

  INSERT INTO public.practice_patient_assignments
    (practice_id, patient_user_id, clinician_user_id, assignment_role, assigned_by)
  VALUES (_hosp, _patient, _doc,  'primary',  _owner),
         (_hosp, _other,   _doc2, 'primary',  _owner);

  -- ==========================================================================
  -- 1. The patient sees the clinician their hospital assigned to them
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), max(clinician_name) INTO _count, _name FROM public.my_institution_care_team();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'a patient sees the clinician their hospital assigned');
  PERFORM pg_temp.assert(_name = 'Dr. Emily Williams', 'the clinician is named, not just an id');

  -- ==========================================================================
  -- 2. And nobody else's care team
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_institution_care_team()
   WHERE clinician_user_id = _doc2;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'a patient cannot see another patient''s care team');

  -- ==========================================================================
  -- 3. Ending the hospital connection ends what this reports
  -- ==========================================================================
  UPDATE public.practice_shares SET is_active = false
   WHERE practice_id = _hosp AND user_id = _patient;

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_institution_care_team();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'disconnecting the hospital clears the care team list');

  UPDATE public.practice_shares SET is_active = true
   WHERE practice_id = _hosp AND user_id = _patient;

  -- ==========================================================================
  -- 4. An expired assignment drops off
  -- ==========================================================================
  UPDATE public.practice_patient_assignments SET effective_to = now() - interval '1 day'
   WHERE patient_user_id = _patient;

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.my_institution_care_team();
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'an ended assignment no longer appears');

  -- ==========================================================================
  -- 5. A signed-out caller gets nothing
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO _count FROM public.my_institution_care_team();
  PERFORM pg_temp.assert(_count = 0, 'a caller with no session sees no care team');

  RAISE NOTICE 'ALL PATIENT CARE TEAM VISIBILITY TESTS PASSED';
END $$;

ROLLBACK;
