-- The access gates answer for one relationship at a time, and only the party
-- who owns a relationship can reshape it.
--
-- An audit of every gate RLS uses, run as a signed-in caller against the
-- replayed schema, found three places where a gate was sound but the rows it
-- trusts, or the way it combined them, were not.
--
--   * A department belongs to one hospital, but nothing said so. The
--     department-lead policy on practice_patient_assignments checks that the
--     caller leads the department and that the patient shares with the
--     assignment's practice. It never checked that the department is that
--     practice's. Anybody can create a practice and so manage its departments,
--     so any clinician at an assignment-first hospital could found a practice,
--     give it a department, join it, and file an assignment at the hospital
--     naming themselves. is_assigned_to_patient_in_practice() then answered
--     true and institution_has_clinical_access() opened that patient's
--     clinical record. practice_department_members and
--     practice_patient_departments had the same gap, and so did the
--     department argument of assign_practice_patient(). A trigger now refuses
--     any row on those three tables whose department is another practice's,
--     whoever writes it.
--   * The same lead policy for UPDATE let a lead rewrite an assignment's
--     patient, clinician or practice, which skips every check the INSERT
--     policy makes. An assignment records who looked after whom; a lead ends
--     one and makes another. Those three columns are now fixed once written,
--     for signed-in callers, the way practice_members' identity already is.
--     No client code changes them.
--   * The clinician on a provider share could rewrite provider_email. The
--     clinician gates admit whoever holds that address, so the clinician could
--     hand the patient's record to a colleague the patient never named.
--     guard_provider_share_consent already held the terms of the share still
--     against everyone but the patient; provider_email and provider_name, who
--     the share is with, join them, and so does created_at, which dates the
--     window clinician_had_patient_access_at() allows. Claiming a share sent
--     to your address sets clinician_user_id only and is unaffected.
--   * institution_has_clinical_permission() asked "does some practice's share
--     grant this category" and "does some practice give this person clinical
--     access" as two questions, so the answers could come from two practices.
--     Front desk at a hospital the patient gave their medications to, plus
--     clinician at a hospital the patient gave only vitals to, read the
--     medications. It is now one question about one share and one membership,
--     as institution_has_patient_permission() already was.

-- ---------------------------------------------------------------------------
-- 1. A department row names its own practice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.department_belongs_to_practice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.practice_departments d
     WHERE d.id = NEW.department_id
       AND d.practice_id = NEW.practice_id
  ) THEN
    RAISE EXCEPTION 'That department belongs to a different practice'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.department_belongs_to_practice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_department_belongs_to_practice ON public.practice_patient_assignments;
CREATE TRIGGER trg_department_belongs_to_practice
BEFORE INSERT OR UPDATE OF department_id, practice_id ON public.practice_patient_assignments
FOR EACH ROW EXECUTE FUNCTION public.department_belongs_to_practice();

DROP TRIGGER IF EXISTS trg_department_belongs_to_practice ON public.practice_department_members;
CREATE TRIGGER trg_department_belongs_to_practice
BEFORE INSERT OR UPDATE OF department_id, practice_id ON public.practice_department_members
FOR EACH ROW EXECUTE FUNCTION public.department_belongs_to_practice();

DROP TRIGGER IF EXISTS trg_department_belongs_to_practice ON public.practice_patient_departments;
CREATE TRIGGER trg_department_belongs_to_practice
BEFORE INSERT OR UPDATE OF department_id, practice_id ON public.practice_patient_departments
FOR EACH ROW EXECUTE FUNCTION public.department_belongs_to_practice();

-- ---------------------------------------------------------------------------
-- 2. An assignment is ended, not moved
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_assignment_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.id IS DISTINCT FROM OLD.id
          OR NEW.practice_id IS DISTINCT FROM OLD.practice_id
          OR NEW.patient_user_id IS DISTINCT FROM OLD.patient_user_id
          OR NEW.clinician_user_id IS DISTINCT FROM OLD.clinician_user_id) THEN
    RAISE EXCEPTION 'An assignment is one clinician for one patient at one practice. End it and make another.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_assignment_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_assignment_identity ON public.practice_patient_assignments;
CREATE TRIGGER trg_guard_assignment_identity
BEFORE UPDATE ON public.practice_patient_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_identity();

-- ---------------------------------------------------------------------------
-- 3. The patient names who a provider share is with
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_provider_share_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Server-side callers (cron, service role, migrations) and the patient who
  -- owns the share may change anything about it.
  IF auth.uid() IS NULL OR auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Who the share is with, and since when, is the patient's to say.
  NEW.provider_email := OLD.provider_email;
  NEW.provider_name  := OLD.provider_name;
  NEW.created_at     := OLD.created_at;

  -- A platform admin closing a share: allowed, and only that. The revocation
  -- stamps ride along so the share records who closed it and why.
  IF OLD.is_active AND NOT NEW.is_active AND public.has_role(auth.uid(), 'admin') THEN
    NEW.user_id        := OLD.user_id;
    NEW.permissions    := OLD.permissions;
    NEW.expires_at     := OLD.expires_at;
    NEW.invite_code    := OLD.invite_code;
    NEW.reconnected_at := OLD.reconnected_at;
    RETURN NEW;
  END IF;

  -- Anyone else — in practice the clinician on the share — may not touch the
  -- terms of the relationship.
  NEW.user_id        := OLD.user_id;
  NEW.is_active      := OLD.is_active;
  NEW.permissions    := OLD.permissions;
  NEW.expires_at     := OLD.expires_at;
  NEW.invite_code    := OLD.invite_code;
  NEW.revoked_at     := OLD.revoked_at;
  NEW.revoked_by     := OLD.revoked_by;
  NEW.revoke_reason  := OLD.revoke_reason;
  NEW.reconnected_at := OLD.reconnected_at;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. One practice answers both halves of a clinical permission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.institution_has_clinical_permission(patient_user_id uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_role_is_clinical(pm.role)
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
      AND (
        ps.share_all = true
        OR public.share_grants(ps.permissions, _category)
      )
  ) END;
$$;
