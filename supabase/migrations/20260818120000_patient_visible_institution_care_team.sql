-- A patient can see which clinicians their hospital has given access to.
--
-- Found in platform review. Care Circle lists the doctors a patient invited
-- directly, and the hospitals they connected to — but not the clinicians the
-- hospital then assigned to them. Those assignments live in
-- practice_patient_assignments, which only practice members can read, so the
-- patient had no way to learn who at the hospital was actually looking at their
-- record.
--
-- That is a gap in the consent model rather than a gap in the interface. The
-- product's first principle is that the patient knows and controls who sees
-- their record; institution sharing works by the hospital delegating access to
-- individual clinicians, and the delegation was invisible to the person whose
-- record it concerns.
--
-- This is the mirror image of get_patient_identity, which lets a clinician
-- resolve the patients they may see. Same shape, same constraints, opposite
-- direction: a patient resolving the clinicians who may see them.

CREATE OR REPLACE FUNCTION public.my_institution_care_team()
RETURNS TABLE (
  practice_id        uuid,
  practice_name      text,
  practice_slug      text,
  clinician_user_id  uuid,
  clinician_name     text,
  specialty          text,
  assignment_role    text,
  assigned_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pr.id,
    pr.name,
    pr.slug,
    a.clinician_user_id,
    NULLIF(TRIM(
      COALESCE(cp.title, '') || ' ' ||
      COALESCE(cp.first_name, '') || ' ' ||
      COALESCE(cp.last_name, '')
    ), '') AS clinician_name,
    cp.specialty,
    a.assignment_role,
    a.effective_from
  FROM public.practice_patient_assignments a
  JOIN public.practices pr ON pr.id = a.practice_id
  LEFT JOIN public.clinician_profiles cp ON cp.user_id = a.clinician_user_id
  WHERE auth.uid() IS NOT NULL
    -- Only ever the caller's own care team.
    AND a.patient_user_id = auth.uid()
    -- Only while the assignment is in effect.
    AND (a.effective_to IS NULL OR a.effective_to > now())
    -- And only while the patient is actually sharing with that hospital, so
    -- ending a connection also ends what this reports.
    AND EXISTS (
      SELECT 1 FROM public.practice_shares ps
      WHERE ps.practice_id = a.practice_id
        AND ps.user_id = auth.uid()
        AND ps.is_active = true
    )
  ORDER BY pr.name, clinician_name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.my_institution_care_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_institution_care_team() TO authenticated;

COMMENT ON FUNCTION public.my_institution_care_team() IS
  'The clinicians a patient''s connected hospitals have assigned to them. Scoped to auth.uid() as the '
  'patient; returns nothing once the hospital connection ends. Without it a patient could see which '
  'hospitals hold their record but not which of their staff had been given access to it.';
