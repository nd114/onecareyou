-- The record is not the patient's to rewrite.
--
-- Found in the final audit by reading every UPDATE/DELETE policy on the two
-- tables provenance was added to this branch, then testing each one directly
-- against RLS rather than trusting the client.
--
-- `isVitalEditable()` and `isMedicationEditable()` have existed since the
-- provenance work, and this session taught every screen to honour them: a
-- clinician-recorded vital shows a badge instead of Edit/Delete, an
-- EHR-sourced medication shows "Managed by City General EHR — ask them to
-- change it". All of that is UI. Tested directly against Postgres, signed in
-- as the patient:
--
--   UPDATE public.vitals SET value = 90 WHERE id = <the clinician's reading>;
--   -- 1 row changed.
--   DELETE FROM public.vitals WHERE id = <the clinician's reading>;
--   -- 1 row removed.
--   UPDATE public.medications SET dosage = '50 mg' WHERE id = <the EHR row>;
--   -- 1 row changed.
--
-- `vitals` had no source check in either policy — clinicians only ever INSERT
-- for a patient, never UPDATE or DELETE, so there is no legitimate write this
-- narrows. `medications` DELETE already carries the guard (see
-- 20260926100000); UPDATE never did, which is the gap `guardImported()`'s own
-- comment names without knowing it: "the same rule vitals have had all
-- along" — a rule neither table's database ever enforced.
--
-- The proposal-acceptance and stop_medication paths are unaffected: both run
-- through SECURITY DEFINER functions (apply_medication_proposal,
-- stop_medication) that do not query through this policy.

DROP POLICY IF EXISTS "Users can update their own vitals" ON public.vitals;
CREATE POLICY "Patients edit only the vitals they recorded themselves"
  ON public.vitals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (source IS NULL OR source = 'manual'))
  WITH CHECK (auth.uid() = user_id AND (source IS NULL OR source = 'manual'));

DROP POLICY IF EXISTS "Users can delete their own vitals" ON public.vitals;
CREATE POLICY "Patients delete only the vitals they recorded themselves"
  ON public.vitals FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND (source IS NULL OR source = 'manual'));

COMMENT ON POLICY "Patients edit only the vitals they recorded themselves" ON public.vitals IS
  'A reading someone else recorded is their record of what they measured. '
  'Mirrors the medications rule and isVitalEditable() in useVitals.ts.';
COMMENT ON POLICY "Patients delete only the vitals they recorded themselves" ON public.vitals IS
  'Same rule as the UPDATE policy beside it. A patient can still delete their '
  'own manual entries freely — this is not the medications history guard.';

DROP POLICY IF EXISTS "Users can update their own medications" ON public.medications;
CREATE POLICY "Patients edit only medications they entered themselves"
  ON public.medications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (source IS NULL OR source = 'manual'))
  WITH CHECK (auth.uid() = user_id AND (source IS NULL OR source = 'manual'));

COMMENT ON POLICY "Patients edit only medications they entered themselves" ON public.medications IS
  'The UPDATE half of the rule the DELETE policy beside it already states. '
  'Silently changing a prescribed dose in the local record is the specific '
  'harm this branch''s proposal/accept model exists to prevent — the gap was '
  'that a raw UPDATE never went through it.';
