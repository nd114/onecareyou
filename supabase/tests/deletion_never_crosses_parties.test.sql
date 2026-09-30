-- One party's deletion never removes the other party's copy.
--
-- A clinician or hospital deleting its own record, account, membership or the
-- whole tenant must not delete, alter or hide what the patient holds; a patient
-- deleting their own item or account must not delete the institution's record
-- of the care it gave; and neither may take an append-only ledger with it
-- (share_events, practice_membership_events, hipaa_audit_logs,
-- snapshot_link_views). See docs/sharing-access-consent-model.md 4 and 7.4.
--
-- The dangerous paths are not the DELETE policies, which are narrow, but the
-- foreign keys: an account deleted from the dashboard, or a tenant deleted by
-- its owner, walks every ON DELETE CASCADE with nobody asking whose row is at
-- the other end. So most sections here delete as the superuser, the way the
-- service role or the dashboard would, and assert that the other party's row
-- is still there. Each fixture holds exactly one kind of dependent row, so that
-- reverting any single constraint fails its own assertion rather than being
-- masked by a neighbour that happens to refuse first.
--
-- Failures are collected rather than raised one at a time, so a run names
-- every broken boundary at once.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN
    PERFORM set_config('onecare_test.failures',
      COALESCE(current_setting('onecare_test.failures', true), '') || E'\n    ' || _label, true);
    RAISE NOTICE '  FAILED — %', _label;
  ELSE
    RAISE NOTICE '  ok — %', _label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text, ''), true);
  IF _uid IS NOT NULL THEN EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
END;
$$;

-- Delete as the platform would (no signed-in user, no RLS), swallowing the
-- refusal: the assertions are about what is left, not about the error.
CREATE OR REPLACE FUNCTION pg_temp.try(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

SELECT set_config('onecare_test.failures', '', false);

DO $$
DECLARE
  _dr      uuid := 'de1e0000-0000-4000-8000-0000000000d1';  -- clinician
  _dr2     uuid := 'de1e0000-0000-4000-8000-0000000000d2';  -- clinician who deletes their account
  _owner   uuid := 'de1e0000-0000-4000-8000-0000000000e1';  -- hospital owner
  _pat     uuid := 'de1e0000-0000-4000-8000-0000000000a0';  -- the patient most sections share
  _p1      uuid := 'de1e0000-0000-4000-8000-0000000000a1';
  _p4      uuid := 'de1e0000-0000-4000-8000-0000000000a4';
  _p5      uuid := 'de1e0000-0000-4000-8000-0000000000a5';
  _p6      uuid := 'de1e0000-0000-4000-8000-0000000000a6';
  _pa      uuid := 'de1e0000-0000-4000-8000-0000000000fa';
  _pb      uuid := 'de1e0000-0000-4000-8000-0000000000fb';
  _pc      uuid := 'de1e0000-0000-4000-8000-0000000000fc';
  _pd      uuid := 'de1e0000-0000-4000-8000-0000000000fd';
  _pe      uuid := 'de1e0000-0000-4000-8000-0000000000fe';
  _pf      uuid := 'de1e0000-0000-4000-8000-0000000000ff';
  _pg      uuid := 'de1e0000-0000-4000-8000-0000000000f0';
  _px      uuid := 'de1e0000-0000-4000-8000-0000000000f1';
  _id      uuid;
  _id2     uuid;
  _id3     uuid;
  _id4     uuid;
  _id5     uuid;
  _link    uuid;
  _view    bigint;
  _path    text;
  _n       integer;
  _extra   text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_dr,    'del-dr@test.local',    now()),
    (_dr2,   'del-dr2@test.local',   now()),
    (_owner, 'del-owner@test.local', now()),
    (_pat,   'del-pat@test.local',   now()),
    (_p1,    'del-p1@test.local',    now()),
    (_p4,    'del-p4@test.local',    now()),
    (_p5,    'del-p5@test.local',    now()),
    (_p6,    'del-p6@test.local',    now());
  INSERT INTO public.profiles (user_id, name, email)
  SELECT id, split_part(email, '@', 1), email FROM auth.users WHERE email LIKE 'del-%@test.local'
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name)
  VALUES (_dr, 'Dee', 'One'), (_dr2, 'Dee', 'Two'), (_owner, 'Owen', 'Owner')
  ON CONFLICT (user_id) DO NOTHING;

  -- ==========================================================================
  -- A. The patient's side deleting: the institution's record stays
  -- ==========================================================================

  -- A1. A patient's account deleted must not take the consent history with it.
  --     The share row is what the clinician's access was granted on.
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active, permissions)
  VALUES (_p1, 'Dr Dee One', 'DEL-A1', _dr, false, '{}') RETURNING id INTO _id;
  PERFORM pg_temp.try(format('DELETE FROM auth.users WHERE id = %L', _p1));
  SELECT count(*) INTO _n FROM public.provider_shares WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'A1 deleting a patient account keeps the provider share (consent history)');

  -- A2. The relationship ledger outlives the share it describes, on both
  --     pathways.
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active, permissions)
  VALUES (_pat, 'Dr Dee One', 'DEL-A2', _dr, true, '{}') RETURNING id INTO _id;
  INSERT INTO public.share_events (share_id, patient_user_id, clinician_user_id, event_type, actor_role)
  VALUES (_id, _pat, _dr, 'connected', 'patient') RETURNING id INTO _id2;
  PERFORM pg_temp.try(format('DELETE FROM public.provider_shares WHERE id = %L', _id));
  SELECT count(*) INTO _n FROM public.share_events WHERE id = _id2;
  PERFORM pg_temp.assert(_n = 1, 'A2a removing a provider share keeps its share_events');

  ALTER TABLE public.practices DISABLE TRIGGER add_practice_owner_trigger;
  INSERT INTO public.practices (id, name, created_by) VALUES (_px, 'Del X', _owner);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_px, _pat, true, true, '{}') RETURNING id INTO _id;
  SELECT count(*) INTO _n FROM public.share_events WHERE practice_share_id = _id;
  PERFORM pg_temp.assert(_n >= 1, 'A2b fixture: the practice share logged a connected event');
  PERFORM pg_temp.try(format('DELETE FROM public.practice_shares WHERE id = %L', _id));
  SELECT count(*) INTO _n FROM public.share_events WHERE practice_share_id = _id;
  PERFORM pg_temp.assert(_n >= 1, 'A2b removing a practice share keeps its share_events');

  -- A3. The clinician's alert rule is the clinician's; the share going does
  --     not remove it.
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active, permissions)
  VALUES (_pat, 'Dr Dee One', 'DEL-A3', _dr, true, '{}') RETURNING id INTO _id;
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value)
  VALUES (_dr, _pat, _id, 'heart_rate', 'above', 120) RETURNING id INTO _id2;
  PERFORM pg_temp.try(format('DELETE FROM public.provider_shares WHERE id = %L', _id));
  SELECT count(*) INTO _n FROM public.clinician_alert_rules WHERE id = _id2;
  PERFORM pg_temp.assert(_n = 1, 'A3 removing a share keeps the clinician''s alert rule');

  -- A4. A proposal is the clinician's record of asking; the patient's account
  --     going does not erase it.
  INSERT INTO public.record_change_proposals (patient_user_id, proposed_by_user_id, kind, payload)
  VALUES (_p4, _dr, 'medication_start', '{"name": "Amlodipine"}') RETURNING id INTO _id;
  PERFORM pg_temp.try(format('DELETE FROM auth.users WHERE id = %L', _p4));
  SELECT count(*) INTO _n FROM public.record_change_proposals WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'A4 deleting a patient account keeps the clinician''s change proposal');

  -- A5. Who opened a snapshot link is a ledger; it survives the link and the
  --     account.
  INSERT INTO public.snapshot_links (user_id, token_hash, categories, sharer_first_name, snapshot, expires_at)
  VALUES (_p5, repeat('ab', 32), ARRAY['vitals'], 'Pat', '{}', now() + interval '1 day')
  RETURNING id INTO _link;
  INSERT INTO public.snapshot_link_views (link_id, kind) VALUES (_link, 'snapshot') RETURNING id INTO _view;
  PERFORM pg_temp.try(format('DELETE FROM public.snapshot_links WHERE id = %L', _link));
  SELECT count(*) INTO _n FROM public.snapshot_link_views WHERE id = _view;
  PERFORM pg_temp.assert(_n = 1, 'A5a removing a snapshot link keeps its view ledger');
  PERFORM pg_temp.try(format('DELETE FROM auth.users WHERE id = %L', _p5));
  SELECT count(*) INTO _n FROM public.snapshot_link_views WHERE id = _view;
  PERFORM pg_temp.assert(_n = 1, 'A5b deleting the patient account keeps the view ledger');

  -- A6. Everything the institution wrote survives the patient's account going,
  --     and the account really does go (so the survivals are not vacuous).
  INSERT INTO public.encounters (patient_user_id, clinician_user_id) VALUES (_p6, _dr) RETURNING id INTO _id;
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_p6, _dr, 'Seen in clinic.', 'private') RETURNING id INTO _id2;
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, linked_user_id)
  VALUES (_dr, 'Patient Six', _p6) RETURNING id INTO _id3;
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_p6, _dr, _dr, 'Your results are back.') RETURNING id INTO _id4;
  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, patient_user_id)
  VALUES (_dr, 'view_patient', 'patient', _p6::text, _p6) RETURNING id INTO _id5;
  PERFORM pg_temp.try(format('DELETE FROM auth.users WHERE id = %L', _p6));
  SELECT count(*) INTO _n FROM public.profiles WHERE user_id = _p6;
  PERFORM pg_temp.assert(_n = 0, 'A6 fixture: a patient account with only institution-side rows can be deleted');
  SELECT count(*) INTO _n FROM public.encounters WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'A6 the encounter survives the patient''s account');
  SELECT count(*) INTO _n FROM public.internal_notes WHERE id = _id2;
  PERFORM pg_temp.assert(_n = 1, 'A6 the clinician''s note survives the patient''s account');
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _id3;
  PERFORM pg_temp.assert(_n = 1, 'A6 the practice''s patient record survives the patient''s account');
  SELECT count(*) INTO _n FROM public.messages WHERE id = _id4;
  PERFORM pg_temp.assert(_n = 1, 'A6 the clinician''s message survives the patient''s account');
  SELECT count(*) INTO _n FROM public.hipaa_audit_logs WHERE id = _id5;
  PERFORM pg_temp.assert(_n = 1, 'A6 the audit log survives the patient''s account');

  -- A7. A clinician deleting their own unclaimed record (which they may) does
  --     not take an agreement the patient is party to with it.
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name)
  VALUES (_dr, 'Unclaimed') RETURNING id INTO _id;
  INSERT INTO public.data_sharing_agreements (clinician_user_id, patient_user_id, clinician_record_id)
  VALUES (_dr, _pat, _id) RETURNING id INTO _id2;
  PERFORM pg_temp.as_user(_dr);
  DELETE FROM public.clinician_patient_records WHERE id = _id;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_patient_records WHERE id = _id;
  PERFORM pg_temp.assert(_n = 0, 'A7 a clinician can still delete their own unclaimed record');
  SELECT count(*) INTO _n FROM public.data_sharing_agreements WHERE id = _id2;
  PERFORM pg_temp.assert(_n = 1, 'A7 the patient''s data-sharing agreement survives it');

  -- ==========================================================================
  -- B. The clinician's or hospital's side deleting: the patient's copy stays
  -- ==========================================================================

  -- B1. A clinician deleting their account leaves what they sent the patient.
  _path := _pat || '/del-b1-letter.pdf';
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, source_context, file_path, file_name, title)
  VALUES (_pat, _dr2, 'clinician_upload', _path, 'letter.pdf', 'Referral letter') RETURNING id INTO _id;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('health-documents', _path, _dr2);
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_pat, _dr2, _dr2, 'Please book a follow-up.') RETURNING id INTO _id2;
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, title, instruction, acknowledged_at)
  VALUES (_dr2, _pat, 'Rest', 'Rest for a week.', now()) RETURNING id INTO _id3;
  PERFORM pg_temp.try(format('DELETE FROM auth.users WHERE id = %L', _dr2));
  SELECT count(*) INTO _n FROM public.profiles WHERE user_id = _dr2;
  PERFORM pg_temp.assert(_n = 0, 'B1 fixture: the clinician account really was deleted');
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _id AND retracted_at IS NULL;
  PERFORM pg_temp.assert(_n = 1, 'B1 the document they sent stays in the patient''s Vault');
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'health-documents' AND name = _path;
  PERFORM pg_temp.assert(_n = 1, 'B1 and so does its file');
  SELECT count(*) INTO _n FROM public.messages WHERE id = _id2;
  PERFORM pg_temp.assert(_n = 1, 'B1 their message stays in the patient''s history');
  SELECT count(*) INTO _n FROM public.clinician_guidance WHERE id = _id3;
  PERFORM pg_temp.assert(_n = 1, 'B1 their acknowledged guidance stays with the patient');

  -- B2. A clinician cannot delete a document they sent, row or file.
  _path := _pat || '/del-b2-results.pdf';
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, source_context, file_path, file_name, title)
  VALUES (_pat, _dr, 'clinician_upload', _path, 'results.pdf', 'Results') RETURNING id INTO _id;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('health-documents', _path, _dr);
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.try(format('DELETE FROM public.health_documents WHERE id = %L', _id));
  PERFORM pg_temp.try(format('DELETE FROM storage.objects WHERE bucket_id = %L AND name = %L', 'health-documents', _path));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B2 the sender cannot delete the patient''s copy of a document');
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'health-documents' AND name = _path;
  PERFORM pg_temp.assert(_n = 1, 'B2 nor its file');

  -- C1 rides on the same document: the patient cannot destroy it either
  -- (withdrawal is the sender's route; this is the other direction).
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.try(format('DELETE FROM public.health_documents WHERE id = %L', _id));
  PERFORM pg_temp.try(format('DELETE FROM storage.objects WHERE bucket_id = %L AND name = %L', 'health-documents', _path));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'C1 the patient cannot delete a document the clinician filed (the clinician''s copy of what was sent)');

  -- B3. A message attachment is one object both parties read. Once sent, the
  --     sender cannot delete it out from under the recipient, in either
  --     direction. An upload no message points at is still the uploader's to
  --     clear.
  _path := _pat || '/' || _dr || '/del-b3-from-clinician.pdf';
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('message-attachments', _path, _dr);
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, attachment_path)
  VALUES (_pat, _dr, _dr, 'Letter attached', _path);
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.try(format('DELETE FROM storage.objects WHERE bucket_id = %L AND name = %L', 'message-attachments', _path));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'message-attachments' AND name = _path;
  PERFORM pg_temp.assert(_n = 1, 'B3a a clinician cannot delete an attachment they sent the patient');

  _path := _pat || '/' || _dr || '/del-b3-from-patient.jpg';
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('message-attachments', _path, _pat);
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, attachment_path)
  VALUES (_pat, _dr, _pat, 'Photo of the rash', _path);
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.try(format('DELETE FROM storage.objects WHERE bucket_id = %L AND name = %L', 'message-attachments', _path));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'message-attachments' AND name = _path;
  PERFORM pg_temp.assert(_n = 1, 'B3b a patient cannot delete an attachment they sent the clinician');

  _path := _pat || '/' || _dr || '/del-b3-never-sent.pdf';
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('message-attachments', _path, _dr);
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.try(format('DELETE FROM storage.objects WHERE bucket_id = %L AND name = %L', 'message-attachments', _path));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'message-attachments' AND name = _path;
  PERFORM pg_temp.assert(_n = 0, 'B3c an upload no message references is still its owner''s to delete');

  -- B4. Deleting a tenant. Each fixture practice holds one kind of dependent
  --     row and no owner membership, so each constraint is tested on its own.
  --     (add_practice_owner_trigger stays disabled until B4e.)
  INSERT INTO public.practices (id, name, created_by) VALUES (_pa, 'Del A', _owner);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_pa, _pat, true, true, '{}') RETURNING id INTO _id;
  DELETE FROM public.share_events WHERE practice_share_id = _id;  -- isolate from A2b's constraint
  PERFORM pg_temp.try(format('DELETE FROM public.practices WHERE id = %L', _pa));
  SELECT count(*) INTO _n FROM public.practice_shares WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B4a deleting a tenant keeps the patient''s share with it (consent history)');

  INSERT INTO public.practices (id, name, created_by) VALUES (_pb, 'Del B', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_pb, _dr, 'clinician', 'active') RETURNING id INTO _id;
  DELETE FROM public.practice_membership_events WHERE practice_id = _pb;  -- isolate from B4c's constraint
  PERFORM pg_temp.try(format('DELETE FROM public.practices WHERE id = %L', _pb));
  SELECT count(*) INTO _n FROM public.practice_members WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B4b deleting a tenant keeps its membership rows');

  INSERT INTO public.practices (id, name, created_by) VALUES (_pc, 'Del C', _owner);
  INSERT INTO public.practice_membership_events (practice_id, user_id, event_type)
  VALUES (_pc, _dr, 'joined') RETURNING id INTO _id;
  PERFORM pg_temp.try(format('DELETE FROM public.practices WHERE id = %L', _pc));
  SELECT count(*) INTO _n FROM public.practice_membership_events WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B4c deleting a tenant keeps the membership ledger');

  INSERT INTO public.practices (id, name, created_by) VALUES (_pd, 'Del D', _owner);
  INSERT INTO public.fhir_appointments (patient_user_id, practice_id, status)
  VALUES (_pat, _pd, 'proposed') RETURNING id INTO _id;
  PERFORM pg_temp.try(format('DELETE FROM public.practices WHERE id = %L', _pd));
  SELECT count(*) INTO _n FROM public.fhir_appointments WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B4d deleting a tenant keeps the patient''s appointments');

  INSERT INTO public.practices (id, name, created_by) VALUES (_pe, 'Del E', _owner);
  INSERT INTO public.fhir_invoices (patient_user_id, practice_id) VALUES (_pat, _pe) RETURNING id INTO _id;
  PERFORM pg_temp.try(format('DELETE FROM public.practices WHERE id = %L', _pe));
  SELECT count(*) INTO _n FROM public.fhir_invoices WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B4d deleting a tenant keeps the patient''s invoices');

  INSERT INTO public.practices (id, name, created_by) VALUES (_pf, 'Del F', _owner);
  INSERT INTO public.fhir_care_plans (patient_user_id, practice_id, title)
  VALUES (_pat, _pf, 'Blood pressure plan') RETURNING id INTO _id;
  PERFORM pg_temp.try(format('DELETE FROM public.practices WHERE id = %L', _pf));
  SELECT count(*) INTO _n FROM public.fhir_care_plans WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B4d deleting a tenant keeps the patient''s care plans');

  ALTER TABLE public.practices ENABLE TRIGGER add_practice_owner_trigger;

  -- B4e. The whole thing, the way it would actually be done: the owner deletes
  --      their tenant through the policy that lets them.
  PERFORM pg_temp.as_user(_owner);
  INSERT INTO public.practices (id, name, created_by) VALUES (_pg, 'Del G', _owner);
  PERFORM pg_temp.as_user(_pat);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_pg, _pat, true, true, '{}') RETURNING id INTO _id;
  PERFORM pg_temp.as_user(_owner);
  PERFORM pg_temp.try(format('DELETE FROM public.practices WHERE id = %L', _pg));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_shares WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'B4e an owner deleting their tenant leaves the patient''s share');
  SELECT count(*) INTO _n FROM public.share_events WHERE practice_share_id = _id;
  PERFORM pg_temp.assert(_n >= 1, 'B4e and its share history');
  SELECT count(*) INTO _n FROM public.practice_membership_events WHERE practice_id = _pg;
  PERFORM pg_temp.assert(_n >= 1, 'B4e and the membership ledger');

  -- ==========================================================================
  -- C. The patient deleting their own things: only their own things go
  -- ==========================================================================

  -- C2. A patient deleting a medication they entered by mistake leaves the
  --     clinician's answered proposal about it, unlinked.
  INSERT INTO public.medications (user_id, name, dosage, frequency, source)
  VALUES (_pat, 'Mistake', '5 mg', 'Once daily', 'manual') RETURNING id INTO _id;
  INSERT INTO public.record_change_proposals (patient_user_id, proposed_by_user_id, kind, payload, medication_id, status, responded_at)
  VALUES (_pat, _dr, 'medication_change', '{"dosage": "10 mg"}', _id, 'declined', now()) RETURNING id INTO _id2;
  PERFORM pg_temp.as_user(_pat);
  DELETE FROM public.medications WHERE id = _id;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.medications WHERE id = _id;
  PERFORM pg_temp.assert(_n = 0, 'C2 the patient can still delete a medication they entered by mistake');
  SELECT count(*) INTO _n FROM public.record_change_proposals WHERE id = _id2;
  PERFORM pg_temp.assert(_n = 1, 'C2 the clinician''s proposal about it survives');

  -- C3. Nobody deletes a message, from either side.
  SELECT id INTO _id FROM public.messages WHERE patient_user_id = _pat AND sender_user_id = _dr LIMIT 1;
  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.try(format('DELETE FROM public.messages WHERE id = %L', _id));
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.try(format('DELETE FROM public.messages WHERE id = %L', _id));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.messages WHERE id = _id;
  PERFORM pg_temp.assert(_n = 1, 'C3 neither party can delete a message');

  -- ==========================================================================
  -- D. The catalogue: every cascade left is one reviewed as same-side
  -- ==========================================================================
  --
  -- Anything not on this list carries a deletion somewhere nobody decided it
  -- should go. A new cascade has to be added here on purpose, with a reason,
  -- or this fails naming it. The reasons are in the migration
  -- 20261010120000_deletion_never_crosses_parties.sql.
  SELECT string_agg(k, ', ' ORDER BY k) INTO _extra
    FROM (
      SELECT c.conrelid::regclass::text || '.' || a.attname AS k
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f' AND c.confdeltype = 'c'
         AND c.connamespace = 'public'::regnamespace
    ) cascades
   WHERE k NOT IN (
     -- A deleted account takes its own data, and only its own.
     'profiles.user_id', 'medications.user_id', 'vitals.user_id', 'schedule_entries.user_id',
     'consent_logs.user_id', 'legal_acceptances.user_id', 'baa_agreements.clinician_user_id',
     'snapshot_links.user_id',
     -- Children of a patient's own rows.
     'schedule_entries.medication_id', 'medication_photos.medication_id', 'ehr_export_queue.vital_id',
     'document_shares.document_id', 'document_shares.provider_share_id',
     'medications.family_member_id', 'vitals.family_member_id', 'schedule_entries.family_member_id',
     'caregiver_access.family_member_id', 'care_alert_settings.family_member_id',
     'care_alert_logs.setting_id', 'ai_messages.conversation_id',
     -- Children of a clinician's own rows.
     'clinician_guidance_notifications.guidance_id', 'ehr_sync_logs.connection_id',
     'ehr_export_queue.connection_id', 'encounter_addenda.encounter_id',
     'fhir_invoice_items.invoice_id', 'fhir_care_goals.care_plan_id',
     -- A tenant's own configuration and internal workflow.
     'clinician_guidance_notifications.practice_id', 'practice_invitations.practice_id',
     'practice_role_permissions.practice_id', 'practice_patient_assignments.practice_id',
     'practice_tasks.practice_id', 'clinical_templates.practice_id',
     'tenant_owner_invitations.practice_id', 'practice_departments.practice_id',
     'practice_department_members.practice_id', 'practice_department_members.department_id',
     'practice_patient_departments.practice_id', 'practice_patient_departments.department_id',
     'practice_clinician_allowlist.practice_id',
     -- Platform-only.
     'qhin_record_provenance.import_id', 'beta_nda_signatures.tester_id'
   );
  PERFORM pg_temp.assert(_extra IS NULL, 'D no unreviewed ON DELETE CASCADE: ' || COALESCE(_extra, 'none'));

  PERFORM pg_temp.as_user(NULL);
  IF current_setting('onecare_test.failures', true) <> '' THEN
    RAISE EXCEPTION 'deletion_never_crosses_parties FAILED:%', current_setting('onecare_test.failures', true);
  END IF;
  RAISE NOTICE 'deletion_never_crosses_parties: all assertions passed';
END $$;

ROLLBACK;
