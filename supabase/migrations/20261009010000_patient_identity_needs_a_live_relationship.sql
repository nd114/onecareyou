-- get_patient_identity returns a person's name, email and phone. It now does
-- that only for someone the caller has a live, consented relationship with.
--
-- Three of its arms were weaker than the access gates everything else uses:
--
--   * The clinician_patient_records arm trusted linked_user_id, which the
--     caller could write. The INSERT policy checked only clinician_user_id, so
--     any signed-in account could file a "record" pointing at any uuid and
--     resolve it. The addressee's UPDATE policy had no WITH CHECK, so they
--     could link a record to a third person. And declining a record also sets
--     linked_user_id — so the clinician a patient said no to got the patient's
--     contact details regardless. Accepting a record creates a provider share
--     (ClinicianDataConsentDialog), which the share arm already covers, so the
--     record arm is dropped rather than repaired.
--   * The clinician share arm ignored expires_at. It now asks
--     clinician_has_patient_access(), which is the gate the rest of the
--     clinician side uses.
--
-- The practice-manager arm stays. It reaches revoked shares on purpose, as
-- practice_patient_overview and practice_audit_log do (20261008000000): a
-- hospital keeps the name of someone it treated. It was only unsafe while a
-- practice_shares row could be forged, which 20261009000000 ended.

CREATE OR REPLACE FUNCTION public.get_patient_identity(patient_ids uuid[])
RETURNS TABLE(user_id uuid, name text, email text, phone_number text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.name, p.email, p.phone_number
  FROM public.profiles p
  WHERE p.user_id = ANY(patient_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.user_id = auth.uid()
      OR public.clinician_has_patient_access(p.user_id)
      OR public.institution_has_patient_access(p.user_id)
      OR EXISTS (
        SELECT 1 FROM public.practice_shares ps
        WHERE ps.user_id = p.user_id
          AND public.can_manage_practice(ps.practice_id)
      )
    )
$$;

-- linked_user_id is set by the person it names, and by nobody else.
DROP POLICY IF EXISTS "Clinicians can insert their own patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians can insert their own patient records"
  ON public.clinician_patient_records
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = clinician_user_id AND linked_user_id IS NULL);

DROP POLICY IF EXISTS "Practice staff create records for their practice" ON public.clinician_patient_records;
CREATE POLICY "Practice staff create records for their practice"
  ON public.clinician_patient_records
  FOR INSERT TO authenticated
  WITH CHECK (
    practice_id IS NOT NULL
    AND clinician_user_id = auth.uid()
    AND linked_user_id IS NULL
    AND public.may_manage_practice_patient_records(practice_id)
  );

DROP POLICY IF EXISTS "Clinicians update their own unclaimed patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians update their own unclaimed patient records"
  ON public.clinician_patient_records
  FOR UPDATE TO authenticated
  USING (auth.uid() = clinician_user_id AND linked_user_id IS NULL)
  WITH CHECK (auth.uid() = clinician_user_id AND linked_user_id IS NULL);

DROP POLICY IF EXISTS "Patients can accept or decline pending records" ON public.clinician_patient_records;
CREATE POLICY "Patients can accept or decline pending records"
  ON public.clinician_patient_records
  FOR UPDATE TO authenticated
  USING (patient_email IS NOT NULL AND lower(patient_email) = public.confirmed_email())
  WITH CHECK (
    patient_email IS NOT NULL
    AND lower(patient_email) = public.confirmed_email()
    AND (linked_user_id IS NULL OR linked_user_id = auth.uid())
  );
