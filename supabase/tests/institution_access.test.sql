-- Institution (hospital) sharing — access control regression tests.
--
-- These assert the consent rules in docs/sharing-access-consent-model.md at the
-- database level, because RLS is the boundary: UI filtering is not evidence.
--
-- Run against a database with the migration history applied:
--   psql -d <db> -f supabase/tests/institution_access.test.sql
-- Any failed assertion aborts with an exception; "ALL INSTITUTION ACCESS TESTS
-- PASSED" is printed only when every case holds.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', _label;
  END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

-- Impersonate a signed-in user the way PostgREST does.
CREATE OR REPLACE FUNCTION pg_temp.act_as(_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: one hospital, one unrelated hospital, four people
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _patient    uuid := '11111111-1111-1111-1111-111111111111';
  _assigned   uuid := '22222222-2222-2222-2222-222222222222'; -- assigned clinician
  _unassigned uuid := '33333333-3333-3333-3333-333333333333'; -- same hospital, not assigned
  _admin      uuid := '44444444-4444-4444-4444-444444444444'; -- hospital admin
  _outsider   uuid := '55555555-5555-5555-5555-555555555555'; -- other hospital
  _hospital   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  _other      uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient, 'patient@test.local'),
    (_assigned, 'assigned@test.local'),
    (_unassigned, 'unassigned@test.local'),
    (_admin, 'admin@test.local'),
    (_outsider, 'outsider@test.local');

  -- handle_new_user() already created a profile row for each auth user.
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (_patient, 'Test Patient', 'patient@test.local')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;

  INSERT INTO public.practices (id, name, tenant_type, slug, created_by)
  VALUES (_hospital, 'Test General Hospital', 'hospital', 'testgen', _admin),
         (_other, 'Other Hospital', 'hospital', 'otherhosp', _outsider);

  -- can_view_all_patients is set false here so the assignment path is what is
  -- under test. Its production default is covered separately in the findings.
  -- add_practice_owner() already made each creator an owner of their tenant.
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_hospital, _assigned,   'clinician', 'active', false),
         (_hospital, _unassigned, 'clinician', 'active', false),
         (_hospital, _admin,      'admin',     'active', false),
         (_other,    _outsider,   'clinician', 'active', false)
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        can_view_all_patients = EXCLUDED.can_view_all_patients;

  -- Patient shares vitals + medications with the hospital, but NOT documents.
  INSERT INTO public.practice_shares (practice_id, user_id, share_all, permissions)
  VALUES (_hospital, _patient, false,
          '{"vitals":true,"medications":true,"documents":false,"conditions":false,"allergies":false}'::jsonb);

  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_hospital, _patient, _assigned, _admin);

  -- The outsider is assigned to the same patient, but by a different tenant the
  -- patient never shared with.
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_other, _patient, _outsider, _outsider);

  INSERT INTO public.vitals (user_id, type, value, unit, recorded_at)
  VALUES (_patient, 'blood_pressure', 120, 'mmHg', now());

  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (_patient, 'Metformin', '500mg', 'daily');

  INSERT INTO public.schedule_entries (user_id, medication_id, scheduled_time, status)
  SELECT _patient, id, now(), 'taken'
  FROM public.medications WHERE user_id = _patient LIMIT 1;

  UPDATE public.profiles
     SET health_conditions = '["Type 2 diabetes"]'::jsonb,
         allergies = '["Penicillin"]'::jsonb
   WHERE user_id = _patient;

  INSERT INTO public.health_documents (user_id, title, file_path, file_name)
  VALUES (_patient, 'Discharge summary', 'docs/x.pdf', 'x.pdf');
END $$;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

-- 1. The assigned clinician sees the categories the patient shared.
SELECT pg_temp.act_as('22222222-2222-2222-2222-222222222222');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.vitals) = 1,
  'assigned clinician reads shared vitals');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.medications) = 1,
  'assigned clinician reads shared medications');

-- 2. …and nothing the patient withheld. This is the defect the migration fixes:
--    the granular picker used to be advisory only.
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.health_documents) = 0,
  'assigned clinician cannot read documents the patient withheld');

-- 2b. Adherence rides on the medications category the patient shared.
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.schedule_entries) = 1,
  'assigned clinician reads adherence history under the medications share');

-- 2c. Conditions and allergies are released per category, not together. This
--     fixture shares neither, so both come back null rather than empty.
SELECT pg_temp.assert(
  (SELECT allergies IS NULL AND health_conditions IS NULL
     FROM public.get_patient_clinical_profile(
       ARRAY['11111111-1111-1111-1111-111111111111'::uuid])),
  'withheld conditions and allergies are not disclosed');

-- 3. A colleague at the same hospital without an assignment sees nothing.
SELECT pg_temp.act_as('33333333-3333-3333-3333-333333333333');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.vitals) = 0,
  'unassigned colleague reads no vitals');

-- 4. An assignment made by another tenant does not grant access here.
SELECT pg_temp.act_as('55555555-5555-5555-5555-555555555555');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.vitals) = 0,
  'assignment from an unshared tenant grants nothing');

-- 5. Patient identity resolves for the assigned clinician (no "Unknown Patient").
SELECT pg_temp.act_as('22222222-2222-2222-2222-222222222222');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.get_patient_identity(
     ARRAY['11111111-1111-1111-1111-111111111111'::uuid])) = 1,
  'assigned clinician resolves institution patient identity');

SELECT pg_temp.act_as('55555555-5555-5555-5555-555555555555');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.get_patient_identity(
     ARRAY['11111111-1111-1111-1111-111111111111'::uuid])) = 0,
  'outsider resolves no identity');

-- 6. Consent is the patient's: a hospital admin may end a share…
SELECT pg_temp.act_as('44444444-4444-4444-4444-444444444444');
UPDATE public.practice_shares
   SET is_active = false, revoked_at = now(), revoked_by = auth.uid()
 WHERE practice_id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.assert(
  (SELECT is_active = false FROM public.practice_shares
    WHERE practice_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'hospital admin can end a share');

-- …but may not restart one. The row is invisible to the admin's UPDATE policy
-- once inactive, so the write affects zero rows rather than raising.
UPDATE public.practice_shares
   SET is_active = true
 WHERE practice_id = 'aaaaaaaa-0000-0000-0000-000000000001';

SET LOCAL ROLE postgres;
SELECT pg_temp.assert(
  (SELECT is_active = false FROM public.practice_shares
    WHERE practice_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'hospital admin cannot re-activate a revoked share');
SET LOCAL ROLE authenticated;

-- 7. Revocation stops forward access immediately.
SELECT pg_temp.act_as('22222222-2222-2222-2222-222222222222');
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.vitals) = 0,
  'revoked share stops forward access');

-- 8. The patient can re-share, and the ledger records the whole lifecycle.
SELECT pg_temp.act_as('11111111-1111-1111-1111-111111111111');
UPDATE public.practice_shares
   SET is_active = true, revoked_at = NULL, revoked_by = NULL
 WHERE user_id = auth.uid();
SELECT pg_temp.assert(
  (SELECT is_active FROM public.practice_shares WHERE user_id = auth.uid()),
  'patient can re-share');

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.share_events
    WHERE patient_user_id = auth.uid()
      AND event_type IN ('connected', 'revoked', 'reshared')) = 3,
  'ledger records connected + revoked + reshared');

SET LOCAL ROLE postgres;
DO $$ BEGIN RAISE NOTICE 'ALL INSTITUTION ACCESS TESTS PASSED'; END $$;

ROLLBACK;
