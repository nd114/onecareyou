
-- 1. Create document_shares junction table
CREATE TABLE public.document_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.health_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  provider_share_id UUID NOT NULL REFERENCES public.provider_shares(id) ON DELETE CASCADE,
  shared_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(document_id, provider_share_id)
);

-- Enable RLS
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

-- Patient policies (owner)
CREATE POLICY "Patients can view their own document shares"
  ON public.document_shares FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Patients can create document shares"
  ON public.document_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Patients can update their own document shares"
  ON public.document_shares FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Patients can delete their own document shares"
  ON public.document_shares FOR DELETE
  USING (auth.uid() = user_id);

-- Clinician SELECT policy
CREATE POLICY "Clinicians can view active shares for their patients"
  ON public.document_shares FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.provider_shares ps
      WHERE ps.id = document_shares.provider_share_id
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = get_current_user_email()
        )
    )
  );

-- 2. Drop the blanket clinician document RLS and replace with per-document policy
DROP POLICY IF EXISTS "Clinicians can view shared patient documents" ON public.health_documents;

CREATE POLICY "Clinicians can view individually shared documents"
  ON public.health_documents FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.document_shares ds
      JOIN public.provider_shares ps ON ds.provider_share_id = ps.id
      WHERE ds.document_id = health_documents.id
        AND ds.is_active = true
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = get_current_user_email()
        )
    )
  );

-- Drop the old broad SELECT policy that also covered own documents (keep only the new one + the existing "Users can view their own documents")
DROP POLICY IF EXISTS "Clinicians can view individually shared documents" ON public.health_documents;
DROP POLICY IF EXISTS "Users can view their own documents" ON public.health_documents;

-- Recreate combined policy
CREATE POLICY "Users and shared clinicians can view documents"
  ON public.health_documents FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.document_shares ds
      JOIN public.provider_shares ps ON ds.provider_share_id = ps.id
      WHERE ds.document_id = health_documents.id
        AND ds.is_active = true
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = get_current_user_email()
        )
    )
  );
