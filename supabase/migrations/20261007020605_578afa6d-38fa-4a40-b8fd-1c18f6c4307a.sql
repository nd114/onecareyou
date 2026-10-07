-- Two things the receiving side of a share was never told.
--
-- When a patient stopped sharing, nothing happened on the clinician's side
-- except that the patient went quiet. Their alert rules stayed listed as
-- active, although a rule that cannot see a reading cannot fire, and a quiet
-- patient with live-looking rules reads the same as a patient who is well. The
-- hospital's owners and admins were not told either. The patient, meanwhile,
-- was shown nothing about what the other side would learn.
--
-- When a department lead routed or assigned a patient who sat under somebody
-- else's department, that was allowed (by decision: leads may route
-- hospital-wide) and it was also invisible to the people accountable for the
-- hospital. The founder's call is that it stays allowed and becomes seen: an
-- audit entry, and a notice the owners and admins can acknowledge.
--
-- Both use the in-app notification table the clinician bell already reads,
-- clinician_guidance_notifications, rather than a second inbox. It gains two
-- types, a stored message, the practice it belongs to, and an acknowledgement.
-- The message is written once, when the event happens, from what the recipient
-- was already allowed to see at that moment: the patient's first name and last
-- initial, never clinical detail. Storing it matters because the recipient
-- loses access to the patient's profile in the same statement that creates the
-- notice.
--
-- Everything is done by triggers, so it holds whichever path ends a share or
-- routes a patient: the patient's own screen, a practice admin ending a share,
-- assign_practice_patient, a direct insert, or the service role.
--
-- Three decisions worth stating:
--
--   * An alert rule is archived only when its clinician has no other live
--     share with the patient. Rules can only be created, and only re-enabled,
--     on a live direct share (clinician_has_patient_access), so that is the
--     rule's own definition of "can still see readings". Archiving a rule the
--     patient is still consenting to through another share would silently
--     switch off a safety alert. The notice says how many rules were archived,
--     and says nothing about rules when none were.
--   * A practice's suspension of its own access moves practice_suspended_at,
--     not is_active, and does not fire any of this. Ending a share from the
--     practice's side does fire it, because the data stops either way; the
--     notice then says the share was ended rather than that the patient
--     stopped sharing.
--   * "Outside the lead's scope" means what practice_patient_overview already
--     means by a lead's patients: those in a department they lead, plus the
--     unrouted queue. So a lead routing or assigning a patient who currently
--     sits only under other departments is flagged, and so is routing into a
--     department they do not lead. Working the unrouted queue is not. Owners
--     and admins are never flagged; they are the people being told.

-- ---------------------------------------------------------------------------
-- 1. The notification table grows, rather than a second one appearing
-- ---------------------------------------------------------------------------

ALTER TABLE public.clinician_guidance_notifications
  ALTER COLUMN guidance_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES public.practices(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS related_id uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid;

DO $$
DECLARE
  _c record;
BEGIN
  FOR _c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.clinician_guidance_notifications'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%notification_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.clinician_guidance_notifications DROP CONSTRAINT %I', _c.conname);
  END LOOP;
END $$;

ALTER TABLE public.clinician_guidance_notifications
  ADD CONSTRAINT clinician_guidance_notifications_notification_type_check
  CHECK (notification_type IN (
    'acknowledged', 'completed', 'expired', 'dismissed',
    'share_ended', 'routed_outside_department'
  )),
  -- A guidance notice without its guidance renders as "Guidance Update" about
  -- nothing; the other types carry their own words instead.
  ADD CONSTRAINT clinician_guidance_notifications_has_subject
  CHECK (
    CASE WHEN notification_type IN ('share_ended', 'routed_outside_department')
         THEN message IS NOT NULL
         ELSE guidance_id IS NOT NULL
    END
  );

COMMENT ON COLUMN public.clinician_guidance_notifications.message IS
  'Written once by the server when the event happens, from what the recipient could already see. Not editable by the recipient.';
COMMENT ON COLUMN public.clinician_guidance_notifications.related_id IS
  'The row the notice is about (the share that ended, the routing or assignment made). Copies sent to several managers share it, which is how one acknowledgement covers them all.';
COMMENT ON COLUMN public.clinician_guidance_notifications.acknowledged_at IS
  'Set only through acknowledge_practice_notice(), by a manager of the practice. Stamped on every manager''s copy at once.';

CREATE INDEX IF NOT EXISTS idx_cgn_practice_open
  ON public.clinician_guidance_notifications(practice_id, notification_type)
  WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cgn_related
  ON public.clinician_guidance_notifications(related_id);

-- A recipient reads their own notices, and a practice's notices only while
-- they still work there: they name a patient, and staff who leave stop seeing
-- that hospital's patients everywhere else too.
DROP POLICY IF EXISTS "Clinicians can view their own notifications" ON public.clinician_guidance_notifications;
CREATE POLICY "Clinicians can view their own notifications"
ON public.clinician_guidance_notifications
FOR SELECT TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND (practice_id IS NULL OR public.is_practice_member(practice_id))
);

DROP POLICY IF EXISTS "Clinicians can update their own notifications" ON public.clinician_guidance_notifications;
CREATE POLICY "Clinicians can update their own notifications"
ON public.clinician_guidance_notifications
FOR UPDATE TO authenticated
USING (
  auth.uid() = clinician_user_id
  AND (practice_id IS NULL OR public.is_practice_member(practice_id))
)
WITH CHECK (auth.uid() = clinician_user_id);

-- The only producers are definer triggers. The client insert policy let any
-- signed-in user put a notice in any clinician's inbox as long as they named
-- themselves as the patient; with a free-text message column that would be a
-- forgery channel into the bell.
DROP POLICY IF EXISTS "Patients can insert notifications for clinicians" ON public.clinician_guidance_notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.clinician_guidance_notifications;

-- Marking read is the one thing a recipient does to a notice. The message and
-- the acknowledgement are not theirs to write.
REVOKE ALL ON public.clinician_guidance_notifications FROM anon, authenticated;
GRANT SELECT ON public.clinician_guidance_notifications TO authenticated;
GRANT UPDATE (is_read) ON public.clinician_guidance_notifications TO authenticated;
GRANT ALL ON public.clinician_guidance_notifications TO service_role;

-- Both new categories are mandatory. The patient is told, when they stop
-- sharing, that the other side will be told; a preference that could mute it
-- would make that sentence untrue. The routing notice is the hospital's
-- oversight of delegated authority, which is not something to opt out of.
CREATE OR REPLACE FUNCTION public.notification_is_mandatory(_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _category IN (
    'account_security',             -- how a person keeps control of their account
    'patient_vital_alert',          -- a threshold the clinician set, on a reading that matters
    'sharing_ended',                -- the patient was told the other side would learn of it
    'department_routing_oversight'  -- the hospital's view of what its leads did
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Helpers (internal: called only from the definer functions below)
-- ---------------------------------------------------------------------------

/** "Ada L." — enough to know who, and no more than the recipient already had. */
CREATE OR REPLACE FUNCTION public.notice_patient_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
               WHEN array_length(s.parts, 1) >= 2
                 THEN s.parts[1] || ' ' || upper(left(s.parts[array_length(s.parts, 1)], 1)) || '.'
               ELSE s.parts[1]
             END
        FROM (
          SELECT regexp_split_to_array(btrim(p.name), '\s+') AS parts
            FROM public.profiles p
           WHERE p.user_id = _user_id
             AND nullif(btrim(p.name), '') IS NOT NULL
        ) s
    ),
    'A patient'
  );
$$;

REVOKE ALL ON FUNCTION public.notice_patient_name(uuid) FROM PUBLIC, anon, authenticated;

/**
 * Whether a clinician can still see this patient's readings through a live
 * direct share — the same test clinician_has_patient_access applies to create
 * or re-enable a rule, asked about a named clinician instead of the caller.
 */
CREATE OR REPLACE FUNCTION public.clinician_still_reaches_patient(_clinician uuid, _patient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.provider_shares ps
      LEFT JOIN auth.users u ON u.id = _clinician
     WHERE ps.user_id = _patient
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (
         ps.clinician_user_id = _clinician
         OR (
           ps.clinician_user_id IS NULL
           AND u.email_confirmed_at IS NOT NULL
           AND lower(ps.provider_email) = lower(u.email)
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION public.clinician_still_reaches_patient(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A share ends
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_share_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_patient    uuid := NEW.user_id;
  v_name       text := public.notice_patient_name(NEW.user_id);
  v_practice   uuid;
  v_with       text;
  v_by_patient boolean;
  v_person     record;
  v_archived   integer;
  v_message    text;
BEGIN
  -- Server-side revocations carry no session; revoked_by is then the only
  -- account of who asked for it.
  v_by_patient := COALESCE(v_actor = v_patient, false)
               OR (v_actor IS NULL AND NEW.revoked_by = v_patient);

  IF TG_TABLE_NAME = 'practice_shares' THEN
    v_practice := NEW.practice_id;
    SELECT name INTO v_with FROM public.practices WHERE id = v_practice;
    v_with := COALESCE(v_with, 'your hospital');
  END IF;

  FOR v_person IN
    WITH people AS (
      -- A direct share: the one clinician on it. An unclaimed share still
      -- opens to a confirmed account under its email (the rule
      -- clinician_has_patient_access applies), so that account is told; with
      -- no such account there was nobody on the other side to tell.
      -- (Read through jsonb: practice_shares has neither column, and NEW is
      -- either row type.)
      SELECT COALESCE(
               (to_jsonb(NEW) ->> 'clinician_user_id')::uuid,
               (SELECT u.id FROM auth.users u
                 WHERE u.email_confirmed_at IS NOT NULL
                   AND lower(u.email) = lower(to_jsonb(NEW) ->> 'provider_email')
                 LIMIT 1)
             ) AS user_id,
             true AS tell
       WHERE TG_TABLE_NAME = 'provider_shares'
      UNION ALL
      -- A hospital share: every active member is checked for rules; owners,
      -- admins and whoever was assigned the patient are told regardless.
      SELECT pm.user_id,
             pm.role IN ('owner', 'admin')
             OR EXISTS (
               SELECT 1 FROM public.practice_patient_assignments ppa
                WHERE ppa.practice_id = v_practice
                  AND ppa.patient_user_id = v_patient
                  AND ppa.clinician_user_id = pm.user_id
                  AND (ppa.effective_to IS NULL OR ppa.effective_to > now())
             )
        FROM public.practice_members pm
       WHERE TG_TABLE_NAME = 'practice_shares'
         AND pm.practice_id = v_practice
         AND pm.status = 'active'
    )
    SELECT user_id, bool_or(tell) AS tell FROM people WHERE user_id IS NOT NULL GROUP BY user_id
  LOOP
    UPDATE public.clinician_alert_rules
       SET archived_at = now(),
           is_active = false
     WHERE clinician_user_id = v_person.user_id
       AND patient_user_id = v_patient
       AND archived_at IS NULL
       AND NOT public.clinician_still_reaches_patient(v_person.user_id, v_patient);
    GET DIAGNOSTICS v_archived = ROW_COUNT;

    -- Whoever ended it already knows.
    CONTINUE WHEN v_person.user_id IS NOT DISTINCT FROM v_actor;
    CONTINUE WHEN NOT (v_person.tell OR v_archived > 0);
    CONTINUE WHEN NOT public.notification_allowed(v_person.user_id, 'sharing_ended', 'in_app');

    v_message := CASE
      WHEN v_practice IS NULL AND v_by_patient THEN
        format('%s stopped sharing with you, so no further updates will be transmitted.', v_name)
      WHEN v_practice IS NULL THEN
        format('Sharing between you and %s has ended, so no further updates will be transmitted.', v_name)
      WHEN v_by_patient THEN
        format('%s stopped sharing with %s, so no further updates will be transmitted.', v_name, v_with)
      ELSE
        format('%s''s share with %s was ended from the hospital''s side, so no further updates will be transmitted.', v_name, v_with)
    END;
    IF v_archived = 1 THEN
      v_message := v_message || ' 1 alert rule you set for them has been archived.';
    ELSIF v_archived > 1 THEN
      v_message := v_message || format(' %s alert rules you set for them have been archived.', v_archived);
    END IF;

    INSERT INTO public.clinician_guidance_notifications (
      clinician_user_id, patient_user_id, notification_type, practice_id, message, related_id
    ) VALUES (
      v_person.user_id, v_patient, 'share_ended', v_practice, v_message, NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.on_share_ended() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_provider_share_ended ON public.provider_shares;
CREATE TRIGGER trg_provider_share_ended
AFTER UPDATE OF is_active ON public.provider_shares
FOR EACH ROW
WHEN (OLD.is_active AND NOT NEW.is_active)
EXECUTE FUNCTION public.on_share_ended();

-- practice_suspended_at is deliberately not in the column list or the WHEN:
-- the hospital pausing its own staff is not the patient leaving.
DROP TRIGGER IF EXISTS trg_practice_share_ended ON public.practice_shares;
CREATE TRIGGER trg_practice_share_ended
AFTER UPDATE OF is_active ON public.practice_shares
FOR EACH ROW
WHEN (OLD.is_active AND NOT NEW.is_active)
EXECUTE FUNCTION public.on_share_ended();

-- ---------------------------------------------------------------------------
-- 4. A lead routes or assigns outside their departments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.flag_routing_outside_department()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_led          uuid[];
  v_current      uuid[];
  v_patient_out  boolean;
  v_target_out   boolean;
  v_routing      boolean := TG_TABLE_NAME = 'practice_patient_departments';
  v_lead_name    text;
  v_patient_name text;
  v_led_names    text;
  v_current_names text;
  v_target_name  text;
  v_assignee     text;
  v_message      text;
  v_manager      uuid;
BEGIN
  -- Only a person is a lead. Server-side writes, and owners and admins, are
  -- not what this watches for.
  IF v_actor IS NULL
     OR public.can_manage_practice(NEW.practice_id)
     OR NOT public.is_department_lead(NEW.practice_id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(pdm.department_id), '{}') INTO v_led
    FROM public.practice_department_members pdm
    JOIN public.practice_departments d ON d.id = pdm.department_id
   WHERE pdm.user_id = v_actor
     AND pdm.practice_id = NEW.practice_id
     AND pdm.is_lead;

  -- Where the patient sat before this write.
  SELECT COALESCE(array_agg(ppd.department_id), '{}') INTO v_current
    FROM public.practice_patient_departments ppd
   WHERE ppd.practice_id = NEW.practice_id
     AND ppd.patient_user_id = NEW.patient_user_id
     AND ppd.effective_to IS NULL
     AND ppd.id <> NEW.id;

  v_patient_out := cardinality(v_current) > 0 AND NOT (v_current && v_led);
  v_target_out  := NEW.department_id IS NOT NULL AND NOT (NEW.department_id = ANY (v_led));

  IF NOT (v_patient_out OR v_target_out) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.hipaa_audit_logs (
    user_id, action, resource_type, resource_id, patient_user_id, details
  ) VALUES (
    v_actor,
    CASE WHEN v_routing THEN 'routed_outside_department' ELSE 'assigned_outside_department' END,
    TG_TABLE_NAME,
    NEW.id::text,
    NEW.patient_user_id,
    jsonb_build_object(
      'practice_id', NEW.practice_id,
      'department_id', NEW.department_id,
      'patient_departments', to_jsonb(v_current),
      'lead_departments', to_jsonb(v_led),
      'clinician_user_id', CASE WHEN v_routing THEN NULL ELSE to_jsonb(NEW) ->> 'clinician_user_id' END
    )
  );

  SELECT COALESCE(nullif(btrim(name), ''), email, 'A department lead') INTO v_lead_name
    FROM public.profiles WHERE user_id = v_actor;
  v_lead_name := COALESCE(v_lead_name, 'A department lead');
  v_patient_name := public.notice_patient_name(NEW.patient_user_id);
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_led_names
    FROM public.practice_departments WHERE id = ANY (v_led);
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_current_names
    FROM public.practice_departments WHERE id = ANY (v_current);
  SELECT name INTO v_target_name FROM public.practice_departments WHERE id = NEW.department_id;

  IF v_routing THEN
    v_message := format('%s, who leads %s, routed %s into %s.',
      v_lead_name, COALESCE(v_led_names, 'no department'), v_patient_name, v_target_name);
  ELSE
    SELECT COALESCE(nullif(btrim(name), ''), email, 'a colleague') INTO v_assignee
      FROM public.profiles WHERE user_id = (to_jsonb(NEW) ->> 'clinician_user_id')::uuid;
    v_message := format('%s, who leads %s, assigned %s to %s%s.',
      v_lead_name, COALESCE(v_led_names, 'no department'), v_patient_name,
      COALESCE(v_assignee, 'a colleague'),
      CASE WHEN v_target_name IS NOT NULL THEN ' under ' || v_target_name ELSE '' END);
  END IF;

  IF v_patient_out THEN
    v_message := v_message || format(' %s was under %s, outside the departments they lead.',
      v_patient_name, v_current_names);
  ELSE
    v_message := v_message || format(' %s is not a department they lead.', v_target_name);
  END IF;

  FOR v_manager IN
    SELECT pm.user_id
      FROM public.practice_members pm
     WHERE pm.practice_id = NEW.practice_id
       AND pm.status = 'active'
       AND pm.role IN ('owner', 'admin')
       AND pm.user_id <> v_actor
  LOOP
    CONTINUE WHEN NOT public.notification_allowed(v_manager, 'department_routing_oversight', 'in_app');
    INSERT INTO public.clinician_guidance_notifications (
      clinician_user_id, patient_user_id, notification_type, practice_id, message, related_id
    ) VALUES (
      v_manager, NEW.patient_user_id, 'routed_outside_department', NEW.practice_id, v_message, NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_routing_outside_department() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_flag_routing_outside_department ON public.practice_patient_departments;
CREATE TRIGGER trg_flag_routing_outside_department
AFTER INSERT ON public.practice_patient_departments
FOR EACH ROW EXECUTE FUNCTION public.flag_routing_outside_department();

DROP TRIGGER IF EXISTS trg_flag_routing_outside_department ON public.practice_patient_assignments;
CREATE TRIGGER trg_flag_routing_outside_department
AFTER INSERT ON public.practice_patient_assignments
FOR EACH ROW EXECUTE FUNCTION public.flag_routing_outside_department();

-- ---------------------------------------------------------------------------
-- 5. Acknowledging
-- ---------------------------------------------------------------------------

/**
 * A manager of the practice records that they have seen a lead's routing.
 * One acknowledgement covers every manager's copy, so two admins do not both
 * chase the same thing, and each copy says who acknowledged it.
 */
CREATE OR REPLACE FUNCTION public.acknowledge_practice_notice(_notification_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.clinician_guidance_notifications;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
    FROM public.clinician_guidance_notifications
   WHERE id = _notification_id
     AND clinician_user_id = auth.uid();

  IF NOT FOUND OR v_row.notification_type <> 'routed_outside_department' THEN
    RAISE EXCEPTION 'There is no such notice to acknowledge' USING ERRCODE = '42501';
  END IF;

  -- Holding the notice is not enough: someone demoted since it arrived no
  -- longer answers for the hospital.
  IF NOT public.can_manage_practice(v_row.practice_id) THEN
    RAISE EXCEPTION 'Only this hospital''s owners and admins can acknowledge this' USING ERRCODE = '42501';
  END IF;

  -- Lock every copy before deciding, so two admins acknowledging at once
  -- produce one acknowledgement rather than two.
  PERFORM 1
     FROM public.clinician_guidance_notifications
    WHERE notification_type = 'routed_outside_department'
      AND practice_id = v_row.practice_id
      AND related_id = v_row.related_id
    ORDER BY id
      FOR UPDATE;

  SELECT * INTO v_row FROM public.clinician_guidance_notifications WHERE id = _notification_id;
  IF v_row.acknowledged_at IS NOT NULL THEN
    RETURN v_row.acknowledged_at;
  END IF;

  UPDATE public.clinician_guidance_notifications
     SET acknowledged_at = v_now,
         acknowledged_by = auth.uid(),
         is_read = CASE WHEN clinician_user_id = auth.uid() THEN true ELSE is_read END
   WHERE notification_type = 'routed_outside_department'
     AND practice_id = v_row.practice_id
     AND related_id = v_row.related_id
     AND acknowledged_at IS NULL;

  INSERT INTO public.hipaa_audit_logs (
    user_id, action, resource_type, resource_id, patient_user_id, details
  ) VALUES (
    auth.uid(),
    'outside_department_routing_acknowledged',
    'clinician_guidance_notifications',
    v_row.related_id::text,
    v_row.patient_user_id,
    jsonb_build_object('practice_id', v_row.practice_id, 'notification_id', v_row.id)
  );

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_practice_notice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_practice_notice(uuid) TO authenticated;