-- Five smaller access findings from the same audit, each closed here.
--
--   * Anyone without a session could call the clinical gates
--     institution_has_clinical_access(), institution_has_clinical_permission()
--     and practice_has_clinical_access(), and the practice RPCs
--     assign_practice_patient(), practice_delete_department() and
--     practice_set_assignment_first(). The gates answer false for a caller
--     with no session and the RPCs refuse one, so nothing leaked, but none of
--     them has any business answering an anonymous caller. EXECUTE is now
--     revoked from PUBLIC and anon. Signed-in callers keep it: RLS policies
--     evaluate the gates as the caller, and the client calls the RPCs.
--   * has_practice_capability() took a user id and answered for whoever it
--     named, so any signed-in person could learn another person's role at any
--     practice, one capability at a time. It now answers only for the caller,
--     or for a member of a practice the caller manages (owners and admins
--     already see their own staff's roles). Server-side callers without a
--     session are unaffected. The client and assign_practice_patient() only
--     ever ask about the caller.
--   * A practice admin could write an invitation offering the owner role, and
--     accept_practice_invitation() makes the invitee whatever the invitation
--     says. Only an owner may now offer ownership: a trigger refuses an
--     invitation that becomes an owner invitation, by insert or by update,
--     unless the caller owns that practice. An admin can still invite every
--     other role, and can still cancel or delete an owner's invitation.
--   * caregiver_access checked only that the caller was the granter, so
--     anyone could attach a caregiver (themselves included) to another
--     person's family member. Granting, and re-pointing a grant, now also
--     requires that the family member is the caller's own.
--   * Internal notes, care plans and care goals were writable through
--     institution_has_patient_access(), which admits front desk and other
--     non-clinical staff. They already could not read these records; now they
--     cannot write them either. The write policies use
--     institution_has_clinical_access(), the same gate the read policies use.
--     Front desk uploads into health_documents are deliberately left alone:
--     intake paperwork is their job.

-- ---------------------------------------------------------------------------
-- 1. No anonymous EXECUTE on the clinical gates and practice RPCs
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.institution_has_clinical_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.institution_has_clinical_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.practice_has_clinical_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_practice_patient(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.practice_delete_department(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.practice_set_assignment_first(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.institution_has_clinical_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.institution_has_clinical_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.practice_has_clinical_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_practice_patient(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.practice_delete_department(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.practice_set_assignment_first(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. has_practice_capability answers for the caller, or for their own staff
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_practice_capability(_user_id uuid, _capability text, _practice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role public.practice_role;
  _override boolean;
BEGIN
  -- A signed-in caller asks about themselves, or about a member of a
  -- practice they manage. Anyone else's role is not theirs to learn.
  IF auth.uid() IS NOT NULL
     AND _user_id IS DISTINCT FROM auth.uid()
     AND NOT public.can_manage_practice(_practice_id) THEN
    RETURN false;
  END IF;

  SELECT pm.role INTO _role
  FROM public.practice_members pm
  WHERE pm.user_id = _user_id
    AND pm.practice_id = _practice_id
    AND pm.status = 'active';

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  SELECT granted INTO _override
  FROM public.practice_role_permissions
  WHERE practice_id = _practice_id
    AND role = _role
    AND capability = _capability;

  IF _override IS NOT NULL THEN
    RETURN _override;
  END IF;

  RETURN CASE _capability
    WHEN 'view_phi' THEN _role IN ('owner','admin','sub_admin','provider','clinician','nurse','front_desk','read_only')
    WHEN 'edit_clinical' THEN _role IN ('owner','admin','sub_admin','provider','clinician')
    WHEN 'send_guidance' THEN _role IN ('owner','admin','sub_admin','provider','clinician','nurse')
    WHEN 'message_patients' THEN _role IN ('owner','admin','sub_admin','provider','clinician','nurse','front_desk')
    WHEN 'manage_billing' THEN _role IN ('owner','admin','billing')
    WHEN 'manage_team' THEN _role IN ('owner','admin')
    WHEN 'manage_ehr' THEN _role IN ('owner','admin')
    WHEN 'manage_settings' THEN _role IN ('owner','admin')
    WHEN 'invite_patients' THEN _role IN ('owner','admin','sub_admin','provider','clinician','front_desk')
    WHEN 'export_data' THEN _role IN ('owner','admin','sub_admin','provider','clinician')
    WHEN 'bulk_message' THEN _role IN ('owner','admin','sub_admin','provider','clinician')
    WHEN 'view_audit' THEN _role IN ('owner','admin','sub_admin')
    -- Routing patients and assigning clinicians, within scope.
    WHEN 'assign_patients' THEN _role IN ('owner','admin','sub_admin')
    ELSE false
  END;
END;
$$;

-- The two-argument form resolves the person's first practice and asks the
-- three-argument form, which applies the rule above, so a stranger's answer
-- is false whatever practice they belong to. Unchanged; restated here so the
-- pair reads together.
CREATE OR REPLACE FUNCTION public.has_practice_capability(_user_id uuid, _capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _practice_id uuid;
BEGIN
  SELECT pm.practice_id INTO _practice_id
  FROM public.practice_members pm
  WHERE pm.user_id = _user_id
    AND pm.status = 'active'
  ORDER BY pm.created_at ASC, pm.practice_id ASC
  LIMIT 1;

  IF _practice_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.has_practice_capability(_user_id, _capability, _practice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.has_practice_capability(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_practice_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_practice_capability(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_practice_capability(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Only an owner offers the owner role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_owner_invitation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'owner'
     AND auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR OLD.role IS DISTINCT FROM NEW.role
          OR OLD.practice_id IS DISTINCT FROM NEW.practice_id)
     AND NOT public.has_practice_role(NEW.practice_id, 'owner') THEN
    RAISE EXCEPTION 'Only an owner of this practice can invite another owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_owner_invitation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_owner_invitation ON public.practice_invitations;
CREATE TRIGGER trg_guard_owner_invitation
BEFORE INSERT OR UPDATE OF role, practice_id ON public.practice_invitations
FOR EACH ROW EXECUTE FUNCTION public.guard_owner_invitation();

-- ---------------------------------------------------------------------------
-- 4. Caregiver access is granted for your own family member
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can grant caregiver access for their family members" ON public.caregiver_access;
CREATE POLICY "Users can grant caregiver access for their family members"
ON public.caregiver_access
FOR INSERT
WITH CHECK (
  auth.uid() = granted_by
  AND EXISTS (
    SELECT 1 FROM public.family_members fm
     WHERE fm.id = caregiver_access.family_member_id
       AND fm.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update caregiver access they granted" ON public.caregiver_access;
CREATE POLICY "Users can update caregiver access they granted"
ON public.caregiver_access
FOR UPDATE
USING (auth.uid() = granted_by)
WITH CHECK (
  auth.uid() = granted_by
  AND EXISTS (
    SELECT 1 FROM public.family_members fm
     WHERE fm.id = caregiver_access.family_member_id
       AND fm.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- 5. Notes, care plans and goals are written by clinical staff
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians create internal notes" ON public.internal_notes;
CREATE POLICY "Clinicians create internal notes"
ON public.internal_notes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = author_user_id
  AND (public.clinician_has_patient_access(patient_user_id)
       OR public.institution_has_clinical_access(patient_user_id))
);

DROP POLICY IF EXISTS "Clinicians write care plans" ON public.fhir_care_plans;
CREATE POLICY "Clinicians write care plans"
ON public.fhir_care_plans
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (public.clinician_has_patient_access(patient_user_id)
       OR public.institution_has_clinical_access(patient_user_id))
);

DROP POLICY IF EXISTS "Clinicians amend care plans" ON public.fhir_care_plans;
CREATE POLICY "Clinicians amend care plans"
ON public.fhir_care_plans
FOR UPDATE
TO authenticated
USING (public.clinician_has_patient_access(patient_user_id)
       OR public.institution_has_clinical_access(patient_user_id))
WITH CHECK (public.clinician_has_patient_access(patient_user_id)
            OR public.institution_has_clinical_access(patient_user_id));

DROP POLICY IF EXISTS "Clinicians write goals" ON public.fhir_care_goals;
CREATE POLICY "Clinicians write goals"
ON public.fhir_care_goals
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fhir_care_plans p
   WHERE p.id = fhir_care_goals.care_plan_id
     AND (public.clinician_has_patient_access(p.patient_user_id)
          OR public.institution_has_clinical_access(p.patient_user_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.fhir_care_plans p
   WHERE p.id = fhir_care_goals.care_plan_id
     AND (public.clinician_has_patient_access(p.patient_user_id)
          OR public.institution_has_clinical_access(p.patient_user_id))
));
