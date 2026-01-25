-- Add source tracking to vitals table
ALTER TABLE public.vitals 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS ehr_connection_id UUID REFERENCES public.ehr_connections(id);

-- Add index for source filtering
CREATE INDEX IF NOT EXISTS idx_vitals_source ON public.vitals(source);
CREATE INDEX IF NOT EXISTS idx_vitals_external_id ON public.vitals(external_id);

-- Create export queue table for pending EHR exports
CREATE TABLE IF NOT EXISTS public.ehr_export_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vital_id UUID NOT NULL REFERENCES public.vitals(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.ehr_connections(id) ON DELETE CASCADE,
  patient_fhir_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  exported_at TIMESTAMPTZ,
  fhir_resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vital_id, connection_id)
);

-- Enable RLS
ALTER TABLE public.ehr_export_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for export queue (clinicians can view their connection exports)
CREATE POLICY "Clinicians can view their export queue"
  ON public.ehr_export_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ehr_connections ec
      WHERE ec.id = connection_id
      AND ec.clinician_user_id = auth.uid()
    )
  );

-- Add index for queue processing
CREATE INDEX IF NOT EXISTS idx_ehr_export_queue_status ON public.ehr_export_queue(status);
CREATE INDEX IF NOT EXISTS idx_ehr_export_queue_connection ON public.ehr_export_queue(connection_id);

-- Comment for clarity
COMMENT ON COLUMN public.vitals.source IS 'Origin of the vital: manual (patient-entered), ehr_import (from EHR), device (from connected device)';
COMMENT ON COLUMN public.vitals.external_id IS 'External ID from source system (e.g., FHIR Observation ID)';
COMMENT ON TABLE public.ehr_export_queue IS 'Queue for pending vital exports to EHR systems';