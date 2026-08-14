-- OPTION A for the hospital panel-scope conflict — see the findings doc.
--
-- The conflict: practice_members.can_view_all_patients defaults to true (from
-- the original single-practice model, Jan 2026), and
-- institution_has_patient_access() treats it as a full bypass. So every
-- clinician at a hospital tenant can read every institution-shared patient
-- without any assignment, which is not how the sharing model describes the
-- institution pathway ("the clinician's access derives from their assignment").
--
-- Option A leaves the column and its default alone and narrows what it means
-- inside a hospital tenant: a practice-wide view right is an administrative
-- capability, so it only applies to people who can manage the tenant. Everyone
-- else needs an assignment.
--
-- Deliberately scoped to tenant_type = 'hospital' so practice tenants — Solo
-- and Pro — behave exactly as they do today.
--
-- Trade-off vs Option B: no data migration, and a hospital cannot re-widen
-- access by flipping the flag on a clinician. If a hospital genuinely wants a
-- ward-wide or on-call view, that becomes a new capability rather than this one.

CREATE OR REPLACE FUNCTION public.institution_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practices p ON p.id = ps.practice_id
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        (
          pm.can_view_all_patients = true
          AND (
            COALESCE(p.tenant_type, 'practice') <> 'hospital'
            OR pm.role IN ('owner', 'admin')
          )
        )
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.institution_has_patient_permission(
  patient_user_id uuid,
  permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practices p ON p.id = ps.practice_id
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        (
          pm.can_view_all_patients = true
          AND (
            COALESCE(p.tenant_type, 'practice') <> 'hospital'
            OR pm.role IN ('owner', 'admin')
          )
        )
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
      AND (
        ps.share_all = true
        OR COALESCE((ps.permissions->>permission_key)::boolean, false) = true
      )
  ) END;
$$;
