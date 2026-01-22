-- Sprint 1: Patient Invitations System
CREATE TABLE patient_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_user_id UUID NOT NULL,
  patient_email TEXT NOT NULL,
  patient_name TEXT,
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  provider_share_id UUID REFERENCES provider_shares(id) ON DELETE SET NULL
);

-- Add index for faster lookups
CREATE INDEX idx_patient_invitations_clinician ON patient_invitations(clinician_user_id);
CREATE INDEX idx_patient_invitations_email ON patient_invitations(patient_email);
CREATE INDEX idx_patient_invitations_code ON patient_invitations(invite_code);

-- Enable RLS
ALTER TABLE patient_invitations ENABLE ROW LEVEL SECURITY;

-- Clinicians can create invitations
CREATE POLICY "Clinicians can create invitations"
  ON patient_invitations FOR INSERT
  WITH CHECK (
    auth.uid() = clinician_user_id AND
    EXISTS (SELECT 1 FROM clinician_profiles WHERE user_id = auth.uid())
  );

-- Clinicians can view their own invitations
CREATE POLICY "Clinicians can view their invitations"
  ON patient_invitations FOR SELECT
  USING (auth.uid() = clinician_user_id);

-- Clinicians can update their own invitations
CREATE POLICY "Clinicians can update their invitations"
  ON patient_invitations FOR UPDATE
  USING (auth.uid() = clinician_user_id);

-- Patients can view invitations sent to their email
CREATE POLICY "Patients can view invitations by email"
  ON patient_invitations FOR SELECT
  USING (
    patient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Patients can update invitations (accept/decline)
CREATE POLICY "Patients can accept or decline invitations"
  ON patient_invitations FOR UPDATE
  USING (
    patient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Sprint 1: Access Audit Logs
CREATE TABLE access_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  target_user_id UUID,
  share_id UUID REFERENCES provider_shares(id) ON DELETE SET NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_access_audit_actor ON access_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_access_audit_target ON access_audit_logs(target_user_id, created_at DESC);
CREATE INDEX idx_access_audit_share ON access_audit_logs(share_id, created_at DESC);

-- Enable RLS
ALTER TABLE access_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view audit logs where they are the actor or target
CREATE POLICY "Users can view their own audit logs"
  ON access_audit_logs FOR SELECT
  USING (auth.uid() = actor_user_id OR auth.uid() = target_user_id);

-- System can insert audit logs (via service role or the actor themselves)
CREATE POLICY "Users can create audit logs for their actions"
  ON access_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = actor_user_id);

-- Sprint 3: EHR Connections Infrastructure
CREATE TABLE ehr_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_user_id UUID NOT NULL,
  provider_type TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  fhir_base_url TEXT,
  credentials_encrypted TEXT,
  patient_id_mapping JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  error_message TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index
CREATE INDEX idx_ehr_connections_clinician ON ehr_connections(clinician_user_id);

-- Enable RLS
ALTER TABLE ehr_connections ENABLE ROW LEVEL SECURITY;

-- Clinicians can manage their own EHR connections
CREATE POLICY "Clinicians can create EHR connections"
  ON ehr_connections FOR INSERT
  WITH CHECK (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can view their EHR connections"
  ON ehr_connections FOR SELECT
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can update their EHR connections"
  ON ehr_connections FOR UPDATE
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can delete their EHR connections"
  ON ehr_connections FOR DELETE
  USING (auth.uid() = clinician_user_id);

-- EHR Sync Logs
CREATE TABLE ehr_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES ehr_connections(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index
CREATE INDEX idx_ehr_sync_logs_connection ON ehr_sync_logs(connection_id, created_at DESC);

-- Enable RLS
ALTER TABLE ehr_sync_logs ENABLE ROW LEVEL SECURITY;

-- Clinicians can view sync logs for their connections
CREATE POLICY "Clinicians can view their sync logs"
  ON ehr_sync_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ehr_connections 
      WHERE ehr_connections.id = ehr_sync_logs.connection_id 
      AND ehr_connections.clinician_user_id = auth.uid()
    )
  );

-- System can insert sync logs
CREATE POLICY "System can create sync logs"
  ON ehr_sync_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ehr_connections 
      WHERE ehr_connections.id = ehr_sync_logs.connection_id 
      AND ehr_connections.clinician_user_id = auth.uid()
    )
  );

-- Add country column to profiles if not exists (for emergency numbers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE profiles ADD COLUMN country_code TEXT DEFAULT NULL;
  END IF;
END $$;

-- Add trigger for updated_at on ehr_connections
CREATE TRIGGER update_ehr_connections_updated_at
  BEFORE UPDATE ON ehr_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();