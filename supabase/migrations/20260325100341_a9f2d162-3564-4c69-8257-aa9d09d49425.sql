
-- HIPAA Audit Logs table for PHI access tracking
CREATE TABLE public.hipaa_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  patient_user_id uuid,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_hipaa_audit_user ON public.hipaa_audit_logs(user_id);
CREATE INDEX idx_hipaa_audit_patient ON public.hipaa_audit_logs(patient_user_id);
CREATE INDEX idx_hipaa_audit_created ON public.hipaa_audit_logs(created_at DESC);

-- RLS: users can only insert their own logs, admins/clinicians can read
ALTER TABLE public.hipaa_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own audit logs"
ON public.hipaa_audit_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own audit logs"
ON public.hipaa_audit_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Add branding columns to practices table
ALTER TABLE public.practices ADD COLUMN IF NOT EXISTS brand_accent_color text;
ALTER TABLE public.practices ADD COLUMN IF NOT EXISTS brand_logo_url text;
