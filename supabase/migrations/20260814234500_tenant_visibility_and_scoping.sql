-- OC-LMC hardening (2/2): make the hospital side of the product actually work
-- for the people it was built for, without widening access.
--
-- Defects this closes:
--
--   4. get_patient_identity() had no institution path, so a patient who reached
--      the hospital through the institution pathway (and has no private share)
--      resolved to no name anywhere on the hospital's own screens.
--   5. internal_notes was gated on clinician_has_patient_access() alone, so the
--      private/internal note type did not exist for hospital-assigned patients.
--   6. The tenant audit log showed each admin only their own rows: the SELECT
--      policy on hipaa_audit_logs is auth.uid() = user_id. "Hospital admin can
--      review their tenant's access log" was not achievable.
--   7. has_practice_capability() resolved membership with an unordered LIMIT 1
--      across ALL of a user's tenants, so a clinician affiliated with more than
--      one hospital (explicitly supported by the sharing model) got whichever
--      tenant's role Postgres happened to return.

-- ---------------------------------------------------------------------------
-- 4. Identity resolves through the institution pathway too
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_patient_identity(patient_ids uuid[])
RETURNS TABLE(user_id uuid, name text, email text, phone_number text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.name, p.email, p.phone_number
  FROM public.profiles p
  WHERE p.user_id = ANY(patient_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.provider_shares ps
        WHERE ps.user_id = p.user_id
          AND ps.is_active = true
          AND (
            ps.clinician_user_id = auth.uid()
            OR ps.provider_email = public.get_current_user_email()
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.clinician_patient_records cpr
        WHERE cpr.linked_user_id = p.user_id
          AND cpr.clinician_user_id = auth.uid()
      )
      -- Institution pathway: same test as the clinical tables, so identity can
      -- never be broader than the record it labels.
      OR public.institution_has_patient_access(p.user_id)
      -- A tenant admin runs the assignment desk and must see who is waiting to
      -- be assigned, which by definition precedes any assignment.
      OR EXISTS (
        SELECT 1 FROM public.practice_shares ps2
        WHERE ps2.user_id = p.user_id
          AND public.can_manage_practice(ps2.practice_id)
      )
    )
$$;

REVOKE ALL ON FUNCTION public.get_patient_identity(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_identity(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Internal notes exist for hospital-assigned patients
-- ---------------------------------------------------------------------------
-- Internal notes are the private/clinical-reasoning note type. They are never
-- filed to the patient's Vault by any path; this only extends who may write and
-- read them to clinicians whose relationship is institutional rather than private.

DROP POLICY IF EXISTS "Clinicians read internal notes for accessible patients" ON public.internal_notes;
CREATE POLICY "Clinicians read internal notes for accessible patients"
  ON public.internal_notes FOR SELECT TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  );

DROP POLICY IF EXISTS "Clinicians create internal notes" ON public.internal_notes;
CREATE POLICY "Clinicians create internal notes"
  ON public.internal_notes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_user_id
    AND (
      public.clinician_has_patient_access(patient_user_id)
      OR public.institution_has_patient_access(patient_user_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 6. A tenant admin can review their own tenant's access log
-- ---------------------------------------------------------------------------
-- Scoped strictly to actors who are members of that tenant. No cross-tenant
-- visibility: that stays with the platform admin console.

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
  WHERE public.can_manage_practice(_practice_id)
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

-- ---------------------------------------------------------------------------
-- 7. Capabilities are resolved per tenant
-- ---------------------------------------------------------------------------

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

REVOKE ALL ON FUNCTION public.has_practice_capability(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_practice_capability(uuid, text, uuid) TO authenticated, service_role;

-- The two-argument form stays for callers that have no tenant in hand, but it
-- now resolves the user's earliest membership deterministically instead of
-- returning an arbitrary row. Prefer the three-argument form.
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

REVOKE ALL ON FUNCTION public.has_practice_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_practice_capability(uuid, text) TO authenticated, service_role;
