
-- Phase 1.1 RBAC extension + 1.2 Patient panels
-- Extend practice_role enum with finer roles (keep existing values intact).

ALTER TYPE public.practice_role ADD VALUE IF NOT EXISTS 'clinician';
ALTER TYPE public.practice_role ADD VALUE IF NOT EXISTS 'nurse';
ALTER TYPE public.practice_role ADD VALUE IF NOT EXISTS 'front_desk';
ALTER TYPE public.practice_role ADD VALUE IF NOT EXISTS 'billing';
ALTER TYPE public.practice_role ADD VALUE IF NOT EXISTS 'read_only';

-- =========================================================
-- practice_role_permissions: role × capability matrix
-- Practice-scoped so an owner can override defaults per role.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.practice_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  role public.practice_role NOT NULL,
  capability text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, role, capability)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_role_permissions TO authenticated;
GRANT ALL ON public.practice_role_permissions TO service_role;

ALTER TABLE public.practice_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their practice permissions"
  ON public.practice_role_permissions FOR SELECT
  USING (public.is_practice_member(practice_id));

CREATE POLICY "Managers can modify permissions"
  ON public.practice_role_permissions FOR ALL
  USING (public.can_manage_practice(practice_id))
  WITH CHECK (public.can_manage_practice(practice_id));

CREATE TRIGGER update_practice_role_permissions_updated_at
  BEFORE UPDATE ON public.practice_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- practice_patient_assignments: clinician panels + coverage
-- Nurses/front_desk only access patients explicitly co-assigned here.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.practice_patient_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL,
  clinician_user_id uuid NOT NULL,
  assignment_role text NOT NULL DEFAULT 'primary',
    -- 'primary' | 'covering' | 'consulting' | 'support' (nurse/front_desk/billing co-assignment)
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  assigned_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppa_practice ON public.practice_patient_assignments(practice_id);
CREATE INDEX IF NOT EXISTS idx_ppa_clinician ON public.practice_patient_assignments(clinician_user_id);
CREATE INDEX IF NOT EXISTS idx_ppa_patient ON public.practice_patient_assignments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_ppa_active
  ON public.practice_patient_assignments(patient_user_id, clinician_user_id)
  WHERE effective_to IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_patient_assignments TO authenticated;
GRANT ALL ON public.practice_patient_assignments TO service_role;

ALTER TABLE public.practice_patient_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practice members read assignments in their practice"
  ON public.practice_patient_assignments FOR SELECT
  USING (public.is_practice_member(practice_id));

CREATE POLICY "Managers manage assignments"
  ON public.practice_patient_assignments FOR ALL
  USING (public.can_manage_practice(practice_id))
  WITH CHECK (public.can_manage_practice(practice_id));

CREATE TRIGGER update_practice_patient_assignments_updated_at
  BEFORE UPDATE ON public.practice_patient_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- has_practice_capability(user, capability)
-- Defaults baked in; overridden by practice_role_permissions row if present.
-- =========================================================

CREATE OR REPLACE FUNCTION public.has_practice_capability(
  _user_id uuid,
  _capability text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.practice_role;
  _practice_id uuid;
  _override boolean;
BEGIN
  SELECT pm.role, pm.practice_id
    INTO _role, _practice_id
  FROM public.practice_members pm
  WHERE pm.user_id = _user_id
    AND pm.status = 'active'
  LIMIT 1;

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  -- Practice-specific override wins
  SELECT granted INTO _override
  FROM public.practice_role_permissions
  WHERE practice_id = _practice_id
    AND role = _role
    AND capability = _capability;

  IF _override IS NOT NULL THEN
    RETURN _override;
  END IF;

  -- Default capability matrix
  RETURN CASE _capability
    WHEN 'view_phi' THEN _role IN ('owner','admin','provider','clinician','nurse','front_desk','read_only')
    WHEN 'edit_clinical' THEN _role IN ('owner','admin','provider','clinician')
    WHEN 'send_guidance' THEN _role IN ('owner','admin','provider','clinician','nurse')
    WHEN 'message_patients' THEN _role IN ('owner','admin','provider','clinician','nurse','front_desk')
    WHEN 'manage_billing' THEN _role IN ('owner','admin','billing')
    WHEN 'manage_team' THEN _role IN ('owner','admin')
    WHEN 'manage_ehr' THEN _role IN ('owner','admin')
    WHEN 'manage_settings' THEN _role IN ('owner','admin')
    WHEN 'invite_patients' THEN _role IN ('owner','admin','provider','clinician','front_desk')
    WHEN 'export_data' THEN _role IN ('owner','admin','provider','clinician')
    WHEN 'bulk_message' THEN _role IN ('owner','admin','provider','clinician')
    WHEN 'view_audit' THEN _role IN ('owner','admin')
    ELSE false
  END;
END;
$$;

-- Helper: is this user assigned to this patient inside a practice today?
CREATE OR REPLACE FUNCTION public.is_assigned_to_patient(
  _user_id uuid,
  _patient_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_patient_assignments ppa
    WHERE ppa.patient_user_id = _patient_user_id
      AND ppa.clinician_user_id = _user_id
      AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
      AND ppa.effective_from <= now()
  );
$$;
