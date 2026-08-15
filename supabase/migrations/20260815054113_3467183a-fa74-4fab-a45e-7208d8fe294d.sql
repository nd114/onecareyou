-- Departments, and the delegated administration that hangs off them.
--
-- A hospital is not one flat list of staff. Paediatrics and Emergency run their
-- own rotas and their own patients, and the chief admin cannot personally route
-- every admission. Until now the only way to let someone assign patients was to
-- make them a full tenant admin, which also handed them branding, billing, the
-- hospital code and the whole team roster.
--
-- The shape:
--   practice_departments          — a unit inside a hospital tenant
--   practice_department_members   — who works in it; is_lead marks the Sub-Admin
--   practice_patient_departments  — which department a shared patient sits under
--   practice_patient_assignments  — gains department_id, so an assignment records
--                                   the department it was made under
--
-- What this migration deliberately does NOT do: change who can *read* a patient
-- record. can_view_all_patients still governs that, by decision (see the column
-- comment added in 20260815010000). Departments organise management now, and
-- become the unit of clinical access when assignment-first access lands.

-- ---------------------------------------------------------------------------
-- 1. Departments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_departments_name
  ON public.practice_departments(practice_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_practice_departments_practice
  ON public.practice_departments(practice_id);

GRANT SELECT, INSERT, UPDATE ON public.practice_departments TO authenticated;
GRANT ALL ON public.practice_departments TO service_role;
ALTER TABLE public.practice_departments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS practice_departments_updated_at ON public.practice_departments;
CREATE TRIGGER practice_departments_updated_at
BEFORE UPDATE ON public.practice_departments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Department membership — clinicians, and the leads who administer them
-- ---------------------------------------------------------------------------
-- practice_id is denormalised so tenant-scoped policies do not have to join
-- back through the department on every row check.

CREATE TABLE IF NOT EXISTS public.practice_department_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.practice_departments(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  -- The Sub-Admin marker. A department can have more than one lead; a person
  -- can lead one department and simply work in another.
  is_lead boolean NOT NULL DEFAULT false,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pdm_user ON public.practice_department_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pdm_department ON public.practice_department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_pdm_lead
  ON public.practice_department_members(user_id) WHERE is_lead;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_department_members TO authenticated;
GRANT ALL ON public.practice_department_members TO service_role;
ALTER TABLE public.practice_department_members ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS practice_department_members_updated_at ON public.practice_department_members;
CREATE TRIGGER practice_department_members_updated_at
BEFORE UPDATE ON public.practice_department_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Patient → department routing
-- ---------------------------------------------------------------------------
-- Separate from the clinician assignment because a patient arrives at a
-- department before anyone has picked which clinician takes them, and can be
-- under two departments at once (admitted via Emergency, moved to a ward).

CREATE TABLE IF NOT EXISTS public.practice_patient_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.practice_departments(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL,
  assigned_by uuid,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppd_patient ON public.practice_patient_departments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_ppd_department ON public.practice_patient_departments(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppd_current
  ON public.practice_patient_departments(department_id, patient_user_id)
  WHERE effective_to IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.practice_patient_departments TO authenticated;
GRANT ALL ON public.practice_patient_departments TO service_role;
ALTER TABLE public.practice_patient_departments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS practice_patient_departments_updated_at ON public.practice_patient_departments;
CREATE TRIGGER practice_patient_departments_updated_at
BEFORE UPDATE ON public.practice_patient_departments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- An assignment now records which department it was made under.
ALTER TABLE public.practice_patient_assignments
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.practice_departments(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

/** Departments the caller leads (their Sub-Admin scope). */
CREATE OR REPLACE FUNCTION public.led_department_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(pdm.department_id), '{}')
  FROM public.practice_department_members pdm
  JOIN public.practice_members pm
    ON pm.practice_id = pdm.practice_id AND pm.user_id = pdm.user_id AND pm.status = 'active'
  WHERE pdm.user_id = auth.uid()
    AND pdm.is_lead = true;
$$;

REVOKE ALL ON FUNCTION public.led_department_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.led_department_ids() TO authenticated;

/**
 * True when the caller may administer this department: a tenant owner/admin
 * anywhere in their tenant, or a Sub-Admin who leads this specific department.
 */
CREATE OR REPLACE FUNCTION public.can_manage_department(_department_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_departments d
    WHERE d.id = _department_id
      AND (
        public.can_manage_practice(d.practice_id)
        OR EXISTS (
          SELECT 1
          FROM public.practice_department_members pdm
          JOIN public.practice_members pm
            ON pm.practice_id = pdm.practice_id
           AND pm.user_id = pdm.user_id
           AND pm.status = 'active'
          WHERE pdm.department_id = d.id
            AND pdm.user_id = auth.uid()
            AND pdm.is_lead = true
        )
      )
  ) END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_department(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_department(uuid) TO authenticated;

/** True when the caller leads any department in this tenant. */
CREATE OR REPLACE FUNCTION public.is_department_lead(_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_department_members pdm
    JOIN public.practice_members pm
      ON pm.practice_id = pdm.practice_id AND pm.user_id = pdm.user_id AND pm.status = 'active'
    WHERE pdm.user_id = auth.uid()
      AND pdm.practice_id = _practice_id
      AND pdm.is_lead = true
  ) END;
$$;

REVOKE ALL ON FUNCTION public.is_department_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_department_lead(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Policies
-- ---------------------------------------------------------------------------

-- Departments: everyone in the tenant can see the structure they work in;
-- only owners/admins create and edit it. A Sub-Admin administers a department,
-- they do not invent one.
DROP POLICY IF EXISTS "Members read departments in their tenant" ON public.practice_departments;
CREATE POLICY "Members read departments in their tenant"
ON public.practice_departments FOR SELECT TO authenticated
USING (public.is_practice_member(practice_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Tenant admins create departments" ON public.practice_departments;
CREATE POLICY "Tenant admins create departments"
ON public.practice_departments FOR INSERT TO authenticated
WITH CHECK (public.can_manage_practice(practice_id));

DROP POLICY IF EXISTS "Tenant admins update departments" ON public.practice_departments;
CREATE POLICY "Tenant admins update departments"
ON public.practice_departments FOR UPDATE TO authenticated
USING (public.can_manage_practice(practice_id))
WITH CHECK (public.can_manage_practice(practice_id));

-- Department membership: visible tenant-wide (staff need to know who is on
-- which team); managed by tenant admins, or by the lead of that department for
-- everything except lead status itself — promoting a Sub-Admin stays with the
-- chief admin, which is enforced by the trigger below.
DROP POLICY IF EXISTS "Members read department membership in their tenant" ON public.practice_department_members;
CREATE POLICY "Members read department membership in their tenant"
ON public.practice_department_members FOR SELECT TO authenticated
USING (public.is_practice_member(practice_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Department admins add members" ON public.practice_department_members;
CREATE POLICY "Department admins add members"
ON public.practice_department_members FOR INSERT TO authenticated
WITH CHECK (public.can_manage_department(department_id));

DROP POLICY IF EXISTS "Department admins update members" ON public.practice_department_members;
CREATE POLICY "Department admins update members"
ON public.practice_department_members FOR UPDATE TO authenticated
USING (public.can_manage_department(department_id))
WITH CHECK (public.can_manage_department(department_id));

DROP POLICY IF EXISTS "Department admins remove members" ON public.practice_department_members;
CREATE POLICY "Department admins remove members"
ON public.practice_department_members FOR DELETE TO authenticated
USING (public.can_manage_department(department_id));

/**
 * Only a tenant owner/admin may grant or revoke lead status. Without this a
 * Sub-Admin could promote themselves a peer, or promote themselves in a
 * department they were merely added to, and delegation would not hold.
 */
CREATE OR REPLACE FUNCTION public.guard_department_lead_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No auth.uid() means this is not an end-user request: the service role, a
  -- migration, or seeding. Those are trusted callers and RLS has already kept
  -- anon out, so the guard only applies to signed-in users.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_lead AND NOT public.can_manage_practice(NEW.practice_id) THEN
      RAISE EXCEPTION 'Only a hospital owner or admin can appoint a department lead';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_lead IS DISTINCT FROM OLD.is_lead
       AND NOT public.can_manage_practice(NEW.practice_id) THEN
      RAISE EXCEPTION 'Only a hospital owner or admin can change department lead status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_department_lead_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_department_lead ON public.practice_department_members;
CREATE TRIGGER trg_guard_department_lead
BEFORE INSERT OR UPDATE ON public.practice_department_members
FOR EACH ROW EXECUTE FUNCTION public.guard_department_lead_changes();

-- Patient routing: readable tenant-wide, written by whoever administers the
-- department the patient is being routed into.
DROP POLICY IF EXISTS "Members read patient department routing" ON public.practice_patient_departments;
CREATE POLICY "Members read patient department routing"
ON public.practice_patient_departments FOR SELECT TO authenticated
USING (public.is_practice_member(practice_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Department admins route patients" ON public.practice_patient_departments;
CREATE POLICY "Department admins route patients"
ON public.practice_patient_departments FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_department(department_id)
  -- Routing presupposes consent: the patient must actually be sharing with
  -- this hospital. Departments never create access on their own.
  AND EXISTS (
    SELECT 1 FROM public.practice_shares ps
    WHERE ps.practice_id = practice_patient_departments.practice_id
      AND ps.user_id = practice_patient_departments.patient_user_id
      AND ps.is_active = true
  )
);

DROP POLICY IF EXISTS "Department admins update patient routing" ON public.practice_patient_departments;
CREATE POLICY "Department admins update patient routing"
ON public.practice_patient_departments FOR UPDATE TO authenticated
USING (public.can_manage_department(department_id))
WITH CHECK (public.can_manage_department(department_id));

-- Assignments: tenant admins keep their existing rights; department leads may
-- now assign within their own department, to a clinician who works in it.
DROP POLICY IF EXISTS "Department leads assign within their department" ON public.practice_patient_assignments;
CREATE POLICY "Department leads assign within their department"
ON public.practice_patient_assignments FOR INSERT TO authenticated
WITH CHECK (
  department_id IS NOT NULL
  AND public.can_manage_department(department_id)
  AND EXISTS (
    SELECT 1 FROM public.practice_department_members pdm
    WHERE pdm.department_id = practice_patient_assignments.department_id
      AND pdm.user_id = practice_patient_assignments.clinician_user_id
  )
  AND EXISTS (
    SELECT 1 FROM public.practice_shares ps
    WHERE ps.practice_id = practice_patient_assignments.practice_id
      AND ps.user_id = practice_patient_assignments.patient_user_id
      AND ps.is_active = true
  )
);

DROP POLICY IF EXISTS "Department leads end assignments in their department" ON public.practice_patient_assignments;
CREATE POLICY "Department leads end assignments in their department"
ON public.practice_patient_assignments FOR UPDATE TO authenticated
USING (department_id IS NOT NULL AND public.can_manage_department(department_id))
WITH CHECK (department_id IS NOT NULL AND public.can_manage_department(department_id));

-- ---------------------------------------------------------------------------
-- 6. Capabilities for the new role
-- ---------------------------------------------------------------------------
-- A Sub-Admin is clinical staff plus an assignment desk and their department's
-- audit. They do not get manage_team, manage_billing, manage_settings or
-- manage_ehr — those stay with the chief admin, which is the whole point of
-- having a middle layer.

CREATE OR REPLACE FUNCTION public.has_practice_capability(
  _user_id uuid,
  _capability text,
  _practice_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.practice_role;
  _override boolean;
BEGIN
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

REVOKE ALL ON FUNCTION public.has_practice_capability(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_practice_capability(uuid, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Chief-admin oversight: who works here, who they can reach, what they did
-- ---------------------------------------------------------------------------

/**
 * Staff roster with the basis of each person's access. Answers "who are my
 * clinicians and what can they currently see" in one place.
 */
CREATE OR REPLACE FUNCTION public.practice_staff_overview(_practice_id uuid)
RETURNS TABLE(
  user_id uuid,
  name text,
  email text,
  role public.practice_role,
  status text,
  departments text[],
  leads_departments text[],
  assigned_patient_count bigint,
  has_tenant_wide_view boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pm.user_id,
    pr.name,
    pr.email,
    pm.role,
    pm.status,
    COALESCE((
      SELECT array_agg(d.name ORDER BY d.name)
      FROM public.practice_department_members pdm
      JOIN public.practice_departments d ON d.id = pdm.department_id
      WHERE pdm.user_id = pm.user_id AND pdm.practice_id = _practice_id
    ), '{}'),
    COALESCE((
      SELECT array_agg(d.name ORDER BY d.name)
      FROM public.practice_department_members pdm
      JOIN public.practice_departments d ON d.id = pdm.department_id
      WHERE pdm.user_id = pm.user_id AND pdm.practice_id = _practice_id AND pdm.is_lead
    ), '{}'),
    (
      SELECT count(*)
      FROM public.practice_patient_assignments ppa
      WHERE ppa.clinician_user_id = pm.user_id
        AND ppa.practice_id = _practice_id
        AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
    ),
    COALESCE(pm.can_view_all_patients, false)
  FROM public.practice_members pm
  LEFT JOIN public.profiles pr ON pr.user_id = pm.user_id
  WHERE pm.practice_id = _practice_id
    AND (public.can_manage_practice(_practice_id) OR public.is_department_lead(_practice_id))
  ORDER BY pm.role, pr.name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.practice_staff_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_staff_overview(uuid) TO authenticated;

/**
 * Patients sharing with this tenant, with their department and who holds them.
 * Sub-Admins see their own departments' patients plus anyone not yet routed —
 * the unrouted queue is exactly what they are there to work through.
 */
CREATE OR REPLACE FUNCTION public.practice_patient_overview(_practice_id uuid)
RETURNS TABLE(
  patient_user_id uuid,
  name text,
  email text,
  is_active boolean,
  share_all boolean,
  connected_at timestamptz,
  departments text[],
  department_ids uuid[],
  assigned_clinicians text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      ps.user_id,
      ps.is_active,
      ps.share_all,
      ps.connected_at,
      COALESCE((
        SELECT array_agg(d.name ORDER BY d.name)
        FROM public.practice_patient_departments ppd
        JOIN public.practice_departments d ON d.id = ppd.department_id
        WHERE ppd.patient_user_id = ps.user_id
          AND ppd.practice_id = _practice_id
          AND ppd.effective_to IS NULL
      ), '{}') AS dept_names,
      COALESCE((
        SELECT array_agg(ppd.department_id)
        FROM public.practice_patient_departments ppd
        WHERE ppd.patient_user_id = ps.user_id
          AND ppd.practice_id = _practice_id
          AND ppd.effective_to IS NULL
      ), '{}') AS dept_ids
    FROM public.practice_shares ps
    WHERE ps.practice_id = _practice_id
  )
  SELECT
    s.user_id,
    pr.name,
    pr.email,
    s.is_active,
    s.share_all,
    s.connected_at,
    s.dept_names,
    s.dept_ids,
    COALESCE((
      SELECT array_agg(COALESCE(cp.name, cp.email) ORDER BY cp.name)
      FROM public.practice_patient_assignments ppa
      LEFT JOIN public.profiles cp ON cp.user_id = ppa.clinician_user_id
      WHERE ppa.patient_user_id = s.user_id
        AND ppa.practice_id = _practice_id
        AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
    ), '{}')
  FROM scoped s
  LEFT JOIN public.profiles pr ON pr.user_id = s.user_id
  WHERE
    public.can_manage_practice(_practice_id)
    OR (
      public.is_department_lead(_practice_id)
      AND (
        s.dept_ids = '{}'
        OR s.dept_ids && public.led_department_ids()
      )
    )
  ORDER BY s.connected_at DESC;
$$;

REVOKE ALL ON FUNCTION public.practice_patient_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_patient_overview(uuid) TO authenticated;

-- The tenant audit log opens to Sub-Admins as well, since they are accountable
-- for their department's activity. Scope stays inside the tenant either way.
CREATE OR REPLACE FUNCTION public.practice_audit_log(
  _practice_id uuid,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  action text,
  resource_type text,
  resource_id text,
  patient_user_id uuid,
  patient_name text,
  ip_address text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.created_at,
    l.user_id,
    actor.name,
    actor.email,
    l.action,
    l.resource_type,
    l.resource_id,
    l.patient_user_id,
    patient.name,
    l.ip_address
  FROM public.hipaa_audit_logs l
  JOIN public.practice_members pm
    ON pm.user_id = l.user_id
   AND pm.practice_id = _practice_id
   AND pm.status = 'active'
  LEFT JOIN public.profiles actor ON actor.user_id = l.user_id
  LEFT JOIN public.profiles patient ON patient.user_id = l.patient_user_id
  WHERE (
      public.can_manage_practice(_practice_id)
      OR public.is_department_lead(_practice_id)
    )
    AND (
      _search IS NULL OR _search = ''
      OR l.action ILIKE '%' || _search || '%'
      OR l.resource_type ILIKE '%' || _search || '%'
      OR actor.email ILIKE '%' || _search || '%'
      OR actor.name ILIKE '%' || _search || '%'
      OR patient.email ILIKE '%' || _search || '%'
      OR patient.name ILIKE '%' || _search || '%'
    )
  ORDER BY l.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 200), 1000);
$$;

REVOKE ALL ON FUNCTION public.practice_audit_log(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_audit_log(uuid, text, integer) TO authenticated;