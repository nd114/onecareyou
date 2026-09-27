-- R8: get_patient_identity's provider_shares arm ignores expires_at.
\set ON_ERROR_STOP 1
\pset footer off
BEGIN;
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('5c000000-0000-4000-8000-00000000005c', 'clin@example.com', now()),
  ('5d000000-0000-4000-8000-00000000005d', 'ella@example.com', now());
INSERT INTO public.profiles (user_id, name, email, phone_number) VALUES
  ('5c000000-0000-4000-8000-00000000005c', 'Dr Clin', 'clin@example.com', NULL),
  ('5d000000-0000-4000-8000-00000000005d', 'Ella Expired', 'ella@example.com', '+1 555 0199')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number;
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-00000000005d', true);
INSERT INTO public.provider_shares (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active, expires_at)
VALUES ('5d000000-0000-4000-8000-00000000005d', '5c000000-0000-4000-8000-00000000005c', 'Dr Clin', 'clin@example.com', 'EXPIRED1',
        '{"profile": true}', true, now() - interval '30 days');
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-00000000005c', true);
SET LOCAL ROLE authenticated;
\echo '--- clinician_has_patient_access (expired share)'
SELECT public.clinician_has_patient_access('5d000000-0000-4000-8000-00000000005d') AS has_access;
\echo '--- get_patient_identity'
SELECT * FROM public.get_patient_identity(ARRAY['5d000000-0000-4000-8000-00000000005d'::uuid]);
RESET ROLE;
ROLLBACK;
