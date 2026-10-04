-- Hospital owners and admins are ops-only unless they take a clinical seat.
--
-- Today owner and admin are on the clinical allowlist in every tenant ("in most
-- practices the owner is the doctor"). That is right for a practice and wrong
-- for a hospital, where the people who run the account (team, billing,
-- settings) are administrators, not clinicians, and must not read patient
-- records by virtue of that role.
--
--   clinical member =
--        role in (sub_admin, provider, clinician, nurse)           -- by role, unchanged
--     OR role in (owner, admin) AND
--        ( the tenant is not a hospital                            -- unchanged, flag ignored
--          OR practice_members.clinical_seat )                     -- a hospital owner/admin needs a seat
--
-- Scope of this step:
--   * practice_role_is_clinical(role) is untouched (it still says owner/admin
--     are clinical by role). Every decision about a MEMBER now goes through the
--     tenant-aware practice_member_is_clinical(practice_id, role, clinical_seat).
--   * practice_members.clinical_seat is backfilled TRUE for every existing
--     owner/admin row in every tenant, so nobody loses access when this ships.
--   * New hospital owner/admin rows start false (ops-only). A seat is taken with
--     set_member_clinical_seat, or carried by a tenant owner invitation.
--   * The flag is pinned: a client cannot write it (only the RPC, the service
--     role or a platform admin can).
--   * Nothing changes for a non-hospital tenant: owner/admin stay clinical
--     whatever the flag says.

-- ---------------------------------------------------------------------------
-- 1. The column, and the backfill (before any trigger learns about it)
-- ---------------------------------------------------------------------------
ALTER TABLE public.practice_members
  ADD COLUMN IF NOT EXISTS clinical_seat boolean NOT NULL DEFAULT false;

UPDATE public.practice_members
   SET clinical_seat = true
 WHERE role IN ('owner', 'admin')
   AND clinical_seat IS NOT TRUE;

COMMENT ON COLUMN public.practice_members.clinical_seat IS
  'Whether an owner or admin takes a clinical seat for themselves. Only meaningful for owner/admin rows of a HOSPITAL tenant (there, an owner/admin without a seat is ops-only). Ignored for every other role and for non-hospital tenants. Pinned: written only by set_member_clinical_seat, the service role or a platform admin.';

-- A tenant owner invitation can carry the seat the new owner will hold. Default
-- false: a hospital owner invited by the platform is ops-only unless it says so.
ALTER TABLE public.tenant_owner_invitations
  ADD COLUMN IF NOT EXISTS clinical_seat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_owner_invitations.clinical_seat IS
  'Whether the owner takes a clinical seat on accepting. Only meaningful for a hospital tenant. Platform-set (service role / platform admin).';

-- ---------------------------------------------------------------------------
-- 2. The definitions
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the answer does not depend on the caller being able to
-- read practices (a trigger that runs as the signed-in user must not see a
-- hospital as "not found" and fail open). A missing practice is treated as a
-- non-hospital, i.e. exactly today's behaviour.
CREATE OR REPLACE FUNCTION public.practice_member_is_clinical(
  _practice_id uuid, _role public.practice_role, _clinical_seat boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.practice_role_is_clinical(_role)
     AND (_role NOT IN ('owner', 'admin')
          OR coalesce(_clinical_seat, false)
          OR NOT EXISTS (SELECT 1 FROM public.practices p
                          WHERE p.id = _practice_id AND p.tenant_type = 'hospital'));
$$;

COMMENT ON FUNCTION public.practice_member_is_clinical(uuid, public.practice_role, boolean) IS
  'Whether a member may read clinical content: a clinical role, or an owner/admin who either works in a non-hospital tenant or holds a clinical seat in a hospital. Allowlist: a role added later is not clinical until somebody decides.';

REVOKE ALL ON FUNCTION public.practice_member_is_clinical(uuid, public.practice_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_member_is_clinical(uuid, public.practice_role, boolean)
  TO authenticated, service_role;

-- Whether a membership ledger event (practice_membership_events.details)
-- describes a clinical member on its "from" or "to" side. Events written before
-- clinical seats carry no flag; in their day the role alone decided.
CREATE OR REPLACE FUNCTION public._event_was_clinical(_details jsonb, _side text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (_details ->> (_side || '_clinical'))::boolean,
    public.practice_role_is_clinical((_details ->> (_side || '_role'))::public.practice_role)
  );
$$;

REVOKE ALL ON FUNCTION public._event_was_clinical(jsonb, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Keeping the flag honest
-- ---------------------------------------------------------------------------
-- Runs before every other BEFORE trigger on the table (trg_a_ sorts first):
--  * a flag on a row that is not owner/admin is meaningless and stored false;
--  * a client cannot insert a row that already holds a seat;
--  * a seat does not survive the end of a membership (a returning owner/admin
--    is re-seated deliberately, never by a stale flag);
--  * a clinician moved up to admin keeps their clinical standing (the seat is
--    set for them), so a promotion is not a silent loss of access.
CREATE OR REPLACE FUNCTION public.normalise_member_clinical_seat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND current_user IN ('authenticated', 'anon') THEN
    NEW.clinical_seat := false;
  END IF;

  IF NEW.role NOT IN ('owner', 'admin') THEN
    NEW.clinical_seat := false;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM 'active' THEN
    NEW.clinical_seat := false;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.role IS DISTINCT FROM OLD.role
        AND OLD.role NOT IN ('owner', 'admin')
        AND public.practice_role_is_clinical(OLD.role) THEN
    NEW.clinical_seat := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_normalise_member_clinical_seat ON public.practice_members;
CREATE TRIGGER trg_a_normalise_member_clinical_seat
  BEFORE INSERT OR UPDATE ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.normalise_member_clinical_seat();

REVOKE ALL ON FUNCTION public.normalise_member_clinical_seat() FROM PUBLIC, anon, authenticated;

-- Turning a seat off ends that person's clinical work the way a move to a
-- non-clinical role does: their assignments close. (hand_over_departed_work
-- already fires on every update and freezes their unsigned work.)
DROP TRIGGER IF EXISTS trg_end_assignments_of_departed_member ON public.practice_members;
CREATE TRIGGER trg_end_assignments_of_departed_member
  AFTER UPDATE OF status, role, clinical_seat ON public.practice_members
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status
        OR NEW.role IS DISTINCT FROM OLD.role
        OR NEW.clinical_seat IS DISTINCT FROM OLD.clinical_seat)
  EXECUTE FUNCTION public.end_assignments_of_departed_member();

-- A practice converted to a hospital keeps its owners and admins clinical: they
-- are given a seat at that moment, so conversion cuts nobody off.
CREATE OR REPLACE FUNCTION public.seat_owners_on_hospital_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.practice_members
     SET clinical_seat = true
   WHERE practice_id = NEW.id
     AND role IN ('owner', 'admin')
     AND status = 'active'
     AND clinical_seat IS NOT TRUE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.seat_owners_on_hospital_conversion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seat_owners_on_hospital_conversion ON public.practices;
CREATE TRIGGER trg_seat_owners_on_hospital_conversion
  AFTER UPDATE OF tenant_type ON public.practices
  FOR EACH ROW
  WHEN (NEW.tenant_type = 'hospital' AND OLD.tenant_type IS DISTINCT FROM 'hospital')
  EXECUTE FUNCTION public.seat_owners_on_hospital_conversion();

-- ---------------------------------------------------------------------------
-- 4. The audit trail knows about seats
-- ---------------------------------------------------------------------------
ALTER TABLE public.practice_membership_events
  DROP CONSTRAINT IF EXISTS practice_membership_events_event_type_check;
ALTER TABLE public.practice_membership_events
  ADD CONSTRAINT practice_membership_events_event_type_check
  CHECK (event_type IN ('joined', 'ended', 'rejoined', 'status_changed', 'role_changed',
                        'view_all_changed', 'clinical_seat_changed'));

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
  ELSIF NEW.clinical_seat IS DISTINCT FROM OLD.clinical_seat THEN
    _event := 'clinical_seat_changed';
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
    'from_clinical_seat', CASE WHEN TG_OP = 'UPDATE' THEN OLD.clinical_seat END,
    'to_clinical_seat',   NEW.clinical_seat,
    'from_clinical', CASE WHEN TG_OP = 'UPDATE'
                          THEN public.practice_member_is_clinical(OLD.practice_id, OLD.role, OLD.clinical_seat) END,
    'to_clinical',   public.practice_member_is_clinical(NEW.practice_id, NEW.role, NEW.clinical_seat),
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

-- ---------------------------------------------------------------------------
-- 5. Every function that decides clinical reach, now tenant- and seat-aware
--
-- Same bodies as before (taken from the live definitions) with
-- practice_role_is_clinical(pm.role) replaced by
-- practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat).
-- Four carry a further change:
--   guard_practice_member_standing  pins clinical_seat against client writes;
--   practice_thread_readable        an ended-share thread is read by an owner or
--                                   admin only if they are clinical members;
--   practice_handover_queue         a seat turned off is a clinical work ending,
--                                   like a move to a non-clinical role;
--   hand_over_departed_work         an owner/admin who is not a clinical member
--                                   is not told which patient a departed draft
--                                   was for (they cannot open it).
-- ---------------------------------------------------------------------------

-- end_assignments_of_departed_member
CREATE OR REPLACE FUNCTION public.end_assignments_of_departed_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active'
     OR NOT public.practice_member_is_clinical(NEW.practice_id, NEW.role, NEW.clinical_seat) THEN
    UPDATE public.practice_patient_assignments
       SET effective_to = now()
     WHERE practice_id = NEW.practice_id
       AND clinician_user_id = NEW.user_id
       AND (effective_to IS NULL OR effective_to > now());
  END IF;
  RETURN NULL;
END;
$function$;

-- guard_practice_member_standing
CREATE OR REPLACE FUNCTION public.guard_practice_member_standing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  -- The clinical seat is pinned. A client cannot write it, nor can a manager
  -- under the UPDATE policy; set_member_clinical_seat (a definer) is the route.
  -- The service role and a platform admin are trusted.
  IF current_user IN ('authenticated', 'anon')
     AND NEW.clinical_seat IS DISTINCT FROM OLD.clinical_seat
     AND NOT public._is_trusted_writer() THEN
    RAISE EXCEPTION 'The clinical seat changes only through set_member_clinical_seat'
      USING ERRCODE = '42501';
  END IF;

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
     AND public.practice_member_is_clinical(OLD.practice_id, OLD.role, OLD.clinical_seat)
     AND NOT public.practice_member_is_clinical(NEW.practice_id, NEW.role, NEW.clinical_seat) THEN
    NEW.can_view_all_patients := false;
  END IF;

  RETURN NEW;
END;
$function$;

-- hand_over_departed_work
CREATE OR REPLACE FUNCTION public.hand_over_departed_work()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _frozen    jsonb;
  _item      jsonb;
  _patient   uuid;
  _who       uuid;
  _leaver    text := public.notice_person_name(NEW.user_id);
  _practice  text;
  _message   text;
  _left      boolean := OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active';
  _moved     boolean := OLD.status = 'active' AND NEW.status = 'active'
                        AND public.practice_member_is_clinical(OLD.practice_id, OLD.role, OLD.clinical_seat)
                        AND NOT public.practice_member_is_clinical(NEW.practice_id, NEW.role, NEW.clinical_seat);
BEGIN
  IF NOT (_left OR _moved) THEN
    RETURN NULL;
  END IF;

  SELECT name INTO _practice FROM public.practices WHERE id = NEW.practice_id;
  _practice := COALESCE(_practice, 'the practice');

  -- Collected first: a loop cannot run over a statement that writes.
  WITH frozen_notes AS (
      UPDATE public.encounters
         SET author_departed_at = now()
       WHERE practice_id = NEW.practice_id
         AND clinician_user_id = NEW.user_id
         AND signed_at IS NULL
         AND author_departed_at IS NULL
         AND COALESCE(status, '') NOT IN ('entered-in-error', 'cancelled')
      RETURNING id, patient_user_id, created_at, 'note'::text AS kind
    ), frozen_dictations AS (
      UPDATE public.clinician_dictations
         SET author_departed_at = now()
       WHERE practice_id = NEW.practice_id
         AND clinician_user_id = NEW.user_id
         AND filed_at IS NULL
         AND status <> 'filed'
         AND archived_at IS NULL
         AND author_departed_at IS NULL
      RETURNING id, patient_user_id, created_at, 'dictation'::text AS kind
    )
  SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO _frozen
    FROM (SELECT * FROM frozen_notes UNION ALL SELECT * FROM frozen_dictations) f;

  FOR _item IN SELECT * FROM jsonb_array_elements(_frozen)
  LOOP
    _patient := (_item ->> 'patient_user_id')::uuid;
    _message := format(
      '%s %s with an %s for %s, started %s. It is kept as they left it until someone signs it off, marks it entered in error, or archives it.',
      _leaver,
      CASE WHEN _moved THEN 'moved to a non-clinical role at ' || _practice ELSE 'left ' || _practice END,
      CASE _item ->> 'kind' WHEN 'note' THEN 'unsigned note' ELSE 'unfiled dictation' END,
      public.notice_patient_name(_patient),
      to_char((_item ->> 'created_at')::timestamptz, 'DD Mon YYYY'));

    FOR _who IN
      SELECT pm.user_id
        FROM public.practice_members pm
       WHERE pm.practice_id = NEW.practice_id
         AND pm.status = 'active'
         AND pm.role IN ('owner', 'admin')
      UNION
      SELECT pdm.user_id
        FROM public.practice_patient_departments ppd
        JOIN public.practice_department_members pdm
          ON pdm.department_id = ppd.department_id AND pdm.is_lead
        JOIN public.practice_members pm
          ON pm.practice_id = pdm.practice_id AND pm.user_id = pdm.user_id AND pm.status = 'active'
       WHERE ppd.practice_id = NEW.practice_id
         AND ppd.patient_user_id = _patient
         AND ppd.effective_to IS NULL
    LOOP
      CONTINUE WHEN _who = NEW.user_id;
      -- An owner or admin without a clinical seat (a hospital's ops-only account
      -- holder) cannot open the note, so is not told whose patient it is for.
      CONTINUE WHEN NOT public.member_is_active_clinician(NEW.practice_id, _who)
                AND EXISTS (SELECT 1 FROM public.practice_members o
                             WHERE o.practice_id = NEW.practice_id AND o.user_id = _who
                               AND o.status = 'active' AND o.role IN ('owner', 'admin'));
      CONTINUE WHEN NOT public.notification_allowed(_who, 'departed_work_handover', 'in_app');
      INSERT INTO public.clinician_guidance_notifications (
        clinician_user_id, patient_user_id, notification_type, practice_id, message, related_id
      ) VALUES (
        _who, _patient, 'departed_author_drafts', NEW.practice_id, _message, (_item ->> 'id')::uuid
      );
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- has_current_clinical_access
CREATE OR REPLACE FUNCTION public.has_current_clinical_access(_patient_user_id uuid, _practice_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
      )
    )
  END;
$function$;

-- institution_has_clinical_access
CREATE OR REPLACE FUNCTION public.institution_has_clinical_access(patient_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$function$;

-- institution_has_clinical_permission
CREATE OR REPLACE FUNCTION public.institution_has_clinical_permission(patient_user_id uuid, _category text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
      AND (
        ps.share_all = true
        OR public.share_grants(ps.permissions, _category)
      )
  ) END;
$function$;

-- is_assigned_to_patient
CREATE OR REPLACE FUNCTION public.is_assigned_to_patient(_user_id uuid, _patient_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.user_id = _user_id
      AND pm.status = 'active'
      AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
      AND public.is_assigned_to_patient_in_practice(_user_id, _patient_user_id, pm.practice_id)
  );
$function$;

-- is_clinical_practice_member
CREATE OR REPLACE FUNCTION public.is_clinical_practice_member(_practice_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL OR _practice_id IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id
       AND pm.user_id = auth.uid()
       AND pm.status = 'active'
       AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
  ) END;
$function$;

-- may_manage_practice_patient_records
CREATE OR REPLACE FUNCTION public.may_manage_practice_patient_records(_practice_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = _practice_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.role IN ('owner', 'admin', 'sub_admin')
        OR public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
        OR COALESCE(pm.can_invite_patients, false)
      )
  );
$function$;

-- may_read_practice_patient_record
CREATE OR REPLACE FUNCTION public.may_read_practice_patient_record(_practice_id uuid, _linked_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL OR _practice_id IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id = _practice_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
      AND (
        _linked_user_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.practice_shares ps
          WHERE ps.practice_id = _practice_id
            AND ps.user_id = _linked_user_id
            AND ps.is_active = true
            AND ps.practice_suspended_at IS NULL
            AND (
              pm.can_view_all_patients = true
              OR public.is_assigned_to_patient_in_practice(auth.uid(), _linked_user_id, _practice_id)
            )
        )
      )
  ) END;
$function$;

-- member_is_active_clinician
CREATE OR REPLACE FUNCTION public.member_is_active_clinician(_practice_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id
       AND pm.user_id = _user_id
       AND pm.status = 'active'
       AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
  );
$function$;

-- message_thread_practice
CREATE OR REPLACE FUNCTION public.message_thread_practice(_patient uuid, _clinician uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _patient IS NULL OR _clinician IS NULL THEN NULL
    WHEN auth.uid() IS NOT NULL AND auth.uid() NOT IN (_patient, _clinician) THEN NULL
    WHEN public.clinician_still_reaches_patient(_clinician, _patient) THEN NULL
    ELSE COALESCE(
      (SELECT m.practice_id FROM public.messages m
        WHERE m.patient_user_id = _patient
          AND m.clinician_user_id = _clinician
          AND m.practice_id IS NOT NULL
        ORDER BY m.created_at DESC
        LIMIT 1),
      (SELECT ps.practice_id
         FROM public.practice_shares ps
         JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
        WHERE ps.user_id = _patient
          AND ps.is_active = true
          AND ps.practice_suspended_at IS NULL
          AND pm.user_id = _clinician
          AND pm.status = 'active'
          AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
        ORDER BY public.is_assigned_to_patient_in_practice(_clinician, _patient, ps.practice_id) DESC,
                 pm.created_at, ps.practice_id
        LIMIT 1)
    )
  END;
$function$;

-- message_thread_readers_exist
CREATE OR REPLACE FUNCTION public.message_thread_readers_exist(_patient uuid, _clinician uuid, _practice_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _patient IS NULL OR _clinician IS NULL THEN false
    WHEN auth.uid() IS NOT NULL AND auth.uid() NOT IN (_patient, _clinician) THEN false
    WHEN _practice_id IS NULL THEN
      public.clinician_can_see_patient_as(_clinician, _patient, NULL)
    WHEN public.member_is_active_clinician(_practice_id, _clinician) THEN
      -- While they work there, the conversation is theirs alone.
      public.practice_clinical_access_as(_clinician, _practice_id, _patient)
    ELSE EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.practice_id = _practice_id
         AND pm.user_id <> _clinician
         AND pm.status = 'active'
         AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
         AND public.practice_clinical_access_as(pm.user_id, _practice_id, _patient)
    )
  END;
$function$;

-- practice_clinical_access
CREATE OR REPLACE FUNCTION public.practice_clinical_access(_practice_id uuid, _patient_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL OR _practice_id IS NULL OR _patient_user_id IS NULL THEN false ELSE EXISTS (
    SELECT 1
      FROM public.practice_shares ps
      JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
     WHERE ps.practice_id = _practice_id
       AND ps.user_id = _patient_user_id
       AND ps.is_active = true
       AND ps.practice_suspended_at IS NULL
       AND pm.user_id = auth.uid()
       AND pm.status = 'active'
       AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
       AND (pm.can_view_all_patients
            OR public.is_assigned_to_patient_in_practice(auth.uid(), _patient_user_id, _practice_id))
  ) END;
$function$;

-- practice_clinical_access_as
CREATE OR REPLACE FUNCTION public.practice_clinical_access_as(_user uuid, _practice_id uuid, _patient_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user IS NOT NULL AND _practice_id IS NOT NULL AND _patient_user_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.practice_shares ps
      JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
     WHERE ps.practice_id = _practice_id
       AND ps.user_id = _patient_user_id
       AND ps.is_active = true
       AND ps.practice_suspended_at IS NULL
       AND pm.user_id = _user
       AND pm.status = 'active'
       AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
       AND (pm.can_view_all_patients
            OR public.is_assigned_to_patient_in_practice(_user, _patient_user_id, _practice_id))
  );
$function$;

-- practice_handover_queue
CREATE OR REPLACE FUNCTION public.practice_handover_queue(_practice_id uuid)
 RETURNS TABLE(kind text, item_id uuid, patient_user_id uuid, patient_name text, departed_user_id uuid, departed_name text, detail text, since timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _manager boolean := public.can_manage_practice(_practice_id);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF NOT (_manager OR public.is_department_lead(_practice_id)) THEN
    RAISE EXCEPTION 'Only this practice''s owners, admins and department leads see the handover list'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH departed AS (
    SELECT pm.user_id FROM public.practice_members pm
     WHERE pm.practice_id = _practice_id AND pm.status <> 'active'
  ),
  -- The moments someone's clinical work here ended: they left, or were moved
  -- to a role that does not see patients.
  clinical_ends AS (
    SELECT e.user_id, e.created_at, (e.event_type IN ('role_changed', 'clinical_seat_changed')) AS moved
      FROM public.practice_membership_events e
     WHERE e.practice_id = _practice_id
       AND (e.event_type = 'ended'
            OR (e.event_type IN ('role_changed', 'clinical_seat_changed')
                AND public._event_was_clinical(e.details, 'from')
                AND NOT public._event_was_clinical(e.details, 'to')))
  ),
  needs_cover AS (
    -- Patients whose clinician's work here ended and who now have nobody. An
    -- assignment is taken to have ended with it when it closed at that moment
    -- (the same transaction stamps both).
    SELECT DISTINCT ON (ps.user_id)
           'patient'::text AS kind, ps.user_id AS item_id, ps.user_id AS patient_user_id,
           a.clinician_user_id AS departed_user_id,
           'Was with ' || public.notice_person_name(a.clinician_user_id)
             || CASE WHEN e.moved THEN ', who moved to a non-clinical role on ' ELSE ', who left on ' END
             || to_char(e.created_at, 'DD Mon YYYY') || '. Nobody is assigned now.' AS detail,
           e.created_at AS since
      FROM public.practice_shares ps
      JOIN public.practice_patient_assignments a
        ON a.practice_id = ps.practice_id AND a.patient_user_id = ps.user_id AND a.effective_to <= now()
      JOIN clinical_ends e
        ON e.user_id = a.clinician_user_id
       AND a.effective_to BETWEEN e.created_at - interval '1 second' AND e.created_at + interval '1 second'
     WHERE ps.practice_id = _practice_id
       AND ps.is_active AND ps.practice_suspended_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.practice_patient_assignments c
          WHERE c.practice_id = _practice_id AND c.patient_user_id = ps.user_id
            AND (c.effective_to IS NULL OR c.effective_to > now()))
     ORDER BY ps.user_id, e.created_at DESC
  ),
  items AS (
    SELECT nc.kind, nc.item_id, nc.patient_user_id, nc.departed_user_id, nc.detail, nc.since
      FROM needs_cover nc

    UNION ALL
    SELECT 'draft', en.id, en.patient_user_id, en.clinician_user_id,
           CASE WHEN en.clinician_user_id IN (SELECT user_id FROM departed)
                THEN 'Unsigned — author departed. Started '
                ELSE 'Unsigned — author moved to a non-clinical role. Started ' END
             || to_char(en.created_at, 'DD Mon YYYY') || '.',
           en.author_departed_at
      FROM public.encounters en
     WHERE en.practice_id = _practice_id AND en.author_departed_at IS NOT NULL AND en.disposition IS NULL
       AND public.may_resolve_departed_work(_practice_id, en.patient_user_id)

    UNION ALL
    SELECT 'dictation', d.id, d.patient_user_id, d.clinician_user_id,
           CASE WHEN d.clinician_user_id IN (SELECT user_id FROM departed)
                THEN 'Unfiled dictation — author departed. Recorded '
                ELSE 'Unfiled dictation — author moved to a non-clinical role. Recorded ' END
             || to_char(d.created_at, 'DD Mon YYYY') || '.',
           d.author_departed_at
      FROM public.clinician_dictations d
     WHERE d.practice_id = _practice_id AND d.author_departed_at IS NOT NULL AND d.disposition IS NULL
       AND public.may_resolve_departed_work(_practice_id, d.patient_user_id)

    UNION ALL
    SELECT 'task', t.id, t.patient_user_id, t.assignee_user_id,
           'Open task: ' || t.title,
           t.created_at
      FROM public.practice_tasks t
     WHERE _manager
       AND t.practice_id = _practice_id
       AND t.status IN ('open', 'in_progress', 'snoozed')
       AND t.assignee_user_id IN (SELECT user_id FROM departed)

    UNION ALL
    SELECT 'appointment', ap.id, ap.patient_user_id, ap.clinician_user_id,
           'Booked for ' || to_char(ap.start_time, 'DD Mon YYYY HH24:MI') || ' with someone who has left.',
           ap.start_time
      FROM public.fhir_appointments ap
     WHERE _manager
       AND ap.practice_id = _practice_id
       AND ap.start_time > now()
       AND ap.status IN ('proposed', 'pending', 'booked', 'waitlist')
       AND ap.clinician_user_id IN (SELECT user_id FROM departed)

    UNION ALL
    SELECT 'proposal', r.id, r.patient_user_id, r.proposed_by_user_id,
           CASE WHEN r.proposed_by_user_id IN (SELECT user_id FROM departed)
                THEN 'Medication proposal still waiting for the patient, from someone who has left.'
                ELSE 'Medication proposal still waiting for the patient, from someone no longer in a clinical role here.' END,
           r.created_at
      FROM public.record_change_proposals r
     WHERE _manager
       AND r.practice_id = _practice_id
       AND r.status = 'pending'
       AND NOT public.member_is_active_clinician(_practice_id, r.proposed_by_user_id)
  )
  SELECT i.kind, i.item_id, i.patient_user_id,
         (SELECT COALESCE(nullif(btrim(p.name), ''), p.email) FROM public.profiles p WHERE p.user_id = i.patient_user_id),
         i.departed_user_id, public.notice_person_name(i.departed_user_id),
         i.detail, i.since
    FROM items i
   WHERE _manager
      OR i.kind IN ('draft', 'dictation')
      OR (i.kind = 'patient' AND (
            NOT EXISTS (SELECT 1 FROM public.practice_patient_departments ppd
                         WHERE ppd.practice_id = _practice_id AND ppd.patient_user_id = i.patient_user_id
                           AND ppd.effective_to IS NULL)
            OR EXISTS (SELECT 1 FROM public.practice_patient_departments ppd
                        WHERE ppd.practice_id = _practice_id AND ppd.patient_user_id = i.patient_user_id
                          AND ppd.effective_to IS NULL
                          AND ppd.department_id = ANY (public.led_department_ids()))))
   ORDER BY CASE i.kind WHEN 'patient' THEN 0 WHEN 'draft' THEN 1 WHEN 'dictation' THEN 2 ELSE 3 END,
            i.since;
END;
$function$;

-- practice_has_clinical_access
CREATE OR REPLACE FUNCTION public.practice_has_clinical_access(patient_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_uuid
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
      AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
  )
$function$;

-- practice_thread_readable
CREATE OR REPLACE FUNCTION public.practice_thread_readable(_practice_id uuid, _patient uuid, _thread_clinician uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND _practice_id IS NOT NULL AND _patient IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.practice_shares ps
      JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
      JOIN public.practices p ON p.id = ps.practice_id
     WHERE ps.practice_id = _practice_id
       AND ps.user_id = _patient
       AND pm.user_id = auth.uid()
       AND pm.status = 'active'
       AND (
         (public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
          AND ps.practice_suspended_at IS NULL
          AND (pm.can_view_all_patients
               OR (p.is_active AND EXISTS (
                     SELECT 1 FROM public.practice_patient_assignments a
                      WHERE a.practice_id = _practice_id
                        AND a.patient_user_id = _patient
                        AND a.clinician_user_id = auth.uid()
                        AND a.effective_from <= now()
                        AND (a.effective_to IS NULL OR a.effective_to > now()))))
          AND (_thread_clinician = auth.uid()
               OR NOT public.member_is_active_clinician(_practice_id, _thread_clinician)))
         OR (pm.role IN ('owner', 'admin')
             AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
             AND ps.is_active IS NOT TRUE)
       )
  );
$function$;

-- record_context_practice
CREATE OR REPLACE FUNCTION public.record_context_practice(_author uuid, _patient uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _author IS NULL OR _patient IS NULL THEN NULL
    WHEN auth.uid() IS NOT NULL AND auth.uid() <> _author THEN NULL
    WHEN public.clinician_still_reaches_patient(_author, _patient) THEN NULL
    ELSE (
      SELECT ps.practice_id
        FROM public.practice_shares ps
        JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
       WHERE ps.user_id = _patient
         AND ps.is_active = true
         AND ps.practice_suspended_at IS NULL
         AND pm.user_id = _author
         AND pm.status = 'active'
         AND public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat)
       ORDER BY public.is_assigned_to_patient_in_practice(_author, _patient, ps.practice_id) DESC,
                pm.created_at, ps.practice_id
       LIMIT 1
    )
  END;
$function$;

-- stamp_document_origin
CREATE OR REPLACE FUNCTION public.stamp_document_origin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sender   uuid := NEW.uploaded_by_user_id;
  _inst     record;
  _has_inst      boolean;
  _is_private    boolean;
  _provider_name text;
  _name          text;
BEGIN
  -- Nothing the client sent about the origin survives.
  NEW.origin_practice_id   := NULL;
  NEW.origin_practice_name := NULL;
  NEW.origin_role          := NULL;
  NEW.origin_label         := NULL;

  IF _sender IS NULL OR NEW.source_context IS DISTINCT FROM 'clinician_upload' THEN
    RETURN NEW;
  END IF;

  -- The routes the INSERT policy admits: a hospital membership with the
  -- patient on the roster, or a personal share. Clinical membership first.
  SELECT pm.practice_id, pm.role::text AS role, p.name,
         public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat) AS clinical
    INTO _inst
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    JOIN public.practices p ON p.id = ps.practice_id
   WHERE ps.user_id = NEW.user_id
     AND ps.is_active
     AND ps.practice_suspended_at IS NULL
     AND pm.user_id = _sender
     AND pm.status = 'active'
     AND (pm.can_view_all_patients
          OR public.is_assigned_to_patient_in_practice(_sender, NEW.user_id, ps.practice_id))
   ORDER BY public.practice_member_is_clinical(pm.practice_id, pm.role, pm.clinical_seat) DESC, pm.created_at, pm.practice_id
   LIMIT 1;
  _has_inst := FOUND;

  -- The same question the INSERT policy asks of a personal share.
  _is_private := public.clinician_can_see_patient_as(_sender, NEW.user_id, NULL);
  IF _is_private THEN
    SELECT ps.provider_name INTO _provider_name
      FROM public.provider_shares ps
     WHERE ps.user_id = NEW.user_id
       AND ps.clinician_user_id = _sender
       AND ps.is_active
     ORDER BY ps.created_at
     LIMIT 1;
  END IF;

  _name := (
    SELECT nullif(btrim(concat_ws(' ', nullif(btrim(cp.title), ''), nullif(btrim(cp.first_name), ''),
                                   nullif(btrim(cp.last_name), ''))), '')
      FROM public.clinician_profiles cp WHERE cp.user_id = _sender LIMIT 1);

  IF _has_inst AND _inst.clinical THEN
    NEW.origin_practice_id   := _inst.practice_id;
    NEW.origin_practice_name := _inst.name;
    NEW.origin_role          := _inst.role;
    NEW.origin_label := CASE
      WHEN _name IS NOT NULL THEN format('From %s · %s', _name, _inst.name)
      ELSE format('From a clinician at %s', _inst.name)
    END;
  ELSIF _is_private THEN
    NEW.origin_role  := 'private_clinician';
    NEW.origin_label := 'From ' || COALESCE(
      _name,
      nullif(btrim(_provider_name), ''),
      (SELECT nullif(btrim(pr.name), '') FROM public.profiles pr WHERE pr.user_id = _sender LIMIT 1),
      'your clinician');
  ELSIF _has_inst THEN
    -- Not named: the patient needs to know which hospital and that it was
    -- not a clinician, not which receptionist.
    NEW.origin_practice_id   := _inst.practice_id;
    NEW.origin_practice_name := _inst.name;
    NEW.origin_role          := _inst.role;
    NEW.origin_label := format('From %s (%s)', _inst.name, public.document_origin_role_label(_inst.role));

    IF NEW.category NOT IN ('insurance', 'billing', 'other') THEN
      RAISE EXCEPTION 'Front desk and billing staff can send insurance, billing and other paperwork. A clinical document needs to come from a clinical colleague.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  -- No route found: the INSERT policy refuses a client anyway, and a server
  -- insert is left without an origin rather than given a guessed one.

  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 5b. The creator of a tenant row takes a seat
-- ---------------------------------------------------------------------------
-- The practice-creation trigger makes whoever created the row its owner. That
-- person is the one who set the tenant up and, as today, is clinical: they take
-- a clinical seat. A hospital the PLATFORM sets up (admin_create_tenant) never
-- keeps this row (the admin who created it is removed straight away) and its
-- real owner arrives through a tenant owner invitation, whose clinical_seat
-- defaults to false: that owner is ops-only unless the platform sets it.
CREATE OR REPLACE FUNCTION public.add_practice_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.practice_members (
    practice_id,
    user_id,
    role,
    can_invite_patients,
    can_invite_members,
    can_manage_billing,
    can_view_all_patients,
    can_manage_settings,
    status,
    accepted_at,
    clinical_seat
  ) VALUES (
    NEW.id,
    NEW.created_by,
    'owner',
    true,
    true,
    true,
    true,
    true,
    'active',
    now(),
    true
  );
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Capabilities: an ops-only hospital owner/admin does not clinically act
-- ---------------------------------------------------------------------------
-- Same as before, except that an owner or admin who is not a clinical member
-- (only possible in a hospital, without a seat) is refused the capabilities
-- that reach or act on clinical content, whatever a role override says:
-- view_phi, edit_clinical, send_guidance, export_data, bulk_message. They keep
-- manage_team, manage_billing, manage_settings, manage_ehr, view_audit,
-- assign_patients, message_patients and invite_patients.
CREATE OR REPLACE FUNCTION public.has_practice_capability(_user_id uuid, _capability text, _practice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role public.practice_role;
  _seat boolean;
  _override boolean;
BEGIN
  -- A signed-in caller asks about themselves, or about a member of a
  -- practice they manage. Anyone else's role is not theirs to learn.
  IF auth.uid() IS NOT NULL
     AND _user_id IS DISTINCT FROM auth.uid()
     AND NOT public.can_manage_practice(_practice_id) THEN
    RETURN false;
  END IF;

  SELECT pm.role, pm.clinical_seat INTO _role, _seat
  FROM public.practice_members pm
  WHERE pm.user_id = _user_id
    AND pm.practice_id = _practice_id
    AND pm.status = 'active';

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  IF _role IN ('owner', 'admin')
     AND NOT public.practice_member_is_clinical(_practice_id, _role, _seat)
     AND _capability IN ('view_phi', 'edit_clinical', 'send_guidance', 'export_data', 'bulk_message') THEN
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

-- ---------------------------------------------------------------------------
-- 7. Tenant owner invitations carry the seat
-- ---------------------------------------------------------------------------
-- A hospital owner invited by the platform is ops-only unless the invitation
-- says clinical_seat. Re-accepting never takes a seat from someone who already
-- holds one while active.
CREATE OR REPLACE FUNCTION public.accept_tenant_owner_invitation(_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv public.tenant_owner_invitations;
  _confirmed text;
BEGIN
  SELECT * INTO _inv FROM public.tenant_owner_invitations WHERE id = _invitation_id;

  IF _inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF _inv.status <> 'pending' OR _inv.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation is no longer valid';
  END IF;

  _confirmed := public.confirmed_email();
  IF _confirmed IS NULL THEN
    RAISE EXCEPTION 'Confirm your email address before accepting this invitation. Check your inbox for the confirmation link.';
  END IF;

  IF lower(_inv.email) <> _confirmed THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  INSERT INTO public.practice_members (
    practice_id, user_id, role, can_invite_patients, can_invite_members,
    can_manage_billing, can_view_all_patients, can_manage_settings, status, accepted_at,
    clinical_seat
  ) VALUES (
    _inv.practice_id, auth.uid(), 'owner', true, true, true, true, true, 'active', now(),
    _inv.clinical_seat
  )
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active', accepted_at = now(),
        clinical_seat = (practice_members.status = 'active' AND practice_members.clinical_seat)
                        OR EXCLUDED.clinical_seat;

  UPDATE public.tenant_owner_invitations
     SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), updated_at = now()
   WHERE id = _invitation_id;

  RETURN _inv.practice_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. set_member_clinical_seat: the one way to take or give up a seat
-- ---------------------------------------------------------------------------
-- Caller must manage the practice (owner or admin of THAT practice). Applies
-- only to owner/admin rows of a HOSPITAL tenant; anything else is refused with
-- clinical_seat_not_applicable (SQLSTATE OC004; OC001-OC003 belong to other
-- limits).
--
-- Turning ON respects the seat cap. Counting choice: the cap trigger counts all
-- active members, which already includes an ops-only owner/admin, so taking a
-- seat adds no member. We count CLINICIAN seats instead (active clinical
-- members, plus pending invitations to a clinical role, excluding the person
-- being seated) against the same seat limit (_practice_limits.seat_limit) and
-- refuse with seat_limit_reached (OC002) when they already fill it. That bites
-- when a limit has been lowered below what the hospital already uses.
--
-- Turning OFF closes clinical reach at once: every clinical gate reads the flag
-- live, the member's assignments end and their unsigned work is frozen for hand
-- over (triggers on the row). The change is audited through the membership
-- ledger (clinical_seat_changed) and hipaa_audit_logs by the existing trigger.
-- Turning off your own seat, even as the only owner, is allowed: the role and
-- membership are untouched, so the hospital always keeps its owner (this
-- function never ends or demotes anyone).
CREATE OR REPLACE FUNCTION public.set_member_clinical_seat(
  _practice_id uuid,
  _user_id uuid,
  _on boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target public.practice_members;
  _limit integer;
  _used integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '28000';
  END IF;
  IF _on IS NULL THEN
    RAISE EXCEPTION 'Say whether the clinical seat is on or off' USING ERRCODE = '22004';
  END IF;
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only a practice owner or admin can change a clinical seat'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _target
    FROM public.practice_members
   WHERE practice_id = _practice_id AND user_id = _user_id
   FOR UPDATE;

  IF _target.id IS NULL OR _target.status <> 'active' THEN
    RAISE EXCEPTION 'That person is not an active member of this practice'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.practices p
                  WHERE p.id = _practice_id AND p.tenant_type = 'hospital')
     OR _target.role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'clinical_seat_not_applicable'
      USING ERRCODE = 'OC004',
            HINT = 'Clinical seats apply only to owners and admins of a hospital. Every other member is clinical or not by role, and a practice owner or admin is always clinical.';
  END IF;

  -- As elsewhere, an owner's standing is changed by an owner.
  IF _target.role = 'owner' AND _target.user_id <> auth.uid() AND NOT EXISTS (
       SELECT 1 FROM public.practice_members pm
        WHERE pm.practice_id = _practice_id AND pm.user_id = auth.uid()
          AND pm.role = 'owner' AND pm.status = 'active') THEN
    RAISE EXCEPTION 'Only an owner can change another owner''s clinical seat'
      USING ERRCODE = '42501';
  END IF;

  IF _target.clinical_seat = _on THEN
    RETURN;
  END IF;

  IF _on THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('seat_cap:' || _practice_id::text, 0));
    SELECT pl.seat_limit INTO _limit FROM public._practice_limits(_practice_id) pl;
    IF _limit IS NOT NULL THEN
      SELECT (SELECT count(*) FROM public.practice_members m
               WHERE m.practice_id = _practice_id AND m.status = 'active'
                 AND m.id <> _target.id
                 AND public.practice_member_is_clinical(m.practice_id, m.role, m.clinical_seat))::integer
           + (SELECT count(*) FROM public.practice_invitations i
               WHERE i.practice_id = _practice_id AND i.status = 'pending' AND i.expires_at > now()
                 AND i.role IN ('sub_admin', 'provider', 'clinician', 'nurse'))::integer
        INTO _used;
      IF _used >= _limit THEN
        PERFORM public._refuse_seat_cap(_limit, _used);
      END IF;
    END IF;
  END IF;

  PERFORM set_config('onecare.membership_reason',
                     CASE WHEN _on THEN 'clinical seat taken' ELSE 'clinical seat given up' END, true);
  UPDATE public.practice_members
     SET clinical_seat = _on
   WHERE id = _target.id;
  PERFORM set_config('onecare.membership_reason', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_clinical_seat(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_clinical_seat(uuid, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_member_clinical_seat(uuid, uuid, boolean) IS
  'Take or give up a clinical seat. Owner/admin of the practice only; applies to owner/admin rows of a hospital (else OC004 clinical_seat_not_applicable). ON respects the clinician seat cap (seat_limit_reached, OC002). OFF closes clinical reach immediately. Audited via the membership ledger and hipaa_audit_logs.';
