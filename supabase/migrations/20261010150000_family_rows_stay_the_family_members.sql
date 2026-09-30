-- A family member's rows stay the family member's
--
-- A dependent's readings, medicines, doses, documents, folders, notes and alert
-- settings are stored under the account holder's user_id with a
-- family_member_id tag (20260117063816 and after). The feature is hidden behind
-- FAMILY_HEALTH_ENABLED, but the tables, policies and hooks are live, and with
-- that shape four things were wrong in the database today:
--
--   1. Removing a family member deleted their medical history. The owner had a
--      DELETE policy on family_members, and medications, vitals,
--      schedule_entries, care_alert_settings and caregiver_access all hung off
--      it ON DELETE CASCADE. One tap on "Remove" and the medicines, readings
--      and dose history were gone, with no trace that they had existed.
--   2. The same delete made the member's documents, folders and notes the
--      owner's own. Those three keys were ON DELETE SET NULL, and every read
--      path treats family_member_id IS NULL as "the account holder's": a
--      child's discharge letter became the parent's, silently.
--   3. A parent's clinician or hospital read the child's rows as the parent's.
--      Every clinician and institution read policy asked
--      clinician_has_patient_permission(user_id, ...) or
--      institution_has_clinical_permission(user_id, ...), and user_id is the
--      parent's on a child's row. They could also write into the child's
--      record the same way (a reading, a document, a proposal on the child's
--      medicine), and nothing stopped a row being tagged with another
--      account's family member at all.
--   4. The missed-dose alert counted every pending dose on the account. A
--      contact set up for the parent was told the parent had missed the
--      child's doses, and the reverse.
--
-- What this does:
--
--   - Removing becomes archiving. family_members gains archived_at; is_active
--     is derived from it by trigger so the two cannot disagree (the pickers
--     already filter on is_active). The DELETE policy goes and DELETE and
--     TRUNCATE are revoked from clients. Archived members keep their whole
--     history, visible to and restorable by the owner.
--   - Every key to family_members becomes ON DELETE RESTRICT, so nothing can
--     cascade or be blanked even for the service role or the dashboard. On the
--     seven tables that carry user_id the key becomes composite,
--     (family_member_id, user_id) -> (id, owner_user_id): a row can only be
--     tagged with its own account's family member.
--   - A dose's family_member_id follows its medicine, by trigger, because the
--     client wrote it from whichever person was selected on screen. Existing
--     doses that disagree with their medicine are corrected here.
--   - Every clinician and institution read policy on vitals, medications,
--     schedule_entries and health_documents (whole-vault and one-at-a-time,
--     and the storage policies behind the files) excludes family rows: the
--     parent's share covers the parent only. The clinician write policies
--     refuse family rows. The same filter is applied in the edge functions
--     that read with the service role (get-shared-patient-data,
--     get-shared-document-url, check-vital-alerts, clinician-ai-chat,
--     ehr-export), mirroring what the snapshot link and patient assistant
--     already did.
--   - One neighbouring hole, found while rewriting the document-share read
--     policy: it checked that a document_shares row pointed at the document
--     and at a live share with this clinician, but never that the share's
--     patient owned the document. document_shares' INSERT and UPDATE policies
--     checked only user_id, so a patient could point their share at another
--     patient's document id and their clinician could then read it and open
--     its file. The reads now require the document, the document share and
--     the provider share to belong to one patient, and the writes check it.
--   - care_alert_missed_doses(setting) is the one definition of what an alert
--     counts: that setting's person's pending doses, nobody else's.
--     check-care-alerts calls it.
--
-- What it does not do: build dependent accounts, guardianship or next of kin
-- (phases 1 to 5 of docs/plans/family-caregivers-and-next-of-kin.md, paused).
-- The care record snapshot compiler (care_record_entries) is left as it is: it
-- lists what one clinician or hospital sent, which stays true of a document the
-- patient later filed under a family member, and clinician uploads can no
-- longer be tagged at all.

-- ---------------------------------------------------------------------------
-- 0. Count what exists, before anything changes
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _t text;
  _n bigint;
  _line text := '';
BEGIN
  SELECT count(*) INTO _n FROM public.family_members;
  _line := 'family_members=' || _n;
  FOREACH _t IN ARRAY ARRAY['medications', 'vitals', 'schedule_entries', 'care_alert_settings',
                            'health_documents', 'document_folders', 'personal_notes', 'caregiver_access'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE family_member_id IS NOT NULL', _t) INTO _n;
    _line := _line || ', ' || _t || '=' || _n;
  END LOOP;
  RAISE NOTICE 'Family rows before phase 0: %', _line;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Removing is archiving
-- ---------------------------------------------------------------------------

ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.family_members.archived_at IS
  'When the owner removed this person from their pickers. Nothing of theirs is '
  'deleted; clearing it restores them. is_active is derived from it.';

-- Anyone already switched off was, in effect, archived; keep them where they were.
UPDATE public.family_members
   SET archived_at = COALESCE(updated_at, now())
 WHERE is_active IS FALSE AND archived_at IS NULL;

-- is_active is what the switcher and pickers filter on. Derived rather than
-- written, so a client setting one without the other cannot leave a member
-- hidden but not archived, or archived but still offered.
CREATE OR REPLACE FUNCTION public.family_member_active_follows_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_active := NEW.archived_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.family_member_active_follows_archive() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_family_member_active_follows_archive ON public.family_members;
CREATE TRIGGER trg_family_member_active_follows_archive
BEFORE INSERT OR UPDATE ON public.family_members
FOR EACH ROW EXECUTE FUNCTION public.family_member_active_follows_archive();

UPDATE public.family_members SET is_active = (archived_at IS NULL)
 WHERE is_active IS DISTINCT FROM (archived_at IS NULL);

DROP POLICY IF EXISTS "Users can delete their own family members" ON public.family_members;
REVOKE DELETE, TRUNCATE ON public.family_members FROM PUBLIC, anon, authenticated;

-- The UPDATE policy had no WITH CHECK; it fell back to USING, which is the
-- same rule. Said out loud now that archiving is an UPDATE.
DROP POLICY IF EXISTS "Users can update their own family members" ON public.family_members;
CREATE POLICY "Users can update their own family members"
  ON public.family_members FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- ---------------------------------------------------------------------------
-- 2. Keys: nothing cascades, nothing is blanked, and a tag names one's own
-- ---------------------------------------------------------------------------

ALTER TABLE public.family_members
  DROP CONSTRAINT IF EXISTS family_members_id_owner_key,
  ADD CONSTRAINT family_members_id_owner_key UNIQUE (id, owner_user_id);

ALTER TABLE public.caregiver_access
  DROP CONSTRAINT IF EXISTS caregiver_access_family_member_id_fkey,
  ADD CONSTRAINT caregiver_access_family_member_id_fkey
    FOREIGN KEY (family_member_id) REFERENCES public.family_members(id) ON DELETE RESTRICT;

-- A row already tagged with somebody else's family member cannot be put right
-- by guessing, so the key is then left NOT VALID (it still holds for every new
-- and changed row) and the count is reported for somebody to look at.
DO $$
DECLARE
  _t text;
  _bad bigint;
BEGIN
  FOREACH _t IN ARRAY ARRAY['medications', 'vitals', 'schedule_entries', 'care_alert_settings',
                            'health_documents', 'document_folders', 'personal_notes'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', _t, _t || '_family_member_id_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (family_member_id, user_id) '
      'REFERENCES public.family_members (id, owner_user_id) ON DELETE RESTRICT NOT VALID',
      _t, _t || '_family_member_id_fkey');
    EXECUTE format(
      'SELECT count(*) FROM public.%I r WHERE r.family_member_id IS NOT NULL AND NOT EXISTS ('
      '  SELECT 1 FROM public.family_members fm WHERE fm.id = r.family_member_id AND fm.owner_user_id = r.user_id)',
      _t) INTO _bad;
    IF _bad = 0 THEN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', _t, _t || '_family_member_id_fkey');
    ELSE
      RAISE NOTICE '%: % row(s) tagged with another account''s family member; key left NOT VALID', _t, _bad;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. A dose belongs to whoever its medicine is for
-- ---------------------------------------------------------------------------
--
-- useScheduleEntries wrote family_member_id from the person selected on
-- screen, not from the medication, so a dose could be counted, shown and
-- shared as somebody else's. Every read rule below filters doses on their own
-- tag; this is what makes that tag true.

CREATE OR REPLACE FUNCTION public.schedule_entry_follows_medication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT m.family_member_id INTO NEW.family_member_id
    FROM public.medications m WHERE m.id = NEW.medication_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.schedule_entry_follows_medication() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_schedule_entry_follows_medication ON public.schedule_entries;
CREATE TRIGGER trg_schedule_entry_follows_medication
BEFORE INSERT OR UPDATE OF medication_id, family_member_id ON public.schedule_entries
FOR EACH ROW EXECUTE FUNCTION public.schedule_entry_follows_medication();

-- And when a medicine is refiled under somebody else, its doses go with it.
CREATE OR REPLACE FUNCTION public.medication_doses_follow_it()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.schedule_entries
     SET family_member_id = NEW.family_member_id
   WHERE medication_id = NEW.id
     AND family_member_id IS DISTINCT FROM NEW.family_member_id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.medication_doses_follow_it() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_medication_doses_follow_it ON public.medications;
CREATE TRIGGER trg_medication_doses_follow_it
AFTER UPDATE OF family_member_id ON public.medications
FOR EACH ROW WHEN (OLD.family_member_id IS DISTINCT FROM NEW.family_member_id)
EXECUTE FUNCTION public.medication_doses_follow_it();

DO $$
DECLARE _n bigint;
BEGIN
  UPDATE public.schedule_entries se
     SET family_member_id = m.family_member_id
    FROM public.medications m
   WHERE m.id = se.medication_id
     AND se.family_member_id IS DISTINCT FROM m.family_member_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN
    RAISE NOTICE 'schedule_entries: % dose(s) re-tagged to match their medication', _n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. The parent's share covers the parent: reads
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Clinicians can view shared patient vitals with permission" ON public.vitals;
CREATE POLICY "Clinicians can view shared patient vitals with permission"
  ON public.vitals FOR SELECT TO authenticated
  USING ((auth.uid() = user_id)
         OR (family_member_id IS NULL AND public.clinician_has_patient_permission(user_id, 'vitals')));

DROP POLICY IF EXISTS "Institution team can view shared vitals" ON public.vitals;
CREATE POLICY "Institution team can view shared vitals"
  ON public.vitals FOR SELECT TO authenticated
  USING (family_member_id IS NULL AND public.institution_has_clinical_permission(user_id, 'vitals'));

DROP POLICY IF EXISTS "Clinicians can view shared patient medications with permission" ON public.medications;
CREATE POLICY "Clinicians can view shared patient medications with permission"
  ON public.medications FOR SELECT TO authenticated
  USING (family_member_id IS NULL AND public.clinician_has_patient_permission(user_id, 'medications'));

DROP POLICY IF EXISTS "Institution team can view shared medications" ON public.medications;
CREATE POLICY "Institution team can view shared medications"
  ON public.medications FOR SELECT TO authenticated
  USING (family_member_id IS NULL AND public.institution_has_clinical_permission(user_id, 'medications'));

DROP POLICY IF EXISTS "Clinicians can view shared patient schedules with permission" ON public.schedule_entries;
CREATE POLICY "Clinicians can view shared patient schedules with permission"
  ON public.schedule_entries FOR SELECT TO authenticated
  USING ((auth.uid() = user_id)
         OR (family_member_id IS NULL AND public.clinician_has_patient_permission(user_id, 'adherence')));

DROP POLICY IF EXISTS "Institution team can view shared schedules" ON public.schedule_entries;
CREATE POLICY "Institution team can view shared schedules"
  ON public.schedule_entries FOR SELECT TO authenticated
  USING (family_member_id IS NULL AND public.institution_has_clinical_permission(user_id, 'adherence'));

DROP POLICY IF EXISTS "Clinicians can view whole vault when granted" ON public.health_documents;
CREATE POLICY "Clinicians can view whole vault when granted"
  ON public.health_documents FOR SELECT TO authenticated
  USING (retracted_at IS NULL
         AND archived_at IS NULL
         AND family_member_id IS NULL
         AND COALESCE(source_context, '') <> ALL (ARRAY['patient_recording', 'care_record_snapshot'])
         AND public.clinician_has_patient_permission(user_id, 'documents'));

DROP POLICY IF EXISTS "Institution team can view shared documents" ON public.health_documents;
CREATE POLICY "Institution team can view shared documents"
  ON public.health_documents FOR SELECT TO authenticated
  USING (retracted_at IS NULL
         AND archived_at IS NULL
         AND family_member_id IS NULL
         AND COALESCE(source_context, '') <> ALL (ARRAY['patient_recording', 'care_record_snapshot'])
         AND public.institution_has_clinical_permission(user_id, 'documents'));

-- One at a time: the document, the document share and the provider share must
-- all be the same patient's (see the header for why that was not asked).
DROP POLICY IF EXISTS "Users and shared clinicians can view documents" ON public.health_documents;
CREATE POLICY "Users and shared clinicians can view documents"
  ON public.health_documents FOR SELECT
  USING (retracted_at IS NULL AND (
    (auth.uid() = user_id)
    OR (family_member_id IS NULL
        AND public.caller_is_clinician()
        AND EXISTS (
          SELECT 1
            FROM public.document_shares ds
            JOIN public.provider_shares ps ON ds.provider_share_id = ps.id
           WHERE ds.document_id = health_documents.id
             AND ds.user_id = health_documents.user_id
             AND ps.user_id = health_documents.user_id
             AND ds.is_active = true
             AND ps.is_active = true
             AND (ps.expires_at IS NULL OR ps.expires_at > now())
             AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())))
  ));

DROP POLICY IF EXISTS "Clinicians can view shared health documents" ON storage.objects;
CREATE POLICY "Clinicians can view shared health documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'health-documents'
         AND public.caller_is_clinician()
         AND EXISTS (
           SELECT 1
             FROM public.health_documents hd
             JOIN public.document_shares ds ON ds.document_id = hd.id
             JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
            WHERE hd.file_path = objects.name
              AND hd.retracted_at IS NULL
              AND hd.family_member_id IS NULL
              AND ds.user_id = hd.user_id
              AND ps.user_id = hd.user_id
              AND ds.is_active = true
              AND ps.is_active = true
              AND (ps.expires_at IS NULL OR ps.expires_at > now())
              AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())));

DROP POLICY IF EXISTS "Clinicians can view shared lab reports" ON storage.objects;
CREATE POLICY "Clinicians can view shared lab reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lab-reports'
         AND public.caller_is_clinician()
         AND EXISTS (
           SELECT 1
             FROM public.health_documents hd
             JOIN public.document_shares ds ON ds.document_id = hd.id
             JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
            WHERE hd.file_path = objects.name
              AND hd.retracted_at IS NULL
              AND hd.family_member_id IS NULL
              AND ds.user_id = hd.user_id
              AND ps.user_id = hd.user_id
              AND ds.is_active = true
              AND ps.is_active = true
              AND (ps.expires_at IS NULL OR ps.expires_at > now())
              AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())));

-- A patient shares their own document on their own share. The per-document
-- share is for the patient's record; a family member's document has no share
-- that covers it until they hold a record of their own.
--
-- Asked through a definer function: health_documents' read policy consults
-- document_shares, so a document_shares policy reading health_documents
-- directly is refused by Postgres as recursive.
CREATE OR REPLACE FUNCTION public.caller_may_share_document(_document_id uuid, _provider_share_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.health_documents d
                  WHERE d.id = _document_id
                    AND d.user_id = auth.uid()
                    AND d.family_member_id IS NULL)
     AND EXISTS (SELECT 1 FROM public.provider_shares ps
                  WHERE ps.id = _provider_share_id
                    AND ps.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.caller_may_share_document(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_may_share_document(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Patients can create document shares" ON public.document_shares;
CREATE POLICY "Patients can create document shares"
  ON public.document_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id
              AND public.caller_may_share_document(document_id, provider_share_id));

DROP POLICY IF EXISTS "Patients can update their own document shares" ON public.document_shares;
CREATE POLICY "Patients can update their own document shares"
  ON public.document_shares FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
              AND public.caller_may_share_document(document_id, provider_share_id));

-- ---------------------------------------------------------------------------
-- 5. The parent's share covers the parent: writes
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Clinicians can record vitals for their patients" ON public.vitals;
CREATE POLICY "Clinicians can record vitals for their patients"
  ON public.vitals FOR INSERT TO authenticated
  WITH CHECK (recorded_by_user_id = auth.uid()
              AND user_id <> auth.uid()
              AND source = 'clinician'
              AND family_member_id IS NULL
              AND (public.clinician_has_patient_permission(user_id, 'vitals')
                   OR public.institution_has_clinical_permission(user_id, 'vitals')));

DROP POLICY IF EXISTS "Clinicians can add documents for their patients" ON public.health_documents;
CREATE POLICY "Clinicians can add documents for their patients"
  ON public.health_documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by_user_id = auth.uid()
              AND user_id <> auth.uid()
              AND source_context = 'clinician_upload'
              AND family_member_id IS NULL
              AND (public.clinician_has_patient_access(user_id)
                   OR public.institution_has_patient_access(user_id)));

DROP POLICY IF EXISTS "Clinicians propose to patients who share with them" ON public.record_change_proposals;
CREATE POLICY "Clinicians propose to patients who share with them"
  ON public.record_change_proposals FOR INSERT TO authenticated
  WITH CHECK (proposed_by_user_id = auth.uid()
              AND patient_user_id <> auth.uid()
              AND status = 'pending'
              AND responded_at IS NULL
              AND applied_medication_id IS NULL
              AND (public.clinician_has_patient_permission(patient_user_id, 'medications')
                   OR public.institution_has_clinical_permission(patient_user_id, 'medications'))
              AND (medication_id IS NULL OR EXISTS (
                     SELECT 1 FROM public.medications m
                      WHERE m.id = record_change_proposals.medication_id
                        AND m.user_id = record_change_proposals.patient_user_id
                        AND m.family_member_id IS NULL)));

-- ---------------------------------------------------------------------------
-- 6. What a missed-dose alert counts
-- ---------------------------------------------------------------------------
--
-- The setting's person's pending doses in the window, and nobody else's. A
-- setting with no family member is the account holder's own, and counts only
-- untagged doses; one for a family member counts only theirs. Called by
-- check-care-alerts with the service role; a client has no reason to.

CREATE OR REPLACE FUNCTION public.care_alert_missed_doses(
  _setting_id uuid, _from timestamptz, _until timestamptz
)
RETURNS TABLE (entry_id uuid, scheduled_time timestamptz, medication_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT se.id, se.scheduled_time, m.name
    FROM public.care_alert_settings s
    JOIN public.schedule_entries se
      ON se.user_id = s.user_id
     AND se.family_member_id IS NOT DISTINCT FROM s.family_member_id
    LEFT JOIN public.medications m ON m.id = se.medication_id
   WHERE s.id = _setting_id
     AND se.status = 'pending'
     AND se.scheduled_time >= _from
     AND se.scheduled_time < _until
   ORDER BY se.scheduled_time;
$$;

REVOKE ALL ON FUNCTION public.care_alert_missed_doses(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.care_alert_missed_doses(uuid, timestamptz, timestamptz) TO service_role;
