-- Someone who has left a practice can no longer change its record, and ending
-- a membership is one enforced act that leaves a history.
--
-- What was wrong, checked on a replayed database (docs/plans/clinician-offboarding.md):
--
--   * A leaver could still write to the hospital's record. Every author write
--     policy asked only "are you the author": encounters UPDATE (so an unsigned
--     draft could be edited and signed after leaving), encounter_addenda INSERT
--     (an author arm with no access check), internal_notes UPDATE and DELETE,
--     and the author UPDATE and DELETE on clinician_patient_records, which did
--     not look at practice_id. Access helpers all require an active membership,
--     but none of these policies called one.
--   * Ending a membership had three paths that disagreed. The team list and the
--     hospital admin page did a direct UPDATE of status, which skipped the
--     last-owner rule, left department lead rows dormant (and revived them on
--     restore) and wrote no audit row. Nothing recorded who ended a membership,
--     when, or why. Any manager, or the member, could hard-delete the row.
--   * Moving a member to a non-clinical role left can_view_all_patients set, and
--     messages INSERT used the role-blind institution_has_patient_access, so a
--     provider moved to billing could still message patients as a clinician.
--
-- The fix:
--
--   1. practice_members gains ended_at, ended_by and end_reason. No new status
--      value: ending writes 'revoked'; existing 'archived' rows are read as
--      ended and are not rewritten.
--   2. practice_membership_events is an append-only ledger in the shape of
--      share_events. An AFTER trigger on practice_members writes it on every
--      join, status, role and view-all change, whichever path made the change,
--      and writes a hipaa_audit_logs row naming the actor, which the tenant's
--      practice_audit_log already shows.
--   3. A BEFORE UPDATE trigger refuses a direct client change to status, role,
--      can_view_all_patients or the end stamp. The test is current_user, as in
--      guard_practice_member_identity: a SECURITY DEFINER function runs as its
--      owner, so end_practice_membership, leave_practice,
--      change_practice_member_access, set_practice_affiliation_status and the
--      invitation functions pass, and so do migrations and the service role.
--      The same trigger holds the owner rules on every path an end user can
--      reach: only an active owner may end or demote an owner, and a tenant
--      keeps at least one active owner. A manager cannot re-activate someone
--      who left of their own accord; they are invited again and accept.
--   4. Ending a membership removes that person's department rows, on every
--      path, as set_practice_affiliation_status already did, and the ledger
--      entry lists what was removed and whether it was a lead role, so nothing
--      about who led what is lost and a restore does not revive it.
--   5. Memberships are never deleted by a client: the DELETE policy is dropped
--      and DELETE is revoked.
--   6. Author writes on the clinical record require current access at the
--      moment of the write, through has_current_clinical_access(): the provider
--      share or the institutional clinical pathway, and, where the row names a
--      practice, an active clinical membership there. Reads are unchanged; what
--      an author filed stays readable to them.
--   7. Moving from a clinical to a non-clinical role clears view-all, and
--      clinician messaging and addenda use institution_has_clinical_access.
--
-- Deliberately not here: the handover of open work, a practice_id on messages,
-- patient notices and account closure (phases 2 to 4 of the plan). Read
-- policies on clinician_patient_records are left alone; another change owns
-- them.

-- ---------------------------------------------------------------------------
-- 1. The end stamp
-- ---------------------------------------------------------------------------
ALTER TABLE public.practice_members
  ADD COLUMN IF NOT EXISTS ended_at   timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by   uuid,
  ADD COLUMN IF NOT EXISTS end_reason text;

ALTER TABLE public.practice_members DROP CONSTRAINT IF EXISTS practice_members_end_reason_check;
ALTER TABLE public.practice_members
  ADD CONSTRAINT practice_members_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN ('left', 'ended_by_practice'));

COMMENT ON COLUMN public.practice_members.end_reason IS
  'Why the current period of membership ended: left (the member''s own act) or ended_by_practice. '
  'NULL while active, and on rows ended before this column existed. The full history is in practice_membership_events.';

-- ---------------------------------------------------------------------------
-- 2. The ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.practice_membership_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id   uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  member_id     uuid,
  user_id       uuid NOT NULL,
  event_type    text NOT NULL CHECK (event_type IN (
    'joined', 'ended', 'rejoined', 'status_changed', 'role_changed', 'view_all_changed'
  )),
  actor_user_id uuid,
  reason        text,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_membership_events_member
  ON public.practice_membership_events (practice_id, user_id, created_at DESC);

-- Written only by the trigger below. Default privileges hand a new table ALL,
-- so revoke before granting.
REVOKE ALL ON public.practice_membership_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_membership_events TO authenticated;
GRANT ALL ON public.practice_membership_events TO service_role;

ALTER TABLE public.practice_membership_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers and the member read membership history" ON public.practice_membership_events;
CREATE POLICY "Managers and the member read membership history"
ON public.practice_membership_events FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_practice(practice_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- The history of who ended whose access is only worth anything if it cannot be
-- edited afterwards, by anyone.
CREATE OR REPLACE FUNCTION public.refuse_membership_event_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Membership history is append-only' USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refuse_membership_event_edit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refuse_membership_event_edit ON public.practice_membership_events;
CREATE TRIGGER trg_refuse_membership_event_edit
  BEFORE UPDATE ON public.practice_membership_events
  FOR EACH ROW EXECUTE FUNCTION public.refuse_membership_event_edit();

-- ---------------------------------------------------------------------------
-- 3. The guard on the row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_practice_member_standing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  -- A client may still edit the other member settings (invite rights and the
  -- like) under the manager UPDATE policy. Standing is not one of them.
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.status IS DISTINCT FROM OLD.status
          OR NEW.role IS DISTINCT FROM OLD.role
          OR NEW.can_view_all_patients IS DISTINCT FROM OLD.can_view_all_patients
          OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
          OR NEW.ended_by IS DISTINCT FROM OLD.ended_by
          OR NEW.end_reason IS DISTINCT FROM OLD.end_reason) THEN
    RAISE EXCEPTION 'Membership status, role and patient scope change only through end_practice_membership, leave_practice or change_practice_member_access'
      USING ERRCODE = '42501';
  END IF;

  -- The owner rules. They bind every end-user request, whichever definer it
  -- came through; a request with no signed-in user (the service role, a
  -- migration) is the platform's own escape hatch and is let by.
  IF _actor IS NOT NULL
     AND OLD.role = 'owner' AND OLD.status = 'active'
     AND (NEW.role IS DISTINCT FROM 'owner' OR NEW.status IS DISTINCT FROM 'active') THEN
    -- Serialise concurrent owner changes on one tenant, or two owners leaving
    -- at once would each see the other still there.
    PERFORM 1 FROM public.practices WHERE id = NEW.practice_id FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.practice_id = NEW.practice_id
         AND pm.user_id = _actor
         AND pm.role = 'owner'
         AND pm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Only an owner can end or change another owner''s membership'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.practice_id = NEW.practice_id
         AND pm.id <> NEW.id
         AND pm.role = 'owner'
         AND pm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'This is the last owner of the hospital — appoint another owner first'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Someone who left of their own accord is not put back by a manager: that
  -- would enrol them without agreeing to it. They are invited and accept.
  IF _actor IS NOT NULL
     AND OLD.status IS DISTINCT FROM 'active' AND NEW.status = 'active'
     AND OLD.end_reason = 'left'
     AND _actor IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'This person left the practice themselves. Invite them again instead.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' THEN
    NEW.ended_at := now();
    NEW.ended_by := _actor;
    IF NEW.end_reason IS NOT DISTINCT FROM OLD.end_reason THEN
      NEW.end_reason := CASE WHEN _actor IS NOT NULL AND _actor = NEW.user_id
                             THEN 'left' ELSE 'ended_by_practice' END;
    END IF;
  ELSIF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    -- A new period. The previous ending stays in the ledger.
    NEW.ended_at := NULL;
    NEW.ended_by := NULL;
    NEW.end_reason := NULL;
  END IF;

  -- A member moved off the clinical side does not keep the wide view it gave
  -- them as a clinician (G8). A manager may grant it again deliberately, and
  -- even then the clinical gates are role-checked.
  IF NEW.role IS DISTINCT FROM OLD.role
     AND public.practice_role_is_clinical(OLD.role)
     AND NOT public.practice_role_is_clinical(NEW.role) THEN
    NEW.can_view_all_patients := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_practice_member_standing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_practice_member_standing ON public.practice_members;
CREATE TRIGGER trg_guard_practice_member_standing
  BEFORE UPDATE ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_member_standing();

-- ---------------------------------------------------------------------------
-- 4. The ledger, department rows and the audit row, on every path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_practice_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor   uuid := auth.uid();
  _reason  text := NULLIF(current_setting('onecare.membership_reason', true), '');
  _event   text;
  _depts   jsonb := '[]'::jsonb;
  _details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'joined';
  ELSIF OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' THEN
    _event := 'ended';
  ELSIF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    -- Approval of a request is not a return.
    _event := CASE WHEN OLD.status IN ('pending_approval', 'rejected')
                   THEN 'status_changed' ELSE 'rejoined' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _event := 'status_changed';
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    _event := 'role_changed';
  ELSIF NEW.can_view_all_patients IS DISTINCT FROM OLD.can_view_all_patients THEN
    _event := 'view_all_changed';
  ELSE
    RETURN NULL;
  END IF;

  -- Department duties end with the membership, including a lead role, on
  -- every path. What was held is kept in the ledger entry.
  IF _event = 'ended' THEN
    WITH gone AS (
      DELETE FROM public.practice_department_members
       WHERE practice_id = NEW.practice_id AND user_id = NEW.user_id
      RETURNING department_id, is_lead
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('department_id', department_id, 'is_lead', is_lead)), '[]'::jsonb)
      INTO _depts
      FROM gone;
  END IF;

  _details := jsonb_strip_nulls(jsonb_build_object(
    'from_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
    'to_status',   NEW.status,
    'from_role',   CASE WHEN TG_OP = 'UPDATE' THEN OLD.role::text END,
    'to_role',     NEW.role::text,
    'from_view_all', CASE WHEN TG_OP = 'UPDATE' THEN OLD.can_view_all_patients END,
    'to_view_all',   NEW.can_view_all_patients,
    'end_reason',  NEW.end_reason
  ));
  IF _event = 'ended' THEN
    _details := _details || jsonb_build_object('departments', _depts);
  END IF;

  INSERT INTO public.practice_membership_events
    (practice_id, member_id, user_id, event_type, actor_user_id, reason, details)
  VALUES
    (NEW.practice_id, NEW.id, NEW.user_id, _event, _actor, _reason, _details);

  -- Server-side changes have no person to attribute, as in log_record_change.
  IF _actor IS NOT NULL THEN
    INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (
      _actor,
      'practice_membership_' || _event,
      'practice_member',
      NEW.id::text,
      _details || jsonb_strip_nulls(jsonb_build_object(
        'practice_id', NEW.practice_id,
        'member_user_id', NEW.user_id,
        'reason', _reason
      ))
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_practice_membership_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_practice_membership_change ON public.practice_members;
CREATE TRIGGER trg_record_practice_membership_change
  AFTER INSERT OR UPDATE ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.record_practice_membership_change();

-- ---------------------------------------------------------------------------
-- 5. No client deletes a membership
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Practice managers can remove members" ON public.practice_members;
REVOKE DELETE, TRUNCATE ON public.practice_members FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The functions
-- ---------------------------------------------------------------------------

/**
 * A manager ends someone's membership. Idempotent: ending a membership that is
 * not active changes nothing and writes no second event.
 *
 * The owner rules, the end stamp, the ledger, the audit row and the removal of
 * department rows all happen in the triggers, so this function and the older
 * set_practice_affiliation_status cannot disagree about them.
 */
CREATE OR REPLACE FUNCTION public.end_practice_membership(
  _practice_id uuid,
  _user_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only a practice owner or admin can end someone''s membership'
      USING ERRCODE = '42501';
  END IF;

  SELECT status INTO _status
    FROM public.practice_members
   WHERE practice_id = _practice_id AND user_id = _user_id
   FOR UPDATE;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'That person is not a member of this practice';
  END IF;
  IF _status <> 'active' THEN
    RETURN;
  END IF;

  PERFORM set_config('onecare.membership_reason', COALESCE(NULLIF(btrim(_reason), ''), ''), true);
  UPDATE public.practice_members
     SET status = 'revoked',
         end_reason = CASE WHEN _user_id = auth.uid() THEN 'left' ELSE 'ended_by_practice' END
   WHERE practice_id = _practice_id AND user_id = _user_id;
  PERFORM set_config('onecare.membership_reason', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.end_practice_membership(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_practice_membership(uuid, uuid, text) TO authenticated;

/**
 * A member leaves a practice of their own accord. Their private patients are
 * untouched; what they wrote stays attributed to them and readable by them.
 */
CREATE OR REPLACE FUNCTION public.leave_practice(
  _practice_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT status INTO _status
    FROM public.practice_members
   WHERE practice_id = _practice_id AND user_id = auth.uid()
   FOR UPDATE;

  IF _status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'You are not an active member of this practice';
  END IF;

  PERFORM set_config('onecare.membership_reason', COALESCE(NULLIF(btrim(_reason), ''), ''), true);
  UPDATE public.practice_members
     SET status = 'revoked',
         end_reason = 'left'
   WHERE practice_id = _practice_id AND user_id = auth.uid();
  PERFORM set_config('onecare.membership_reason', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_practice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_practice(uuid, text) TO authenticated;

/**
 * A manager changes a member's role or whether they see every patient. NULL
 * leaves that setting as it is.
 *
 * Only an owner makes someone an owner; without that an admin could promote
 * themselves past the owner rules the row enforces.
 */
CREATE OR REPLACE FUNCTION public.change_practice_member_access(
  _practice_id uuid,
  _user_id uuid,
  _role public.practice_role DEFAULT NULL,
  _can_view_all_patients boolean DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current public.practice_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only a practice owner or admin can change a member''s access'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _current
    FROM public.practice_members
   WHERE practice_id = _practice_id AND user_id = _user_id
   FOR UPDATE;

  IF _current.id IS NULL THEN
    RAISE EXCEPTION 'That person is not a member of this practice';
  END IF;
  IF _current.status <> 'active' THEN
    RAISE EXCEPTION 'This membership has ended; restore or re-invite them first';
  END IF;

  IF _role = 'owner' AND _current.role IS DISTINCT FROM 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id AND pm.user_id = auth.uid()
       AND pm.role = 'owner' AND pm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only an owner can make someone an owner'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('onecare.membership_reason', COALESCE(NULLIF(btrim(_reason), ''), ''), true);
  UPDATE public.practice_members
     SET role = COALESCE(_role, role),
         can_view_all_patients = COALESCE(_can_view_all_patients, can_view_all_patients)
   WHERE id = _current.id;
  PERFORM set_config('onecare.membership_reason', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_practice_member_access(uuid, uuid, public.practice_role, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_practice_member_access(uuid, uuid, public.practice_role, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Author writes need current access (G1)
-- ---------------------------------------------------------------------------

/**
 * Whether the caller may still write clinically about this patient now: the
 * provider share, or the institution's clinical pathway, and where the row
 * belongs to a practice, an active clinical membership of that practice.
 *
 * The practice clause is what stops a leaver who also treats the same patient
 * privately from finishing the hospital's draft through their private share.
 */
CREATE OR REPLACE FUNCTION public.has_current_clinical_access(
  _patient_user_id uuid,
  _practice_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR _patient_user_id IS NULL THEN false ELSE
    (public.clinician_has_patient_access(_patient_user_id)
     OR public.institution_has_clinical_access(_patient_user_id))
    AND (
      _practice_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.practice_members pm
         WHERE pm.practice_id = _practice_id
           AND pm.user_id = auth.uid()
           AND pm.status = 'active'
           AND public.practice_role_is_clinical(pm.role)
      )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.has_current_clinical_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_clinical_access(uuid, uuid) TO authenticated;

-- Encounters: editing and signing a draft, and the post-signing edits
-- protect_signed_encounter allows (retraction, sharing), are writes.
DROP POLICY IF EXISTS "Authors update own encounters" ON public.encounters;
CREATE POLICY "Authors update own encounters"
ON public.encounters FOR UPDATE TO authenticated
USING (
  clinician_user_id = auth.uid()
  AND public.has_current_clinical_access(patient_user_id, practice_id)
)
WITH CHECK (
  clinician_user_id = auth.uid()
  AND public.has_current_clinical_access(patient_user_id, practice_id)
);

-- Addenda: the author arm let a leaver annotate a note they could no longer
-- read through any pathway, and institution_has_patient_access let billing in.
DROP POLICY IF EXISTS "Clinicians add addenda to notes they can reach" ON public.encounter_addenda;
CREATE POLICY "Clinicians add addenda to notes they can reach"
ON public.encounter_addenda FOR INSERT TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
      FROM public.encounters e
     WHERE e.id = encounter_addenda.encounter_id
       AND public.has_current_clinical_access(e.patient_user_id, e.practice_id)
  )
);

-- Internal notes: a team note is the team's record. A private note is the
-- author's own jotting and is left to them. USING reads the old row, so a
-- leaver cannot first flip a team note to private and then rewrite it.
DROP POLICY IF EXISTS "Authors update their internal notes" ON public.internal_notes;
CREATE POLICY "Authors update their internal notes"
ON public.internal_notes FOR UPDATE TO authenticated
USING (
  auth.uid() = author_user_id
  AND (visibility <> 'team' OR public.has_current_clinical_access(patient_user_id))
)
WITH CHECK (
  auth.uid() = author_user_id
  AND (visibility <> 'team' OR public.has_current_clinical_access(patient_user_id))
);

DROP POLICY IF EXISTS "Authors delete their internal notes" ON public.internal_notes;
CREATE POLICY "Authors delete their internal notes"
ON public.internal_notes FOR DELETE TO authenticated
USING (
  auth.uid() = author_user_id
  AND (visibility <> 'team' OR public.has_current_clinical_access(patient_user_id))
);

-- Managed records filed for a hospital are the hospital's. The author arm now
-- needs the same current standing at that practice that filing one did.
-- A solo record (practice_id NULL) is unchanged.
DROP POLICY IF EXISTS "Clinicians update their own unclaimed patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians update their own unclaimed patient records"
ON public.clinician_patient_records FOR UPDATE TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND linked_user_id IS NULL
  AND (practice_id IS NULL OR public.may_manage_practice_patient_records(practice_id))
)
WITH CHECK (
  auth.uid() = clinician_user_id
  AND linked_user_id IS NULL
  AND (practice_id IS NULL OR public.may_manage_practice_patient_records(practice_id))
);

DROP POLICY IF EXISTS "Clinicians delete only unclaimed patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians delete only unclaimed patient records"
ON public.clinician_patient_records FOR DELETE TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND linked_user_id IS NULL
  AND (practice_id IS NULL OR public.may_manage_practice_patient_records(practice_id))
);

-- ---------------------------------------------------------------------------
-- 8. Messaging as a clinician is a clinical act (G8)
-- ---------------------------------------------------------------------------
-- The read policy is left as it is; which institutional threads a clinician
-- reads is phase 3 of the plan.
DROP POLICY IF EXISTS "Clinicians can send messages" ON public.messages;
CREATE POLICY "Clinicians can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = clinician_user_id
  AND auth.uid() = sender_user_id
  AND (public.clinician_has_patient_access(patient_user_id)
       OR public.institution_has_clinical_access(patient_user_id))
);

DROP POLICY IF EXISTS "Recipient can update read status (clinician)" ON public.messages;
CREATE POLICY "Recipient can update read status (clinician)"
ON public.messages FOR UPDATE TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND sender_user_id <> auth.uid()
  AND (public.clinician_has_patient_access(patient_user_id)
       OR public.institution_has_clinical_access(patient_user_id))
)
WITH CHECK (
  auth.uid() = clinician_user_id
  AND sender_user_id <> auth.uid()
  AND (public.clinician_has_patient_access(patient_user_id)
       OR public.institution_has_clinical_access(patient_user_id))
);