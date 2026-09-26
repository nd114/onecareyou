-- The tenant audit log has to stay inside the tenant on both sides.
--
-- practice_audit_log joined hipaa_audit_logs to practice_members on the actor
-- and nothing else:
--
--   JOIN public.practice_members pm
--     ON pm.user_id = l.user_id
--    AND pm.practice_id = _practice_id
--
-- so the *actor* was confined to the tenant and the *patient* was not. The
-- function is SECURITY DEFINER, which means the RLS on profiles and
-- hipaa_audit_logs that would otherwise have caught this was bypassed, and it
-- returns patient.name. Its own comment claimed "Scope stays inside the tenant
-- either way", which was true of the actor and false of the patient.
--
-- The platform deliberately supports one clinician working at several hospitals
-- at once (the sharing model, and useClinicianCapabilities reads the full set of
-- memberships for exactly that reason). That is what made this reachable rather
-- than theoretical: any admin of hospital A could read the names of hospital B's
-- patients, for every action a shared clinician performed there. The _search
-- argument matches patient.name and patient.email too, so the names could be
-- probed for, not merely stumbled upon.
--
-- Found in a live audit of the demo hospital: an admin's audit screen listed a
-- patient by name who had no share with that hospital at all.
--
-- The fix scopes the patient the same way public.practice_patient_overview
-- already scopes "this tenant's patients" — a practice_shares row for this
-- practice — so the two functions cannot disagree about who belongs to a tenant.
--
-- Two deliberate choices in that rule:
--
--   * `is_active` is not required. A revoked share still means the patient was
--     this tenant's patient, and what its staff did while access was live is the
--     tenant's own accountability record, not something revocation should
--     retroactively hide. practice_patient_overview takes the same view: it
--     returns is_active as a column rather than filtering on it.
--   * Rows with no patient at all stay visible. A member changing a setting is
--     tenant activity with no patient in it, and dropping those would gut the
--     log.
--
-- Untouched, and worth a separate decision: a department lead still sees every
-- actor in the tenant here, while practice_patient_overview narrows them to
-- their own departments. That is over-visibility inside one tenant rather than
-- across two, and narrowing it changes what a lead is shown — a product call,
-- not this fix.

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
    -- The patient side of the scope. Without this the actor was in the tenant
    -- and the patient could be anybody they had ever treated anywhere.
    AND (
      l.patient_user_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.practice_shares ps
        WHERE ps.practice_id = _practice_id
          AND ps.user_id = l.patient_user_id
      )
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
