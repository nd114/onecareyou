-- Follow-ups from the database access review: three small holes closed and one
-- table checked and left as it is.
--
-- Patient document search lists only the caller's own documents.
--
-- search_documents is SECURITY INVOKER and had no owner filter, on the theory
-- that the caller's RLS decides which rows exist to be matched. RLS on
-- health_documents admits more than the caller's own vault: a document
-- another person shared through a provider share addressed to the caller's
-- confirmed email, and, for clinicians, documents of patients who shared with
-- them. The only caller is the patient-side global search (useGlobalSearch),
-- which sends every hit to the caller's own Health Vault, so a patient typing
-- a word saw the titles of somebody else's documents in a list that claimed to
-- be theirs. The function now filters to d.user_id = auth.uid(). Clinician
-- document search is switched off in the client and would need a patient
-- reference in the result before it could be turned on; it will get its own
-- function then, not this one widened.
--
-- An alert rule stays about the patient and clinician it was written for.
--
-- "Clinicians can update their alert rules" had USING (auth.uid() =
-- clinician_user_id) and no WITH CHECK, so Postgres checked the new row
-- against USING alone. clinician_user_id could not move, but patient_user_id
-- could be rewritten to anybody, skipping the live-share check the INSERT
-- policy makes. The policy now has a WITH CHECK that mirrors USING and asks
-- the same question INSERT asks, clinician_has_patient_access(patient_user_id),
-- for any rule that is still active. A rule whose share has ended may still be
-- switched off or archived (is_active = false), which is what a clinician
-- tidying up after a revoked share needs to do; it cannot be kept firing. A
-- BEFORE UPDATE trigger also refuses any change to patient_user_id or
-- clinician_user_id by a signed-in caller, the way guard_practice_share_terms
-- does for practice_shares: a rule about another patient is a new rule, made
-- through INSERT. Writing the same values back, as the bulk "replace" path in
-- useAlertRules does, is not a change. Server-side callers are not policed.
--
-- The solo patient-record policy files no record into a practice.
--
-- "Clinicians can insert their own patient records" checked the author and
-- that the record was unclaimed, and nothing about practice_id. Any signed-in
-- account could file a record into any practice, and it then appeared in that
-- practice's records to its clinical staff. Records for a practice are filed
-- through "Practice staff create records for their practice", which asks
-- may_manage_practice_patient_records(). The solo policy now requires
-- practice_id IS NULL. The client's only direct insert (AddManagedPatientDialog
-- through useClinicianPatientRecords.addRecord) already sends practice_id null;
-- bulk import writes through import-patient-records with the service role
-- after its own practice check. Changing practice_id afterwards was already
-- refused by pin_patient_record_owner().
--
-- ehr_connections: checked, no change.
--
-- All four policies (select, insert, update, delete) are auth.uid() =
-- clinician_user_id. The UPDATE policy has no WITH CHECK, so the new row must
-- satisfy the same condition and a connection cannot be handed to someone
-- else. anon holds no privileges on the table. The credential columns are
-- readable only by the owning clinician, and guard_ehr_credential_columns()
-- keeps a direct UPDATE from changing them outside the credential-writing
-- function. patient_id_mapping is the clinician's own; the edge functions that
-- act on it check the patient's share per patient (_shared/share-access.ts).

-- ---------------------------------------------------------------------------
-- 1. search_documents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_documents(query text, max_results int DEFAULT 25)
RETURNS TABLE (id uuid, title text, file_name text, category text, score real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (SELECT public.search_normalise(query) AS text)
  SELECT d.id, d.title, d.file_name, d.category,
         similarity(public.search_normalise(coalesce(d.title, d.file_name)), q.text) AS score
  FROM public.health_documents d, q
  WHERE q.text <> ''
    AND d.user_id = auth.uid()
    AND d.archived_at IS NULL
    AND (
      public.search_normalise(coalesce(d.title, d.file_name)) % q.text
      OR public.search_normalise(coalesce(d.title, d.file_name)) LIKE '%' || q.text || '%'
      OR public.search_normalise(coalesce(d.notes, '')) LIKE '%' || q.text || '%'
    )
  ORDER BY score DESC, coalesce(d.title, d.file_name)
  LIMIT greatest(1, least(max_results, 100));
$$;

-- ---------------------------------------------------------------------------
-- 2. clinician_alert_rules
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians can update their alert rules" ON public.clinician_alert_rules;
CREATE POLICY "Clinicians can update their alert rules"
ON public.clinician_alert_rules
FOR UPDATE
TO authenticated
USING (auth.uid() = clinician_user_id)
WITH CHECK (
  auth.uid() = clinician_user_id
  AND (is_active IS NOT TRUE OR public.clinician_has_patient_access(patient_user_id))
);

CREATE OR REPLACE FUNCTION public.guard_alert_rule_parties()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only a client's own statement is policed. Server-side callers (service
  -- role, cron, migrations) and definer functions run as another role.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.patient_user_id IS DISTINCT FROM OLD.patient_user_id
     OR NEW.clinician_user_id IS DISTINCT FROM OLD.clinician_user_id THEN
    RAISE EXCEPTION 'An alert rule stays with its patient and clinician. Create a new rule instead.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_alert_rule_parties() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_alert_rule_parties ON public.clinician_alert_rules;
CREATE TRIGGER guard_alert_rule_parties
BEFORE UPDATE ON public.clinician_alert_rules
FOR EACH ROW EXECUTE FUNCTION public.guard_alert_rule_parties();

-- ---------------------------------------------------------------------------
-- 3. clinician_patient_records
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians can insert their own patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians can insert their own patient records"
ON public.clinician_patient_records
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = clinician_user_id
  AND linked_user_id IS NULL
  AND practice_id IS NULL
);
