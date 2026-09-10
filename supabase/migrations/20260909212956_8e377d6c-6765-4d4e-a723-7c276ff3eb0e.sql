DROP POLICY IF EXISTS "Patients read their own medications" ON public.medications;
CREATE POLICY "Patients read their own medications"
  ON public.medications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON POLICY "Patients read their own medications" ON public.medications IS
  'Standalone, deliberately. This used to live as an OR branch inside the clinician sharing policy, and rewriting that policy for an unrelated reason deleted it.';