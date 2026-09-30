-- One party's deletion never removes the other party's copy.
--
-- The rule is in the consent model (docs/sharing-access-consent-model.md 4 and
-- 7.4): neither the patient nor the institution deletes the other's record,
-- and deletion is never done by a foreign-key cascade. The DELETE policies
-- already kept to it. The foreign keys did not. An account removed from the
-- dashboard or by the service role, or a tenant removed by its owner through
-- the policy that lets them, walked every ON DELETE CASCADE underneath it, and
-- thirteen of those cascades ended in a row that belonged to the other party or
-- to an append-only ledger. Nothing asked whose row it was.
--
-- What each one would have taken, found by deleting as the superuser against
-- fixtures and watching what went (supabase/tests/
-- deletion_never_crosses_parties.test.sql), then checked against the full list
-- of cascading keys in pg_constraint:
--
--   A patient account going took the provider share, which is the consent the
--   clinician's access rested on, and through it the relationship ledger and
--   the clinician's own alert rules. It took every change proposal a
--   clinician had made to that patient, answered or not. It took the patient's
--   snapshot links and with them the record of who opened them.
--
--   A tenant going took every patient's share with it and its history, every
--   membership row and the membership ledger, and the appointments, invoices
--   and care plans the patients read as theirs.
--
--   A clinician deleting an unclaimed record they may delete took the
--   data-sharing agreement a patient had signed against it.
--
-- Each becomes RESTRICT, except the agreement, which becomes SET NULL: the
-- clinician keeps the right to delete their own unclaimed record, and the
-- agreement stays as the remnant of what was agreed, pointing at nothing.
-- RESTRICT means an account or a tenant with a relationship behind it can no
-- longer be deleted by a single statement. That is the intent, not a side
-- effect. Deletion under 7.1 or 7.2 is to be an explicit, logged operation that
-- decides row by row what goes and what stays; until one is built, the
-- database refuses rather than deciding by cascade. Deleting a patient's own
-- data (their readings, medications, profile) with their account is unchanged,
-- because that is their side.
--
-- The one path that was not a foreign key: the storage policy that let a
-- chat sender delete an attachment they had sent. A message attachment is a
-- single object both parties read, so the sender deleting it removed the
-- recipient's copy as well, in either direction, and removed the evidence a
-- withdrawal (withdraw_shared_file, which keeps the object and records its
-- path) is meant to preserve. The sender may now delete an upload only while no
-- message refers to it, which is the case the policy exists for: an upload
-- whose message was never sent.
--
-- Deliberately unchanged, and why, so the next reader does not have to
-- rediscover it:
--
--   Documents a clinician sends to the Vault are already an independent copy:
--   a separate health_documents row and object in the patient's own folder,
--   which the clinician cannot delete or overwrite (no policy reaches it) and
--   whose uploaded_by_user_id has no foreign key, so the clinician's account
--   going leaves it. Care record snapshots are the same, written by the
--   patient into their own folder.
--   messages, encounters, internal_notes, clinician_guidance,
--   clinician_patient_records and hipaa_audit_logs name their people without
--   foreign keys, so neither party's account deletion reaches them; where they
--   name a practice the key is SET NULL.
--   Withdrawal and retraction hide a document from its recipient by design
--   (docs/withdrawal-and-derived-data.md); that is the sender's narrow,
--   recorded remedy and not a deletion, and it stands.
--
-- The cascades that remain are listed, with the reason each is same-side, in
-- section D of the test, which fails naming any new one.

-- ---------------------------------------------------------------------------
-- The patient's account, and what hung off the share
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_shares DROP CONSTRAINT IF EXISTS provider_shares_user_id_fkey;
ALTER TABLE public.provider_shares
  ADD CONSTRAINT provider_shares_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.share_events DROP CONSTRAINT IF EXISTS share_events_share_id_fkey;
ALTER TABLE public.share_events
  ADD CONSTRAINT share_events_share_id_fkey
  FOREIGN KEY (share_id) REFERENCES public.provider_shares(id) ON DELETE RESTRICT;

ALTER TABLE public.share_events DROP CONSTRAINT IF EXISTS share_events_practice_share_id_fkey;
ALTER TABLE public.share_events
  ADD CONSTRAINT share_events_practice_share_id_fkey
  FOREIGN KEY (practice_share_id) REFERENCES public.practice_shares(id) ON DELETE RESTRICT;

ALTER TABLE public.clinician_alert_rules DROP CONSTRAINT IF EXISTS clinician_alert_rules_share_id_fkey;
ALTER TABLE public.clinician_alert_rules
  ADD CONSTRAINT clinician_alert_rules_share_id_fkey
  FOREIGN KEY (share_id) REFERENCES public.provider_shares(id) ON DELETE RESTRICT;

ALTER TABLE public.record_change_proposals DROP CONSTRAINT IF EXISTS record_change_proposals_patient_user_id_fkey;
ALTER TABLE public.record_change_proposals
  ADD CONSTRAINT record_change_proposals_patient_user_id_fkey
  FOREIGN KEY (patient_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- The link itself is the patient's and still goes with their account when
-- nobody has opened it; once somebody has, the views are a ledger of access to
-- the patient's data and the link cannot be removed from under them.
ALTER TABLE public.snapshot_link_views DROP CONSTRAINT IF EXISTS snapshot_link_views_link_id_fkey;
ALTER TABLE public.snapshot_link_views
  ADD CONSTRAINT snapshot_link_views_link_id_fkey
  FOREIGN KEY (link_id) REFERENCES public.snapshot_links(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- The tenant
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_shares DROP CONSTRAINT IF EXISTS practice_shares_practice_id_fkey;
ALTER TABLE public.practice_shares
  ADD CONSTRAINT practice_shares_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE RESTRICT;

ALTER TABLE public.practice_members DROP CONSTRAINT IF EXISTS practice_members_practice_id_fkey;
ALTER TABLE public.practice_members
  ADD CONSTRAINT practice_members_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE RESTRICT;

ALTER TABLE public.practice_membership_events DROP CONSTRAINT IF EXISTS practice_membership_events_practice_id_fkey;
ALTER TABLE public.practice_membership_events
  ADD CONSTRAINT practice_membership_events_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE RESTRICT;

ALTER TABLE public.fhir_appointments DROP CONSTRAINT IF EXISTS fhir_appointments_practice_id_fkey;
ALTER TABLE public.fhir_appointments
  ADD CONSTRAINT fhir_appointments_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE RESTRICT;

ALTER TABLE public.fhir_invoices DROP CONSTRAINT IF EXISTS fhir_invoices_practice_id_fkey;
ALTER TABLE public.fhir_invoices
  ADD CONSTRAINT fhir_invoices_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE RESTRICT;

ALTER TABLE public.fhir_care_plans DROP CONSTRAINT IF EXISTS fhir_care_plans_practice_id_fkey;
ALTER TABLE public.fhir_care_plans
  ADD CONSTRAINT fhir_care_plans_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- The clinician's own record, and the patient's agreement against it
-- ---------------------------------------------------------------------------

ALTER TABLE public.data_sharing_agreements DROP CONSTRAINT IF EXISTS data_sharing_agreements_clinician_record_id_fkey;
ALTER TABLE public.data_sharing_agreements
  ADD CONSTRAINT data_sharing_agreements_clinician_record_id_fkey
  FOREIGN KEY (clinician_record_id) REFERENCES public.clinician_patient_records(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- A sent attachment is the recipient's too
-- ---------------------------------------------------------------------------

-- Definer so the answer does not depend on which messages the caller can read:
-- a sender whose thread has since closed must still be refused.
CREATE OR REPLACE FUNCTION public.message_attachment_never_sent(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.messages m WHERE m.attachment_path = _name
  );
$$;

REVOKE ALL ON FUNCTION public.message_attachment_never_sent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_attachment_never_sent(text) TO authenticated;

DROP POLICY IF EXISTS "Chat senders can delete their attachments" ON storage.objects;
DROP POLICY IF EXISTS "Chat senders delete only attachments never sent" ON storage.objects;
CREATE POLICY "Chat senders delete only attachments never sent"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND owner = auth.uid()
    AND public.message_attachment_never_sent(name)
  );
