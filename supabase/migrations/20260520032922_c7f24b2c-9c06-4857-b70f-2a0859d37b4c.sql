
-- QHIN imports table
CREATE TABLE public.qhin_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  particle_query_id text,
  status text NOT NULL DEFAULT 'pending',
  scope text,
  consent_reference uuid,
  disclosure_version text,
  match_count integer DEFAULT 0,
  record_count integer DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_qhin_imports_user ON public.qhin_imports(user_id);
CREATE INDEX idx_qhin_imports_status ON public.qhin_imports(status);

ALTER TABLE public.qhin_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients view own imports"
  ON public.qhin_imports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Patients create own imports"
  ON public.qhin_imports FOR INSERT
  WITH CHECK (auth.uid() = requested_by AND auth.uid() = user_id);

CREATE POLICY "Clinicians view shared patient imports"
  ON public.qhin_imports FOR SELECT
  USING (public.clinician_has_patient_access(user_id));

CREATE POLICY "Clinicians create imports for shared patients"
  ON public.qhin_imports FOR INSERT
  WITH CHECK (auth.uid() = requested_by AND public.clinician_has_patient_access(user_id));

-- QHIN record provenance
CREATE TABLE public.qhin_record_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.qhin_imports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  source_organization text,
  source_system_oid text,
  source_resource_id text,
  fhir_resource_type text,
  last_updated_at_source timestamptz,
  confidence numeric,
  raw_fhir jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qhin_prov_user ON public.qhin_record_provenance(user_id);
CREATE INDEX idx_qhin_prov_target ON public.qhin_record_provenance(target_table, target_id);
CREATE INDEX idx_qhin_prov_import ON public.qhin_record_provenance(import_id);

ALTER TABLE public.qhin_record_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients view own provenance"
  ON public.qhin_record_provenance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Clinicians view shared patient provenance"
  ON public.qhin_record_provenance FOR SELECT
  USING (public.clinician_has_patient_access(user_id));

-- TEFCA consent on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qhin_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS qhin_disclosure_version text;

-- updated_at trigger pattern not needed (immutable rows for provenance)
