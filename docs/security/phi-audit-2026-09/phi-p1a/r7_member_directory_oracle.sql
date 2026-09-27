-- R7: the member-list functions are tenant-scoped, but a tenant owner can write a
-- practice_members row for any uuid without that person's acceptance, and any
-- signed-in user can become a tenant owner.
\set ON_ERROR_STOP 1
\pset footer off
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('77000000-0000-4000-8000-000000000077', 'someone@example.com', now()),
  ('88000000-0000-4000-8000-000000000088', 'hana@example.com',    now());
INSERT INTO public.profiles (user_id, name, email) VALUES
  ('77000000-0000-4000-8000-000000000077', 'Someone', 'someone@example.com'),
  ('88000000-0000-4000-8000-000000000088', 'Hana Patient', 'hana@example.com')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;

SELECT set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000077', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.practices (id, name, created_by)
VALUES ('70000000-0000-4000-8000-000000000070', 'Any Co', '77000000-0000-4000-8000-000000000077');
\echo '--- attacker writes a membership row for a patient uuid'
INSERT INTO public.practice_members (practice_id, user_id, role, status)
VALUES ('70000000-0000-4000-8000-000000000070', '88000000-0000-4000-8000-000000000088', 'clinician', 'pending_approval');
\echo '--- practice_member_directory'
SELECT user_id, display_name, email, status FROM public.practice_member_directory('70000000-0000-4000-8000-000000000070')
 WHERE user_id = '88000000-0000-4000-8000-000000000088';
\echo '--- practice_staff_overview'
SELECT user_id, name, email FROM public.practice_staff_overview('70000000-0000-4000-8000-000000000070') WHERE user_id = '88000000-0000-4000-8000-000000000088';
\echo '--- practice_pending_affiliations'
SELECT user_id, name, email FROM public.practice_pending_affiliations('70000000-0000-4000-8000-000000000070');
RESET ROLE;
ROLLBACK;
