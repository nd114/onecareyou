-- OC-LMC hardening (1/2): institutional consent enforced in Postgres, not just the UI.
--
-- Three defects this closes, all on the hospital-share pathway:
--
--   1. practice_shares.share_all / permissions are written by the patient's
--      granular picker but were never read by RLS. A patient who restricted a
--      hospital to vitals only still exposed medications and documents.
--   2. institution_has_patient_access() accepted an assignment made by ANY
--      tenant, so an assignment at hospital A also satisfied the check for a
--      clinician's membership at hospital B.
--   3. The practice-admin UPDATE policy on practice_shares had no directional
--      constraint, so a hospital admin could flip a revoked share back to
--      is_active = true — re-establishing consent without the patient.
--
-- It also gives institution shares the same append-only relationship ledger the
-- private pathway already has (share_events), which previously could not hold
-- an institution row at all: share_id was NOT NULL against provider_shares.

-- ---------------------------------------------------------------------------
-- 1. Assignment checks become tenant-scoped
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_assigned_to_patient_in_practice(
  _user_id uuid,
  _patient_user_id uuid,
  _practice_id uuid
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
      AND ppa.practice_id = _practice_id
      AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
      AND ppa.effective_from <= now()
  );
$$;

REVOKE ALL ON FUNCTION public.is_assigned_to_patient_in_practice(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_patient_in_practice(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.institution_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.can_view_all_patients = true
        -- Scoped to the tenant that holds the share: an assignment made by
        -- another hospital must not grant access here.
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$$;

REVOKE ALL ON FUNCTION public.institution_has_patient_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_has_patient_access(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. The patient's category choices become an access control, not a label
-- ---------------------------------------------------------------------------

-- Mirrors clinician_has_patient_permission() on the private pathway.
-- share_all short-circuits; otherwise the category flag must be explicitly true.
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
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
      AND (
        ps.share_all = true
        OR COALESCE((ps.permissions->>permission_key)::boolean, false) = true
      )
  ) END;
$$;

REVOKE ALL ON FUNCTION public.institution_has_patient_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_has_patient_permission(uuid, text) TO authenticated;

-- Re-point the institution read policies at the permission-aware helper.
-- Category keys match the patient-facing picker in HospitalShareCard.
DROP POLICY IF EXISTS "Institution team can view shared vitals" ON public.vitals;
CREATE POLICY "Institution team can view shared vitals"
ON public.vitals FOR SELECT TO authenticated
USING (public.institution_has_patient_permission(user_id, 'vitals'));

DROP POLICY IF EXISTS "Institution team can view shared medications" ON public.medications;
CREATE POLICY "Institution team can view shared medications"
ON public.medications FOR SELECT TO authenticated
USING (public.institution_has_patient_permission(user_id, 'medications'));

DROP POLICY IF EXISTS "Institution team can view shared documents" ON public.health_documents;
CREATE POLICY "Institution team can view shared documents"
ON public.health_documents FOR SELECT TO authenticated
USING (public.institution_has_patient_permission(user_id, 'documents'));

-- Guidance is clinician-authored output for this patient rather than one of the
-- patient's five shareable categories, so it stays on the access check.

-- ---------------------------------------------------------------------------
-- 3. A hospital can end a share, never (re)start one
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Practice admins pause shares to their practice" ON public.practice_shares;
CREATE POLICY "Practice admins can only end shares to their practice"
ON public.practice_shares FOR UPDATE TO authenticated
USING (public.can_manage_practice(practice_id) AND is_active = true)
WITH CHECK (public.can_manage_practice(practice_id) AND is_active = false);

-- ---------------------------------------------------------------------------
-- 4. Institution shares join the relationship ledger
-- ---------------------------------------------------------------------------

ALTER TABLE public.share_events ALTER COLUMN share_id DROP NOT NULL;

ALTER TABLE public.share_events
  ADD COLUMN IF NOT EXISTS practice_share_id uuid REFERENCES public.practice_shares(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'share_events_one_subject'
  ) THEN
    ALTER TABLE public.share_events
      ADD CONSTRAINT share_events_one_subject CHECK (
        (share_id IS NOT NULL AND practice_share_id IS NULL)
        OR (share_id IS NULL AND practice_share_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_share_events_practice_share
  ON public.share_events(practice_share_id, created_at DESC);

-- Written by trigger rather than the client: the ledger has to record what the
-- database actually did, and the existing INSERT policy (which requires a
-- matching provider_shares row) already blocks clients from forging these rows.
CREATE OR REPLACE FUNCTION public.log_practice_share_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'connected';
  ELSIF OLD.is_active = true AND NEW.is_active = false THEN
    _event := 'revoked';
  ELSIF OLD.is_active = false AND NEW.is_active = true THEN
    _event := 'reshared';
  ELSIF OLD.permissions IS DISTINCT FROM NEW.permissions
     OR OLD.share_all IS DISTINCT FROM NEW.share_all THEN
    _event := 'permissions_changed';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.share_events (
    practice_share_id, practice_id, patient_user_id, event_type,
    actor_user_id, actor_role, reason, details
  )
  VALUES (
    NEW.id, NEW.practice_id, NEW.user_id, _event, _actor,
    CASE
      WHEN _actor IS NULL THEN 'system'
      WHEN _actor = NEW.user_id THEN 'patient'
      ELSE 'clinician'
    END,
    CASE WHEN _event = 'revoked' THEN NEW.revoke_reason ELSE NULL END,
    jsonb_build_object('share_all', NEW.share_all, 'permissions', NEW.permissions)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_practice_share_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_practice_share_events ON public.practice_shares;
CREATE TRIGGER trg_practice_share_events
AFTER INSERT OR UPDATE ON public.practice_shares
FOR EACH ROW EXECUTE FUNCTION public.log_practice_share_event();

-- Patients already read their own ledger via "Patients can view their share
-- history" (keyed on patient_user_id). Hospitals get their own tenant's rows.
DROP POLICY IF EXISTS "Practice admins view institution share history" ON public.share_events;
CREATE POLICY "Practice admins view institution share history"
ON public.share_events FOR SELECT TO authenticated
USING (practice_id IS NOT NULL AND public.can_manage_practice(practice_id));

-- Backfill a 'connected' row for shares that predate the trigger, so existing
-- OC-LMC connections are not missing their opening ledger entry.
INSERT INTO public.share_events (
  practice_share_id, practice_id, patient_user_id, event_type,
  actor_user_id, actor_role, details, created_at
)
SELECT ps.id, ps.practice_id, ps.user_id, 'connected', ps.user_id, 'patient',
       jsonb_build_object('share_all', ps.share_all, 'permissions', ps.permissions,
                          'backfilled', true),
       ps.connected_at
FROM public.practice_shares ps
WHERE NOT EXISTS (
  SELECT 1 FROM public.share_events se WHERE se.practice_share_id = ps.id
);

-- And a closing 'revoked' row for shares already disconnected before the trigger.
INSERT INTO public.share_events (
  practice_share_id, practice_id, patient_user_id, event_type,
  actor_user_id, actor_role, reason, details, created_at
)
SELECT ps.id, ps.practice_id, ps.user_id, 'revoked',
       COALESCE(ps.revoked_by, ps.user_id),
       CASE WHEN ps.revoked_by IS NULL OR ps.revoked_by = ps.user_id THEN 'patient' ELSE 'clinician' END,
       ps.revoke_reason,
       jsonb_build_object('backfilled', true),
       ps.revoked_at
FROM public.practice_shares ps
WHERE ps.is_active = false
  AND ps.revoked_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.share_events se
    WHERE se.practice_share_id = ps.id AND se.event_type = 'revoked'
  );
