-- 1. Creators can read their own practice.
-- Practice creation failed because the row returned right after insert was
-- checked against SELECT policies that depend on a practice_members row the
-- AFTER INSERT trigger creates in the same statement (not yet visible), so
-- the insert surfaced as an RLS violation.
CREATE POLICY "Practice creators can view their practice"
  ON public.practices FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- Keep the insert policy scoped to authenticated users only.
DROP POLICY IF EXISTS "Users can create practices" ON public.practices;
CREATE POLICY "Users can create practices"
  ON public.practices FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 2. Alert rules become archivable (soft delete) and nameable.
ALTER TABLE public.clinician_alert_rules
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS label TEXT;