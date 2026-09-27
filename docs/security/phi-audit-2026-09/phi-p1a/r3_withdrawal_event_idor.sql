-- R3: withdraw_shared_file returns the stored retraction event for an
-- already-withdrawn document BEFORE any check on who is asking.
\set ON_ERROR_STOP 1
\pset footer off
\x on
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('11000000-0000-4000-8000-000000000011', 'sender@example.com',    now()),
  ('22000000-0000-4000-8000-000000000022', 'recipient@example.com', now()),
  ('33000000-0000-4000-8000-000000000033', 'stranger@example.com',  now());
INSERT INTO public.profiles (user_id, name, email) VALUES
  ('11000000-0000-4000-8000-000000000011', 'Dr Sender', 'sender@example.com'),
  ('22000000-0000-4000-8000-000000000022', 'Rita Recipient', 'recipient@example.com'),
  ('33000000-0000-4000-8000-000000000033', 'Stranger', 'stranger@example.com')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;

-- A clinic, the sender in it, and a file the sender put in Rita's vault.
SELECT set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000011', true);
INSERT INTO public.practices (id, name, created_by)
VALUES ('cc000000-0000-4000-8000-0000000000cc', 'Clinic S', '11000000-0000-4000-8000-000000000011');
INSERT INTO public.health_documents (id, user_id, file_path, file_name, uploaded_by_user_id)
VALUES ('dd000000-0000-4000-8000-0000000000dd', '22000000-0000-4000-8000-000000000022',
        '22000000-0000-4000-8000-000000000022/hiv-viral-load.pdf', 'hiv-viral-load-2026-09.pdf',
        '11000000-0000-4000-8000-000000000011');

-- The sender withdraws it, as themself, under RLS.
SET LOCAL ROLE authenticated;
SELECT id AS event_id FROM public.withdraw_shared_file(
  'dd000000-0000-4000-8000-0000000000dd', NULL, 'wrong_recipient',
  'Result belongs to MRN 4471, not this patient', 'INC-2026-044');
RESET ROLE;

-- A stranger with no relationship to either person.
SELECT set_config('request.jwt.claim.sub', '33000000-0000-4000-8000-000000000033', true);
SET LOCAL ROLE authenticated;

\echo '--- 1. stranger reads the event table directly (RLS)'
SELECT count(*) AS events_visible FROM public.document_retraction_events;
\echo '--- 2. stranger "withdraws" the same document again'
SELECT file_name, storage_path, actual_recipient_id, actual_recipient_ref,
       sending_clinician_id, sending_practice_id, reason_code, internal_note,
       incident_ref, access_count
  FROM public.withdraw_shared_file('dd000000-0000-4000-8000-0000000000dd', NULL, 'superseded');

RESET ROLE;
ROLLBACK;
