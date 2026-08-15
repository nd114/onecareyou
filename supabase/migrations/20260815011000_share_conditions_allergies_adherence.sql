-- The hospital share picker offers five categories — vitals, medications,
-- documents, conditions, allergies — but only the first three had a read path.
-- A patient could consent to sharing their conditions and allergies and the
-- hospital would never see them. Adherence had the same problem from the other
-- direction: schedule data has no institution path at all, so a clinician
-- looking at a hospital-assigned patient sees no adherence history.
--
-- Allergies in particular are not a nice-to-have. A clinician treating someone
-- must be able to see what they react to.

-- ---------------------------------------------------------------------------
-- 1. Adherence follows the medications consent
-- ---------------------------------------------------------------------------
-- schedule_entries is the dose-by-dose record behind the adherence view. It is
-- medication data, so it rides on the 'medications' category the patient
-- already chose rather than introducing a sixth one they never saw.

DROP POLICY IF EXISTS "Institution team can view shared schedules" ON public.schedule_entries;
CREATE POLICY "Institution team can view shared schedules"
ON public.schedule_entries FOR SELECT TO authenticated
USING (public.institution_has_patient_permission(user_id, 'medications'));

-- ---------------------------------------------------------------------------
-- 2. Conditions and allergies, without handing over the whole profile
-- ---------------------------------------------------------------------------
-- profiles holds far more than these two fields — contact details, next of kin,
-- subscription state. Rather than granting institution staff a SELECT on the
-- row, this returns exactly the two consented fields, each gated separately, so
-- a patient who shares allergies but not conditions gets precisely that.
--
-- The private pathway keeps its existing behaviour: a clinician holding the
-- 'profile' permission already reads these off the profile row.

CREATE OR REPLACE FUNCTION public.get_patient_clinical_profile(patient_ids uuid[])
RETURNS TABLE(
  user_id uuid,
  health_conditions jsonb,
  allergies jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    CASE
      WHEN p.user_id = auth.uid()
        OR public.clinician_has_patient_permission(p.user_id, 'profile')
        OR public.institution_has_patient_permission(p.user_id, 'conditions')
      THEN p.health_conditions
      ELSE NULL
    END,
    CASE
      WHEN p.user_id = auth.uid()
        OR public.clinician_has_patient_permission(p.user_id, 'profile')
        OR public.institution_has_patient_permission(p.user_id, 'allergies')
      THEN p.allergies
      ELSE NULL
    END
  FROM public.profiles p
  WHERE p.user_id = ANY(patient_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.user_id = auth.uid()
      OR public.clinician_has_patient_access(p.user_id)
      OR public.institution_has_patient_access(p.user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.get_patient_clinical_profile(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_clinical_profile(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_patient_clinical_profile(uuid[]) IS
  'Returns only the consented clinical fields from a patient profile. Each field is gated on its '
  'own category, so sharing allergies does not disclose conditions. blood_type is deliberately not '
  'returned: the hospital share picker has no category covering it, so no patient has consented to '
  'it. Add a category first if it is needed clinically.';
