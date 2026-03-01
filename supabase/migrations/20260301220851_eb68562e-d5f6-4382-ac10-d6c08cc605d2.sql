
-- Create clinician_patient_records table
CREATE TABLE public.clinician_patient_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinician_user_id uuid NOT NULL,
  practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  
  -- Patient identity
  patient_name text NOT NULL,
  patient_email text,
  patient_phone text,
  date_of_birth date,
  gender text,
  
  -- Clinical data
  allergies jsonb DEFAULT '[]'::jsonb,
  health_conditions jsonb DEFAULT '[]'::jsonb,
  blood_type text,
  medications jsonb DEFAULT '[]'::jsonb,
  vitals_history jsonb DEFAULT '[]'::jsonb,
  notes text,
  tags jsonb DEFAULT '[]'::jsonb,
  
  -- Linking
  linked_user_id uuid,
  provider_share_id uuid REFERENCES public.provider_shares(id) ON DELETE SET NULL,
  invitation_status text NOT NULL DEFAULT 'not_invited',
  data_sharing_model text NOT NULL DEFAULT 'clinician_managed',
  
  -- Consent
  clinician_data_consent_given_at timestamptz,
  patient_data_consent_given_at timestamptz,
  import_source text NOT NULL DEFAULT 'manual',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create data_sharing_agreements table
CREATE TABLE public.data_sharing_agreements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinician_user_id uuid NOT NULL,
  patient_user_id uuid,
  clinician_record_id uuid REFERENCES public.clinician_patient_records(id) ON DELETE CASCADE,
  sharing_model text NOT NULL DEFAULT 'clinician_managed',
  agreed_at timestamptz NOT NULL DEFAULT now(),
  agreed_by text NOT NULL DEFAULT 'clinician',
  terms_version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  revoked_by text,
  permissions jsonb NOT NULL DEFAULT '{"vitals_read": true, "vitals_write": false, "meds_read": true, "meds_write": false, "profile_read": true, "profile_write": false, "notes_read": false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_clinician_patient_records_clinician ON public.clinician_patient_records(clinician_user_id);
CREATE INDEX idx_clinician_patient_records_linked_user ON public.clinician_patient_records(linked_user_id) WHERE linked_user_id IS NOT NULL;
CREATE INDEX idx_clinician_patient_records_email ON public.clinician_patient_records(patient_email) WHERE patient_email IS NOT NULL;
CREATE INDEX idx_clinician_patient_records_practice ON public.clinician_patient_records(practice_id) WHERE practice_id IS NOT NULL;
CREATE INDEX idx_clinician_patient_records_invitation ON public.clinician_patient_records(invitation_status);
CREATE INDEX idx_data_sharing_agreements_clinician ON public.data_sharing_agreements(clinician_user_id);
CREATE INDEX idx_data_sharing_agreements_patient ON public.data_sharing_agreements(patient_user_id) WHERE patient_user_id IS NOT NULL;
CREATE INDEX idx_data_sharing_agreements_record ON public.data_sharing_agreements(clinician_record_id);

-- Updated_at trigger for clinician_patient_records
CREATE TRIGGER update_clinician_patient_records_updated_at
  BEFORE UPDATE ON public.clinician_patient_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.clinician_patient_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sharing_agreements ENABLE ROW LEVEL SECURITY;

-- RLS for clinician_patient_records: clinicians see only their own records
CREATE POLICY "Clinicians can view their own patient records"
  ON public.clinician_patient_records FOR SELECT
  TO authenticated
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can insert their own patient records"
  ON public.clinician_patient_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can update their own patient records"
  ON public.clinician_patient_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can delete their own patient records"
  ON public.clinician_patient_records FOR DELETE
  TO authenticated
  USING (auth.uid() = clinician_user_id);

-- Patients can view records linked to them
CREATE POLICY "Patients can view records linked to them"
  ON public.clinician_patient_records FOR SELECT
  TO authenticated
  USING (auth.uid() = linked_user_id);

-- RLS for data_sharing_agreements
CREATE POLICY "Clinicians can view their agreements"
  ON public.data_sharing_agreements FOR SELECT
  TO authenticated
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Patients can view their agreements"
  ON public.data_sharing_agreements FOR SELECT
  TO authenticated
  USING (auth.uid() = patient_user_id);

CREATE POLICY "Clinicians can create agreements"
  ON public.data_sharing_agreements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can update their agreements"
  ON public.data_sharing_agreements FOR UPDATE
  TO authenticated
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Patients can update agreements for them"
  ON public.data_sharing_agreements FOR UPDATE
  TO authenticated
  USING (auth.uid() = patient_user_id);
