-- The person who filed a patient record keeps it, and every edit to a record
-- says who made it.
--
-- The author's read path.
--
-- 20261009080000 made the author of a clinician_patient_records row read it,
-- once the patient had claimed it, only on a live relationship with that
-- patient. When the patient revoked, the author lost the record they had
-- written. For front desk in particular that left nothing but the access log
-- to show what they had filed, and a record that disappears from the person
-- who made it is no use to them in a dispute. The product decision is that the
-- author keeps it: the hospital retains the record when the patient
-- disconnects, and so does the person who filed it. This matches the consent
-- model's private-share rule (docs/sharing-access-consent-model.md, 2A), where
-- a clinician keeps read-only access to the historical record they took part
-- in.
--
-- "Clinicians can view their own patient records" therefore goes back to
-- asking only whether the caller wrote the row. What that does not open:
--
--   * Editing. Both update policies still require linked_user_id IS NULL, and
--     the delete policy does too, so a claimed record is read-only to its
--     author whether or not the patient's share is live.
--   * Anything else of the patient's. The row holds what the author filed;
--     vitals, documents, the profile and the rest are still read through live
--     shares only. No policy or function elsewhere treats the existence of a
--     record row as access to the patient.
--   * A declined record carries the patient's linked_user_id and now shows in
--     its author's list again, as it did before 20261009080000. It is still
--     what they filed, and it still cannot be edited or re-sent.
--
-- Everyone else is unchanged. A colleague, and the practice's owners and
-- admins, read a claimed record on "Practice staff read records their practice
-- created", which asks may_read_practice_patient_record(): a live,
-- unsuspended share with the practice. Owners and admins were considered and
-- deliberately not given the author's exception. The consent model has no
-- break-glass (1.4) and ends an institution's forward access at disconnection
-- (3); the author's exception rests on their having made the record, which an
-- owner or admin did not. The practice still retains the row itself, since
-- nobody can delete a claimed record, and its author can produce it.
--
-- Who edited it.
--
-- Since 20261009080000 a clinical colleague may edit an unclaimed practice
-- record, and the row said only who filed it. The audit trigger
-- (log_record_change, trg_audit_managed_record) already writes a
-- hipaa_audit_logs row naming auth.uid() and the time for every signed-in
-- update, colleagues included. The row itself now says so as well: updated_by
-- is set by a BEFORE trigger from auth.uid() on every update, and cleared on
-- insert, so a caller cannot name somebody else as the editor. updated_at was
-- already stamped by update_clinician_patient_records_updated_at. A
-- server-side update (service role, no signed-in user) records no editor
-- rather than leaving the previous editor's name on a change they did not
-- make. Existing rows start with no editor recorded.

-- ---------------------------------------------------------------------------
-- The author's read path
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians can view their own patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians can view their own patient records"
  ON public.clinician_patient_records
  FOR SELECT TO authenticated
  USING (auth.uid() = clinician_user_id);

-- ---------------------------------------------------------------------------
-- Who edited it
-- ---------------------------------------------------------------------------
ALTER TABLE public.clinician_patient_records
  ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.clinician_patient_records.updated_by IS
  'Who made the last update, from auth.uid() by trigger. NULL for a record never updated or last updated server-side.';

CREATE OR REPLACE FUNCTION public.stamp_patient_record_editor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.updated_by := NULL;
  ELSE
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_patient_record_editor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clinician_patient_records_stamp_editor ON public.clinician_patient_records;
CREATE TRIGGER clinician_patient_records_stamp_editor
  BEFORE INSERT OR UPDATE ON public.clinician_patient_records
  FOR EACH ROW EXECUTE FUNCTION public.stamp_patient_record_editor();
