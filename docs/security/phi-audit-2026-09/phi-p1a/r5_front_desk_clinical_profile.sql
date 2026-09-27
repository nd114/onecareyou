-- R5: get_patient_clinical_profile gates institution staff on
-- institution_has_patient_permission, which has no clinical-role test.
-- The vitals policy on the same patient uses the clinical variant and refuses.
\set ON_ERROR_STOP 1
\pset footer off
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('0a000000-0000-4000-8000-00000000000a', 'owner-h@example.com', now()),
  ('0f000000-0000-4000-8000-00000000000f', 'frontdesk@example.com', now()),
  ('0e000000-0000-4000-8000-00000000000e', 'pat@example.com', now());
INSERT INTO public.profiles (user_id, name, email, health_conditions, allergies) VALUES
  ('0a000000-0000-4000-8000-00000000000a', 'Owner H', 'owner-h@example.com', NULL, NULL),
  ('0f000000-0000-4000-8000-00000000000f', 'Fran FrontDesk', 'frontdesk@example.com', NULL, NULL),
  ('0e000000-0000-4000-8000-00000000000e', 'Pat Patient', 'pat@example.com',
   '["Major depressive disorder","HIV"]'::jsonb, '["Penicillin"]'::jsonb)
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
  health_conditions = EXCLUDED.health_conditions, allergies = EXCLUDED.allergies;

SELECT set_config('request.jwt.claim.sub', '0a000000-0000-4000-8000-00000000000a', true);
INSERT INTO public.practices (id, name, created_by)
VALUES ('0b000000-0000-4000-8000-00000000000b', 'Hospital H', '0a000000-0000-4000-8000-00000000000a');
INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
  ('0b000000-0000-4000-8000-00000000000b', '0f000000-0000-4000-8000-00000000000f', 'front_desk', 'active')
ON CONFLICT (practice_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

SELECT set_config('request.jwt.claim.sub', '0e000000-0000-4000-8000-00000000000e', true);
INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
VALUES ('0b000000-0000-4000-8000-00000000000b', '0e000000-0000-4000-8000-00000000000e', true, true, '{}');
INSERT INTO public.vitals (user_id, type, value, unit)
VALUES ('0e000000-0000-4000-8000-00000000000e', 'heart_rate', 72, 'bpm');
INSERT INTO public.medications (user_id, name, dosage, frequency)
VALUES ('0e000000-0000-4000-8000-00000000000e', 'Sertraline', '50 mg', 'daily');

\echo '--- read-back: Fran''s membership as the trigger left it'
SELECT role, status, can_view_all_patients FROM public.practice_members
 WHERE user_id = '0f000000-0000-4000-8000-00000000000f';

SELECT set_config('request.jwt.claim.sub', '0f000000-0000-4000-8000-00000000000f', true);
SET LOCAL ROLE authenticated;
\echo '--- front desk: vitals (policy uses institution_has_clinical_permission)'
SELECT count(*) AS vitals_rows FROM public.vitals WHERE user_id = '0e000000-0000-4000-8000-00000000000e';
\echo '--- front desk: get_patient_clinical_profile'
SELECT * FROM public.get_patient_clinical_profile(ARRAY['0e000000-0000-4000-8000-00000000000e'::uuid]);
\echo '--- (RLS, outside definer scope) front desk: medications'
SELECT name, dosage FROM public.medications WHERE user_id = '0e000000-0000-4000-8000-00000000000e';
RESET ROLE;
ROLLBACK;
