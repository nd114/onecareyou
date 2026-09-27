-- R6: "search, don't browse" (20261006) is enforced by two admin functions and
-- skipped by three others that the admin UI still calls.
\set ON_ERROR_STOP 1
\pset footer off
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('ad000000-0000-4000-8000-0000000000ad', 'ops@onecare.example', now()),
  ('c1000000-0000-4000-8000-0000000000c1', 'dr-c@example.com', now()),
  ('9a000000-0000-4000-8000-00000000009a', 'priya@example.com', now());
INSERT INTO public.profiles (user_id, name, email) VALUES
  ('ad000000-0000-4000-8000-0000000000ad', 'Ops', 'ops@onecare.example'),
  ('c1000000-0000-4000-8000-0000000000c1', 'Dr C', 'dr-c@example.com'),
  ('9a000000-0000-4000-8000-00000000009a', 'Priya Patient', 'priya@example.com')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
INSERT INTO public.user_roles (user_id, role) VALUES ('ad000000-0000-4000-8000-0000000000ad', 'admin');
INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, patient_user_id)
VALUES ('c1000000-0000-4000-8000-0000000000c1', 'view_record', 'medications', '9a000000-0000-4000-8000-00000000009a');
INSERT INTO public.access_audit_logs (action, actor_user_id, target_user_id, resource_type)
VALUES ('share_opened', 'c1000000-0000-4000-8000-0000000000c1', '9a000000-0000-4000-8000-00000000009a', 'provider_share');

SELECT set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-0000000000ad', true);
SET LOCAL ROLE authenticated;
\echo '--- floored: admin_accounts_directory(patient, no search) / admin_access_reviews(no search)'
SELECT count(*) AS directory_rows FROM public.admin_accounts_directory('patient', NULL);
SELECT count(*) AS review_rows FROM public.admin_access_reviews(NULL);
\echo '--- not floored: admin_recent_signups()'
SELECT name, email FROM public.admin_recent_signups(200) WHERE email = 'priya@example.com';
\echo '--- not floored: admin_audit_export() -- who read whose record'
SELECT actor_email, action, resource_type, patient_email FROM public.admin_audit_export();
\echo '--- not floored: admin_access_log_search(NULL)'
SELECT actor_email, action, target_email FROM public.admin_access_log_search(NULL);
RESET ROLE;
ROLLBACK;
