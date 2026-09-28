-- Staff who have left a practice, and staff who are not clinical, no longer
-- read or write encounters through a leftover patient assignment.
--
-- The encounters SELECT and INSERT policies and the encounter_addenda SELECT
-- policy each had an is_assigned_to_patient() arm. That helper asked whether an
-- open assignment row and a live practice share existed. It did not ask whether
-- the assignee was still an active member, or whether their role was clinical.
-- Two things made that a leak:
--
--   * Removing someone from the team (usePractice.removeMember) sets
--     practice_members.status = 'revoked' by direct UPDATE, and archiving
--     (usePracticeAdmin) sets 'archived' the same way. Neither ends the
--     person's assignments; only set_practice_affiliation_status() did. A
--     removed doctor kept reading and filing notes.
--   * An assignment can name a front-desk or billing member, who then read
--     clinical notes. The INSERT policy also admitted
--     practice_has_patient_access(), which is not role-gated, so any member
--     who sees every patient could file an encounter.
--
-- The policies now use institution_has_clinical_access(), the gate the rest of
-- the clinical side uses. It requires an active, clinical membership, and
-- admits either can_view_all_patients or an assignment through
-- is_assigned_to_patient_in_practice(), which itself checks the member is
-- active and the practice is live. It also covers the whole of
-- practice_has_clinical_access(), so that arm is folded in. The author arm and
-- the direct provider-share arm (clinician_has_patient_access) are unchanged.
--
-- Assignments are also end-dated when a member stops being an active clinical
-- member, whatever path made the change: an AFTER UPDATE trigger on
-- practice_members closes open assignments when status leaves 'active' or the
-- role becomes non-clinical. Rows are closed, not deleted, as
-- set_practice_affiliation_status() does, so the record of who held the
-- patient survives. Restoring a member does not reopen them; a manager
-- reassigns. The trigger runs after trg_guard_practice_member_identity, which
-- is BEFORE UPDATE and only rejects identity changes.
--
-- is_assigned_to_patient() is hardened too. After this migration no policy or
-- function calls it, but it stays in the generated client types and is
-- executable by signed-in callers, and a future policy that reached for it
-- would reopen this hole. It now answers true only for an active member in a
-- clinical role at a live practice, by delegating to
-- is_assigned_to_patient_in_practice(). Dropping it was the alternative; that
-- would break the client types for no gain in safety.

-- ----------------------------------------------------------------------------
-- 1. The policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians read encounters for their patients" ON public.encounters;
CREATE POLICY "Clinicians read encounters for their patients"
ON public.encounters FOR SELECT
USING (
  clinician_user_id = auth.uid()
  OR public.clinician_has_patient_access(patient_user_id)
  OR public.institution_has_clinical_access(patient_user_id)
);

DROP POLICY IF EXISTS "Clinicians create encounters for accessible patients" ON public.encounters;
CREATE POLICY "Clinicians create encounters for accessible patients"
ON public.encounters FOR INSERT
WITH CHECK (
  clinician_user_id = auth.uid()
  AND (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_clinical_access(patient_user_id)
  )
);

DROP POLICY IF EXISTS "Read addenda of a readable note" ON public.encounter_addenda;
CREATE POLICY "Read addenda of a readable note"
ON public.encounter_addenda FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.encounters e
    WHERE e.id = encounter_addenda.encounter_id
      AND (
        e.clinician_user_id = auth.uid()
        OR public.clinician_has_patient_access(e.patient_user_id)
        OR public.institution_has_clinical_access(e.patient_user_id)
      )
  )
);

-- ----------------------------------------------------------------------------
-- 2. The helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_assigned_to_patient(_user_id uuid, _patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.user_id = _user_id
      AND pm.status = 'active'
      AND public.practice_role_is_clinical(pm.role)
      AND public.is_assigned_to_patient_in_practice(_user_id, _patient_user_id, pm.practice_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Leaving the clinical team ends assignments
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_assignments_of_departed_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active'
     OR NOT public.practice_role_is_clinical(NEW.role) THEN
    UPDATE public.practice_patient_assignments
       SET effective_to = now()
     WHERE practice_id = NEW.practice_id
       AND clinician_user_id = NEW.user_id
       AND (effective_to IS NULL OR effective_to > now());
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.end_assignments_of_departed_member() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_end_assignments_of_departed_member ON public.practice_members;
CREATE TRIGGER trg_end_assignments_of_departed_member
AFTER UPDATE OF status, role ON public.practice_members
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status OR NEW.role IS DISTINCT FROM OLD.role)
EXECUTE FUNCTION public.end_assignments_of_departed_member();
