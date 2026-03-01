-- Fix 1: Allow patients to see pending clinician_patient_records matching their email
-- (needed for the consent flow before linked_user_id is set)
CREATE POLICY "Patients can view pending records by email"
  ON public.clinician_patient_records FOR SELECT
  TO authenticated
  USING (
    patient_email IS NOT NULL 
    AND patient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND linked_user_id IS NULL
  );

-- Fix 2: Allow patients to update clinician_patient_records to accept/decline
-- (the consent dialog sets linked_user_id, invitation_status, data_sharing_model)
CREATE POLICY "Patients can accept or decline pending records"
  ON public.clinician_patient_records FOR UPDATE
  TO authenticated
  USING (
    patient_email IS NOT NULL
    AND patient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Fix 3: Allow patients to insert data_sharing_agreements
-- (created when patient accepts a clinician connection)
CREATE POLICY "Patients can create agreements for themselves"
  ON public.data_sharing_agreements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = patient_user_id);