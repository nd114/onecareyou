-- R4: withdraw_shared_file stamps sending_practice_id with the sender's FIRST active
-- membership, not a practice the recipient shares with. For a clinician at two
-- hospitals, hospital A's admin then reads a withdrawal about hospital B's patient.
\set ON_ERROR_STOP 1
\pset footer off
\x on
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('a1a00000-0000-4000-8000-0000000000a1', 'admin-a@example.com', now()),
  ('b1b00000-0000-4000-8000-0000000000b1', 'admin-b@example.com', now()),
  ('d0d00000-0000-4000-8000-0000000000d0', 'works-at-both@example.com', now()),
  ('9b9b0000-0000-4000-8000-00000000009b', 'bpatient@example.com', now());
INSERT INTO public.profiles (user_id, name, email) VALUES
  ('a1a00000-0000-4000-8000-0000000000a1', 'Admin A', 'admin-a@example.com'),
  ('b1b00000-0000-4000-8000-0000000000b1', 'Admin B', 'admin-b@example.com'),
  ('d0d00000-0000-4000-8000-0000000000d0', 'Dr Both', 'works-at-both@example.com'),
  ('9b9b0000-0000-4000-8000-00000000009b', 'Bola OnlyB', 'bpatient@example.com')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;

INSERT INTO public.practices (id, name, created_by) VALUES
  ('aaaa0000-0000-4000-8000-00000000aaaa', 'Hospital A', 'a1a00000-0000-4000-8000-0000000000a1'),
  ('bbbb0000-0000-4000-8000-00000000bbbb', 'Hospital B', 'b1b00000-0000-4000-8000-0000000000b1');
INSERT INTO public.practice_members (practice_id, user_id, role, status, created_at) VALUES
  ('aaaa0000-0000-4000-8000-00000000aaaa', 'a1a00000-0000-4000-8000-0000000000a1', 'owner', 'active', now()),
  ('bbbb0000-0000-4000-8000-00000000bbbb', 'b1b00000-0000-4000-8000-0000000000b1', 'owner', 'active', now()),
  -- Dr Both joined A first, then B.
  ('aaaa0000-0000-4000-8000-00000000aaaa', 'd0d00000-0000-4000-8000-0000000000d0', 'clinician', 'active', now() - interval '1 year'),
  ('bbbb0000-0000-4000-8000-00000000bbbb', 'd0d00000-0000-4000-8000-0000000000d0', 'clinician', 'active', now() - interval '1 month')
ON CONFLICT (practice_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status, created_at = EXCLUDED.created_at;

-- Bola shares with hospital B only.
SELECT set_config('request.jwt.claim.sub', '9b9b0000-0000-4000-8000-00000000009b', true);
INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
VALUES ('bbbb0000-0000-4000-8000-00000000bbbb', '9b9b0000-0000-4000-8000-00000000009b', true, true, '{}');

-- Dr Both, working at B, files a document into Bola's vault, then withdraws it.
SELECT set_config('request.jwt.claim.sub', 'd0d00000-0000-4000-8000-0000000000d0', true);
INSERT INTO public.health_documents (id, user_id, file_path, file_name, uploaded_by_user_id)
VALUES ('dddd0000-0000-4000-8000-00000000dddd', '9b9b0000-0000-4000-8000-00000000009b',
        '9b9b0000-0000-4000-8000-00000000009b/psych-assessment.pdf', 'psychiatric-assessment-bola.pdf',
        'd0d00000-0000-4000-8000-0000000000d0');
SET LOCAL ROLE authenticated;
SELECT sending_practice_id FROM public.withdraw_shared_file(
  'dddd0000-0000-4000-8000-00000000dddd', NULL, 'incorrect_content', 'Draft uploaded by mistake');
RESET ROLE;

\echo '--- Hospital A admin reads its withdrawal register (RLS applies)'
SELECT set_config('request.jwt.claim.sub', 'a1a00000-0000-4000-8000-0000000000a1', true);
SET LOCAL ROLE authenticated;
SELECT sending_practice_id, file_name, actual_recipient_ref, internal_note
  FROM public.practice_withdrawal_register;
RESET ROLE;

\echo '--- Hospital B admin (the patient''s actual hospital) reads its register'
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-4000-8000-0000000000b1', true);
SET LOCAL ROLE authenticated;
SELECT count(*) AS rows_visible_to_b FROM public.practice_withdrawal_register;
RESET ROLE;
ROLLBACK;
