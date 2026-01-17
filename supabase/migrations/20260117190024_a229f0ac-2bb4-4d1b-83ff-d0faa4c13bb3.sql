-- Fix warn-level security items: consent_logs RLS + medication-photos bucket privacy + restrict SECURITY DEFINER function execution

-- 1) consent_logs: enable RLS and restrict access to owning user
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: user can only read their own consent logs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='consent_logs' AND policyname='Users can view their own consent logs'
  ) THEN
    CREATE POLICY "Users can view their own consent logs"
    ON public.consent_logs
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;

  -- INSERT: user can only write consent logs for themselves
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='consent_logs' AND policyname='Users can insert their own consent logs'
  ) THEN
    CREATE POLICY "Users can insert their own consent logs"
    ON public.consent_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 2) Storage: make medication-photos bucket private (prevents unauthenticated URL access)
UPDATE storage.buckets
SET public = false
WHERE id = 'medication-photos';

-- 3) Restrict SECURITY DEFINER function execution surface
-- Remove default PUBLIC execute; explicitly allow authenticated (needed for policies that call these).
REVOKE EXECUTE ON FUNCTION public.get_current_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_email() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.clinician_has_patient_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinician_has_patient_access(uuid) TO authenticated;
