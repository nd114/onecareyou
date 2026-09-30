-- Guidance is permanent once sent, and OneCare's own evidence outlives the
-- account it is about.
--
-- Guidance. 20260926100000 let a clinician delete guidance the patient had not
-- acknowledged, on the reasoning that nobody had seen it. The founder's answer:
-- not acknowledged does not mean not seen, and not seen does not mean not done.
-- Guidance reaches the patient the moment it is written (their SELECT policy
-- has no other condition), and they may have acted on it before tapping
-- anything. Deleting it removed the only record of who told them to.
--
-- So guidance is never deleted, by anyone. A clinician who issued it in error
-- withdraws it (withdraw_guidance): the row stays exactly as sent, marked who
-- withdrew it, when and why; the patient gets a notice saying so; and the care
-- record snapshot shows it withdrawn with the reason. This is the retraction
-- class of docs/record-corrections-plan.md, the same shape as a withdrawn
-- document: urgent, needs nobody's acceptance, and leaves a marker in place of
-- a gap. A withdrawal is final. A clinician who wants to change what they said
-- amends it (amend_guidance), which issues a new instruction linked to the old
-- one and withdraws the old one with the reason; the text the patient received
-- is never rewritten.
--
-- The old route to the same harm was the UPDATE policy: a clinician could
-- rewrite the title and instruction in place, set status to 'archived' with no
-- reason, and clear the patient's acknowledgement. The audit log noted that a
-- change happened, not what was there before. A patient could set 'archived'
-- themselves, which the patient's own page shows as "Withdrawn by your
-- clinician". guard_guidance_record now refuses each of these loudly for any
-- signed-in caller; the only ways to change the meaning of a sent instruction
-- are the two functions, which record why.
--
-- Evidence. legal_acceptances, consent_logs and baa_agreements cascaded from
-- auth.users, and beta_nda_signatures from beta_testers, so deleting an account
-- (from the dashboard, or by the service role) deleted the proof of what that
-- person had agreed to: which terms version, which consent, which BAA, when.
-- That is OneCare's own evidence, needed most when the agreement is in dispute,
-- and a dispute can outlive the account.
--
-- SET NULL, not RESTRICT. The consent model (5, 7.2) expects accounts to be
-- closable, and OneCare to honour a verified erasure request for the data it
-- controls. Every account has at least one legal acceptance, so RESTRICT would
-- make every account undeletable by a single statement and pin the evidence to
-- a live identity. SET NULL lets the account go and keeps the evidence. What
-- remains is not identifying on its own: the account key is gone, and the row
-- carries a SHA-256 of the account id and of the lower-cased email as it was
-- when the row was written. It is still attributable: given the email the
-- person used, or their id from the audit logs, the rows can be found and
-- matched. The rows keep the document version, timestamps, IP and user agent
-- they always had, because those are what make an acceptance evidence.
-- The NDA row already carries the signer's name, email and version, which is
-- what a signed agreement is; it only needed to stop cascading.
--
-- Checked and already safe, because they name people without a foreign key:
-- hipaa_audit_logs, access_audit_logs, patient_action_log and
-- platform_admin_actions. The test asserts they survive account deletion so a
-- future key cannot quietly change that. rate_limit_events,
-- kingschat_login_attempts and beta_events are operational, not evidence, and
-- are left alone.
--
-- Tests: supabase/tests/guidance_and_evidence_are_kept.test.sql, and the
-- allowlist in deletion_never_crosses_parties.test.sql (section D), which no
-- longer lists the four evidence keys as same-side cascades.

-- ===========================================================================
-- 1. Guidance: the withdrawal columns
-- ===========================================================================

ALTER TABLE public.clinician_guidance
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text,
  ADD COLUMN IF NOT EXISTS supersedes_guidance_id uuid;

-- RESTRICT, not CASCADE: an amendment points at what it replaced, and neither
-- may take the other with it. (Neither can be deleted anyway; this keeps the
-- key out of the cascade catalogue.)
ALTER TABLE public.clinician_guidance DROP CONSTRAINT IF EXISTS clinician_guidance_supersedes_guidance_id_fkey;
ALTER TABLE public.clinician_guidance
  ADD CONSTRAINT clinician_guidance_supersedes_guidance_id_fkey
  FOREIGN KEY (supersedes_guidance_id) REFERENCES public.clinician_guidance(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.clinician_guidance.withdrawn_at IS
  'Set once, by withdraw_guidance(). The row stays as it was sent; this says it was taken back.';
COMMENT ON COLUMN public.clinician_guidance.withdrawal_reason IS
  'Why the clinician withdrew it, as shown to the patient. NULL only on rows archived before reasons were kept.';

-- Rows archived through the old client path were withdrawals in all but name
-- (the patient's page already says "Withdrawn by your clinician"). They become
-- withdrawals on the record, without a reason, because none was ever asked for;
-- the snapshot says so rather than inventing one.
UPDATE public.clinician_guidance
   SET withdrawn_at = updated_at,
       withdrawn_by = clinician_user_id
 WHERE status = 'archived' AND withdrawn_at IS NULL;

-- ===========================================================================
-- 2. Nobody deletes guidance
-- ===========================================================================

DROP POLICY IF EXISTS "Clinicians delete only guidance never acknowledged" ON public.clinician_guidance;
DROP POLICY IF EXISTS "Clinicians can delete their guidance" ON public.clinician_guidance;
REVOKE DELETE, TRUNCATE ON public.clinician_guidance FROM authenticated, anon;

-- The policy is one route to a delete and the service role is another. This
-- one refuses both. A controller-initiated deletion under consent model 7 (not
-- built) would have to decide about this trigger explicitly, which is the point.
CREATE OR REPLACE FUNCTION public.refuse_guidance_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Guidance is permanent once sent: the patient may have acted on it. Withdraw it instead.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_guidance_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refuse_guidance_delete ON public.clinician_guidance;
CREATE TRIGGER trg_refuse_guidance_delete
  BEFORE DELETE ON public.clinician_guidance
  FOR EACH ROW EXECUTE FUNCTION public.refuse_guidance_delete();

-- ===========================================================================
-- 3. Nobody rewrites it, or fakes a withdrawal
-- ===========================================================================
--
-- Deliberately SECURITY INVOKER: current_user is how it tells a direct client
-- write ('authenticated') from one made inside withdraw_guidance() or
-- amend_guidance(), which run as their owner. A client cannot become the owner,
-- so a withdrawal cannot be forged by writing the columns. The service role and
-- migrations are platform writes and are held only to the first rule.
--
-- Runs after enforce_guidance_patient_update (triggers fire in name order),
-- which silently restores clinical columns a patient tries to change; this one
-- then refuses what is left, loudly.

CREATE OR REPLACE FUNCTION public.guard_guidance_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _client boolean := current_user IN ('authenticated', 'anon');
  _uid    uuid := auth.uid();
BEGIN
  -- A withdrawal is final, for everyone: it is what the patient was told.
  IF OLD.withdrawn_at IS NOT NULL AND (
       NEW.withdrawn_at      IS DISTINCT FROM OLD.withdrawn_at
    OR NEW.withdrawn_by      IS DISTINCT FROM OLD.withdrawn_by
    OR NEW.withdrawal_reason IS DISTINCT FROM OLD.withdrawal_reason
    OR NEW.status            IS DISTINCT FROM OLD.status
    OR NEW.acknowledged_at   IS DISTINCT FROM OLD.acknowledged_at
    OR NEW.completed_at      IS DISTINCT FROM OLD.completed_at) THEN
    RAISE EXCEPTION 'This guidance was withdrawn and a withdrawal is final. Issue new guidance instead.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT _client THEN
    RETURN NEW;
  END IF;

  IF NEW.withdrawn_at      IS DISTINCT FROM OLD.withdrawn_at
  OR NEW.withdrawn_by      IS DISTINCT FROM OLD.withdrawn_by
  OR NEW.withdrawal_reason IS DISTINCT FROM OLD.withdrawal_reason
  OR (NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived') THEN
    RAISE EXCEPTION 'Guidance is withdrawn through withdraw_guidance(), which records the reason and tells the patient.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.title                  IS DISTINCT FROM OLD.title
  OR NEW.instruction            IS DISTINCT FROM OLD.instruction
  OR NEW.category               IS DISTINCT FROM OLD.category
  OR NEW.priority               IS DISTINCT FROM OLD.priority
  OR NEW.due_date               IS DISTINCT FROM OLD.due_date
  OR NEW.clinician_user_id      IS DISTINCT FROM OLD.clinician_user_id
  OR NEW.patient_user_id        IS DISTINCT FROM OLD.patient_user_id
  OR NEW.created_at             IS DISTINCT FROM OLD.created_at
  OR NEW.supersedes_guidance_id IS DISTINCT FROM OLD.supersedes_guidance_id THEN
    RAISE EXCEPTION 'Guidance the patient has received cannot be rewritten. Use amend_guidance(), which issues a new instruction and withdraws this one.'
      USING ERRCODE = '42501';
  END IF;

  -- Acknowledging and completing are the patient's acts, and stand as made.
  IF NEW.status          IS DISTINCT FROM OLD.status
  OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
  OR NEW.completed_at    IS DISTINCT FROM OLD.completed_at THEN
    IF _uid IS DISTINCT FROM OLD.patient_user_id THEN
      RAISE EXCEPTION 'Only the patient records acknowledging or completing guidance.'
        USING ERRCODE = '42501';
    END IF;
    IF (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at)
    OR (OLD.completed_at    IS NOT NULL AND NEW.completed_at    IS DISTINCT FROM OLD.completed_at) THEN
      RAISE EXCEPTION 'An acknowledgement or completion stands as recorded.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_guidance_record() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_guidance_record ON public.clinician_guidance;
CREATE TRIGGER guard_guidance_record
  BEFORE UPDATE ON public.clinician_guidance
  FOR EACH ROW EXECUTE FUNCTION public.guard_guidance_record();

-- ===========================================================================
-- 4. The patient hears about a withdrawal
-- ===========================================================================

ALTER TABLE public.patient_notices DROP CONSTRAINT IF EXISTS patient_notices_notice_type_check;
ALTER TABLE public.patient_notices
  ADD CONSTRAINT patient_notices_notice_type_check
  CHECK (notice_type IN ('care_handed_over', 'guidance_withdrawn'));

-- ===========================================================================
-- 5. Withdraw and amend
-- ===========================================================================

/**
 * Take back guidance issued in error. The issuing clinician only, a reason
 * always. Works whether or not the patient still shares: this corrects what
 * the patient already holds rather than reaching into their data, and the
 * patient is the one person who most needs to hear it.
 */
CREATE OR REPLACE FUNCTION public.withdraw_guidance(_guidance_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    uuid := auth.uid();
  _g      public.clinician_guidance%ROWTYPE;
  _why    text := nullif(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF _why IS NULL THEN
    RAISE EXCEPTION 'Say why the guidance is being withdrawn; the patient is shown the reason.'
      USING ERRCODE = '22023';
  END IF;
  IF length(_why) > 1000 THEN
    RAISE EXCEPTION 'Keep the reason under 1000 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _g FROM public.clinician_guidance WHERE id = _guidance_id FOR UPDATE;
  IF NOT FOUND OR _g.clinician_user_id <> _uid OR NOT public.caller_is_clinician() THEN
    RAISE EXCEPTION 'Only the clinician who issued this guidance can withdraw it.' USING ERRCODE = '42501';
  END IF;
  IF _g.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'This guidance was already withdrawn.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.clinician_guidance
     SET withdrawn_at        = now(),
         withdrawn_by        = _uid,
         withdrawal_reason   = _why,
         status              = 'archived',
         auto_resend_enabled = false
   WHERE id = _guidance_id;

  INSERT INTO public.patient_notices (patient_user_id, notice_type, message, related_id)
  VALUES (
    _g.patient_user_id, 'guidance_withdrawn',
    format('%s withdrew the instruction "%s" they sent on %s. Reason: %s',
           public.notice_person_name(_uid), _g.title,
           to_char(_g.created_at AT TIME ZONE 'UTC', 'DD Mon YYYY'), _why),
    _guidance_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_guidance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_guidance(uuid, text) TO authenticated;

/**
 * Change what was said by saying it again. Issues a new instruction linked to
 * the original and withdraws the original with the reason, so the patient sees
 * both: what they were told first, and what replaced it. Issuing is new
 * guidance, so it needs the same live access the INSERT policy asks for.
 */
CREATE OR REPLACE FUNCTION public.amend_guidance(
  _guidance_id uuid, _title text, _instruction text, _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _g   public.clinician_guidance%ROWTYPE;
  _new uuid;
  _why text := nullif(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _g FROM public.clinician_guidance WHERE id = _guidance_id FOR UPDATE;
  IF NOT FOUND OR _g.clinician_user_id <> _uid OR NOT public.caller_is_clinician() THEN
    RAISE EXCEPTION 'Only the clinician who issued this guidance can amend it.' USING ERRCODE = '42501';
  END IF;
  IF _g.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'This guidance was withdrawn; issue new guidance instead.' USING ERRCODE = '55000';
  END IF;
  IF _why IS NULL THEN
    RAISE EXCEPTION 'Say why the guidance is being amended; the patient is shown the reason.'
      USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(COALESCE(_title, '')), '') IS NULL OR nullif(btrim(COALESCE(_instruction, '')), '') IS NULL THEN
    RAISE EXCEPTION 'An amended instruction needs a title and a text.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.clinician_has_patient_access(_g.patient_user_id) THEN
    RAISE EXCEPTION 'You no longer have access to send this patient guidance. Withdraw it instead.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.clinician_guidance
    (clinician_user_id, patient_user_id, share_id, title, instruction, category, priority, due_date,
     supersedes_guidance_id)
  VALUES
    (_uid, _g.patient_user_id, _g.share_id, btrim(_title), btrim(_instruction), _g.category, _g.priority,
     _g.due_date, _g.id)
  RETURNING id INTO _new;

  -- skip_duplicate_guidance drops an identical instruction sent twice in quick
  -- succession, which here would withdraw the original and replace it with
  -- nothing.
  IF _new IS NULL THEN
    RAISE EXCEPTION 'The amended instruction is the same as the original.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.withdraw_guidance(_g.id, format('Replaced by an amended instruction "%s". %s', btrim(_title), _why));
  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.amend_guidance(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_guidance(uuid, text, text, text) TO authenticated;

-- ===========================================================================
-- 6. The care record shows a withdrawal where the guidance was
-- ===========================================================================
--
-- Unchanged from 20261010110000 except that guidance carries its withdrawal,
-- and the compiled record prints it in the status column. The instruction
-- itself stays: unlike a withdrawn document, whose title may be another
-- patient's, guidance was written to this patient and what it said is the
-- point of keeping it.

CREATE OR REPLACE FUNCTION public.care_record_entries(
  _patient uuid, _clinician uuid, _practice uuid, _relationship_id uuid
)
RETURNS TABLE (
  section text, occurred_at timestamptz, author_user_id uuid,
  heading text, body text, extra jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Private: messages
  SELECT 'message', m.created_at, m.sender_user_id, NULL::text, m.body,
         jsonb_build_object('attachment_name', CASE WHEN m.attachment_path IS NOT NULL
                                                    THEN COALESCE(m.attachment_name, 'Attachment') END,
                            'attachment_withdrawn_at', m.attachment_retracted_at)
    FROM public.messages m
   WHERE _practice IS NULL
     AND m.patient_user_id = _patient AND m.clinician_user_id = _clinician
     AND m.practice_id IS NULL
  UNION ALL
  -- Hospital: messages
  SELECT 'message', m.created_at, m.sender_user_id, NULL, m.body,
         jsonb_build_object('attachment_name', CASE WHEN m.attachment_path IS NOT NULL
                                                    THEN COALESCE(m.attachment_name, 'Attachment') END,
                            'attachment_withdrawn_at', m.attachment_retracted_at)
    FROM public.messages m
   WHERE _practice IS NOT NULL
     AND m.patient_user_id = _patient AND m.practice_id = _practice
  UNION ALL
  -- Guidance, withdrawn or not
  SELECT 'guidance', g.created_at, g.clinician_user_id, g.title, g.instruction,
         jsonb_build_object('priority', g.priority, 'due_date', g.due_date, 'status', g.status,
                            'acknowledged_at', g.acknowledged_at, 'completed_at', g.completed_at,
                            'withdrawn_at', g.withdrawn_at, 'withdrawn_by', g.withdrawn_by,
                            'withdrawal_reason', g.withdrawal_reason)
    FROM public.clinician_guidance g
   WHERE g.patient_user_id = _patient
     AND (
       (_practice IS NULL AND g.clinician_user_id = _clinician)
       OR (_practice IS NOT NULL AND g.share_id IS NULL AND EXISTS (
             SELECT 1 FROM public.practice_members pm
              WHERE pm.practice_id = _practice AND pm.user_id = g.clinician_user_id
                AND pm.created_at <= g.created_at
                AND (pm.ended_at IS NULL OR g.created_at < pm.ended_at)))
     )
  UNION ALL
  -- Documents sent into the Vault. A withdrawn one keeps its place and loses
  -- its title: withdrawal is often for the wrong patient's document, and its
  -- title is the one thing that must not be copied into a permanent record.
  SELECT 'document', d.created_at, d.uploaded_by_user_id,
         CASE WHEN d.retracted_at IS NULL THEN COALESCE(d.title, d.file_name) END,
         CASE WHEN d.retracted_at IS NULL THEN d.file_name END,
         jsonb_build_object('withdrawn_at', d.retracted_at)
    FROM public.health_documents d
   WHERE d.user_id = _patient
     AND d.uploaded_by_user_id IS NOT NULL
     AND d.source_context <> 'care_record_snapshot'
     AND (
       (_practice IS NULL AND d.uploaded_by_user_id = _clinician)
       OR (_practice IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.practice_members pm
              WHERE pm.practice_id = _practice AND pm.user_id = d.uploaded_by_user_id
                AND pm.created_at <= d.created_at
                AND (pm.ended_at IS NULL OR d.created_at < pm.ended_at)))
     )
  UNION ALL
  -- The relationship ledger
  SELECT 'ledger', e.created_at, e.actor_user_id,
         CASE e.event_type
           WHEN 'connected' THEN 'Connected'
           WHEN 'claimed' THEN 'Joined OneCare'
           WHEN 'permissions_changed' THEN 'What is shared changed'
           WHEN 'paused' THEN 'Paused'
           WHEN 'resumed' THEN 'Resumed'
           WHEN 'revoked' THEN 'Ended'
           WHEN 'reshared' THEN 'Shared again'
           WHEN 'expired' THEN 'Expired'
           ELSE e.event_type
         END,
         e.reason,
         jsonb_build_object('actor_role', e.actor_role)
    FROM public.share_events e
   WHERE e.patient_user_id = _patient
     AND (
       (_practice IS NULL AND e.share_id IN (
          SELECT ps.id FROM public.provider_shares ps
           WHERE ps.user_id = _patient
             AND (ps.clinician_user_id = _clinician OR ps.id = _relationship_id)))
       OR (_practice IS NOT NULL AND e.practice_share_id = _relationship_id)
     );
$$;

CREATE OR REPLACE FUNCTION public.compile_care_record_snapshot(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job        public.care_record_snapshot_jobs%ROWTYPE;
  v_now        timestamptz := now();
  v_tz         text;
  v_patient    text;
  v_with       text;
  v_account    text;
  v_kind_label text;
  v_started    timestamptz;
  v_ended      timestamptz;
  v_end_reason text;
  v_expires    timestamptz;
  v_reason     text;
  v_scope_note text;
  v_first      timestamptz;
  v_n_msg      integer;
  v_n_guid     integer;
  v_n_doc      integer;
  v_n_led      integer;
  v_msgs       text;
  v_guid       text;
  v_docs       text;
  v_ledger     text;
  v_stamp      text;
  v_title      text;
  v_slug       text;
  v_html       text;
  v_sha        text;
BEGIN
  SELECT * INTO v_job FROM public.care_record_snapshot_jobs WHERE id = _job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No care record job %', _job_id;
  END IF;

  SELECT COALESCE(
           (SELECT p.timezone FROM public.profiles p
             WHERE p.user_id = v_job.patient_user_id
               AND p.timezone IN (SELECT name FROM pg_timezone_names)),
           'UTC')
    INTO v_tz;
  SELECT COALESCE((SELECT nullif(btrim(p.name), '') FROM public.profiles p WHERE p.user_id = v_job.patient_user_id),
                  'Patient')
    INTO v_patient;

  IF v_job.relationship_kind = 'private_share' THEN
    SELECT ps.provider_name, ps.created_at, CASE WHEN NOT ps.is_active THEN ps.revoked_at END,
           CASE WHEN NOT ps.is_active THEN ps.revoke_reason END, ps.expires_at
      INTO v_with, v_started, v_ended, v_end_reason, v_expires
      FROM public.provider_shares ps WHERE ps.id = v_job.relationship_id;
    v_account    := public.care_record_person_label(v_job.clinician_user_id);
    v_with       := COALESCE(nullif(btrim(v_with), ''), v_account);
    v_kind_label := 'Private connection with a clinician';
    v_scope_note := 'Everything exchanged privately between you and this clinician on OneCare. '
                 || 'Conversations held through a hospital are in that hospital''s record.';
  ELSE
    SELECT hs.connected_at, CASE WHEN NOT hs.is_active THEN hs.revoked_at END,
           CASE WHEN NOT hs.is_active THEN hs.revoke_reason END
      INTO v_started, v_ended, v_end_reason
      FROM public.practice_shares hs WHERE hs.id = v_job.relationship_id;
    SELECT name INTO v_with FROM public.practices WHERE id = v_job.practice_id;
    v_with       := COALESCE(nullif(btrim(v_with), ''), 'A hospital');
    v_account    := NULL;
    v_kind_label := 'Connection with a hospital';
    v_scope_note := 'The hospital''s conversation with you, and guidance and documents from people '
                 || 'on its team at the time they were issued.';
  END IF;

  v_reason := CASE v_job.trigger_kind
    WHEN 'disconnected' THEN 'Connection ended' || CASE
      WHEN v_job.requested_by IS NULL THEN ''
      WHEN v_job.requested_by = v_job.patient_user_id THEN ' by the patient'
      WHEN public.has_role(v_job.requested_by, 'admin') THEN ' by OneCare'
      WHEN v_job.practice_id IS NOT NULL THEN ' by the hospital'
      ELSE ' by the clinician' END
    WHEN 'expired' THEN 'Sharing expired'
    WHEN 'quarterly' THEN 'Quarterly record for ' || v_job.trigger_key
    ELSE 'Requested by the patient'
  END;

  -- One read of the relationship, so every section and its count describe the
  -- same moment.
  SELECT
    count(*) FILTER (WHERE r.section = 'message'),
    count(*) FILTER (WHERE r.section = 'guidance'),
    count(*) FILTER (WHERE r.section = 'document'),
    count(*) FILTER (WHERE r.section = 'ledger'),
    min(r.occurred_at),
    string_agg(format(
           '<tr><td>%s</td><td>%s</td><td>%s%s</td></tr>',
           public.care_record_when(r.occurred_at, v_tz),
           public.care_record_html(CASE WHEN r.author_user_id = v_job.patient_user_id
                                        THEN v_patient || ' (patient)'
                                        ELSE public.care_record_person_label(r.author_user_id) END),
           public.care_record_html(r.body),
           CASE
             WHEN r.extra ->> 'attachment_withdrawn_at' IS NOT NULL THEN
               '<br/><em>An attachment was withdrawn by the sender on '
               || public.care_record_when((r.extra ->> 'attachment_withdrawn_at')::timestamptz, v_tz) || '.</em>'
             WHEN r.extra ->> 'attachment_name' IS NOT NULL THEN
               '<br/><em>Attachment: ' || public.care_record_html(r.extra ->> 'attachment_name') || '</em>'
             ELSE ''
           END), '' ORDER BY r.occurred_at) FILTER (WHERE r.section = 'message'),
    string_agg(format(
           '<tr><td>%s</td><td>%s</td><td><strong>%s</strong><br/>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>',
           public.care_record_when(r.occurred_at, v_tz),
           public.care_record_html(public.care_record_person_label(r.author_user_id)),
           public.care_record_html(r.heading),
           public.care_record_html(r.body),
           public.care_record_html(COALESCE(r.extra ->> 'priority', 'normal')),
           public.care_record_when((r.extra ->> 'due_date')::timestamptz, v_tz),
           CASE WHEN r.extra ->> 'withdrawn_at' IS NOT NULL THEN '<strong>Withdrawn</strong>'
                ELSE public.care_record_html(COALESCE(r.extra ->> 'status', '—')) END
             || CASE WHEN r.extra ->> 'acknowledged_at' IS NOT NULL
                     THEN '<br/>Acknowledged ' || public.care_record_when((r.extra ->> 'acknowledged_at')::timestamptz, v_tz)
                     ELSE '' END
             || CASE WHEN r.extra ->> 'withdrawn_at' IS NOT NULL
                     THEN '<br/><em>Withdrawn by '
                          || public.care_record_html(public.care_record_person_label((r.extra ->> 'withdrawn_by')::uuid))
                          || ' on ' || public.care_record_when((r.extra ->> 'withdrawn_at')::timestamptz, v_tz) || ': '
                          || public.care_record_html(COALESCE(r.extra ->> 'withdrawal_reason',
                                                              'no reason was recorded (withdrawn before reasons were kept)'))
                          || '</em>'
                     ELSE '' END), '' ORDER BY r.occurred_at) FILTER (WHERE r.section = 'guidance'),
    string_agg(format(
           '<tr><td>%s</td><td>%s</td><td>%s</td></tr>',
           public.care_record_when(r.occurred_at, v_tz),
           public.care_record_html(public.care_record_person_label(r.author_user_id)),
           CASE WHEN r.extra ->> 'withdrawn_at' IS NOT NULL THEN
                  '<em>A document sent here was withdrawn by the sender on '
                  || public.care_record_when((r.extra ->> 'withdrawn_at')::timestamptz, v_tz)
                  || '. Its title is not repeated in this record.</em>'
                ELSE public.care_record_html(r.heading)
                  || CASE WHEN r.body IS NOT NULL AND r.body IS DISTINCT FROM r.heading
                          THEN ' <span class="muted">(' || public.care_record_html(r.body) || ')</span>'
                          ELSE '' END
           END), '' ORDER BY r.occurred_at) FILTER (WHERE r.section = 'document'),
    string_agg(format(
           '<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>',
           public.care_record_when(r.occurred_at, v_tz),
           public.care_record_html(r.heading),
           public.care_record_html(COALESCE(r.extra ->> 'actor_role', '—')),
           public.care_record_html(COALESCE(r.body, ''))), '' ORDER BY r.occurred_at) FILTER (WHERE r.section = 'ledger')
    INTO v_n_msg, v_n_guid, v_n_doc, v_n_led, v_first, v_msgs, v_guid, v_docs, v_ledger
    FROM public.care_record_entries(
           v_job.patient_user_id, v_job.clinician_user_id, v_job.practice_id, v_job.relationship_id) r;

  v_stamp := to_char(v_now AT TIME ZONE v_tz, 'YYYY-MM-DD');
  v_title := 'Care record — ' || v_with || ' ('
          || CASE WHEN v_job.trigger_kind = 'quarterly' THEN v_job.trigger_key ELSE v_stamp END || ')';
  v_slug  := btrim(regexp_replace(lower(v_with), '[^a-z0-9]+', '-', 'g'), '-');

  v_html :=
    '<!doctype html><html lang="en"><head><meta charset="utf-8"/>'
    || '<title>' || public.care_record_html(v_title) || '</title><style>'
    || 'body{font-family:Georgia,''Times New Roman'',serif;color:#1f2a24;margin:40px;line-height:1.5;position:relative}'
    || 'body::before{content:"OneCare care record \00B7  ' || v_job.id::text || '";position:fixed;top:45%;left:-10%;'
    || 'width:120%;text-align:center;transform:rotate(-30deg);font-size:40px;color:rgba(31,42,36,0.07);'
    || 'pointer-events:none;white-space:nowrap;z-index:0}'
    || 'h1{font-size:22px;margin:0 0 4px}.meta{font-size:12px;color:#5b6b62;margin-bottom:24px}'
    || 'h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #d8e0da;padding-bottom:4px}'
    || 'table{width:100%;border-collapse:collapse;font-size:12px}'
    || 'th,td{border:1px solid #d8e0da;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f2f6f3}'
    || '.muted{color:#5b6b62}.none{font-size:12px;color:#5b6b62}'
    || '.watermark{margin-top:32px;font-size:11px;color:#5b6b62;border-top:1px solid #d8e0da;padding-top:10px}'
    || '</style></head><body>'
    || '<h1>' || public.care_record_html(v_title) || '</h1>'
    || '<div class="meta">'
    || 'Patient: ' || public.care_record_html(v_patient) || '<br/>'
    || v_kind_label || ': ' || public.care_record_html(v_with)
    || CASE WHEN v_account IS NOT NULL AND v_account IS DISTINCT FROM v_with
            THEN ' (OneCare account: ' || public.care_record_html(v_account) || ')' ELSE '' END || '<br/>'
    || 'Connected: ' || public.care_record_when(v_started, v_tz)
    || CASE WHEN v_ended IS NOT NULL
            THEN ' · Ended: ' || public.care_record_when(v_ended, v_tz)
                 || CASE WHEN nullif(btrim(v_end_reason), '') IS NOT NULL
                         THEN ' — ' || public.care_record_html(v_end_reason) ELSE '' END
            ELSE '' END
    || CASE WHEN v_expires IS NOT NULL
            THEN ' · Sharing ' || CASE WHEN v_expires <= v_now THEN 'expired' ELSE 'expires' END
                 || ': ' || public.care_record_when(v_expires, v_tz)
            ELSE '' END || '<br/>'
    || 'Period covered: ' || public.care_record_when(LEAST(v_first, v_started), v_tz)
    || ' to ' || public.care_record_when(v_now, v_tz) || '<br/>'
    || 'Generated: ' || public.care_record_when(v_now, v_tz) || ' · Times are shown in '
    || public.care_record_html(v_tz) || '<br/>'
    || 'Reason: ' || public.care_record_html(v_reason) || '<br/>'
    || 'Record reference: ' || v_job.id::text || '<br/>'
    || '<span class="muted">' || public.care_record_html(v_scope_note) || '</span>'
    || '</div>'
    || '<h2>Secure messages (' || v_n_msg || ')</h2>'
    || COALESCE('<table><thead><tr><th>Date</th><th>From</th><th>Message</th></tr></thead><tbody>'
                || v_msgs || '</tbody></table>',
                '<p class="none">No messages were exchanged in this relationship.</p>')
    || '<h2>Guidance and care instructions (' || v_n_guid || ')</h2>'
    || COALESCE('<table><thead><tr><th>Date</th><th>Issued by</th><th>Instruction</th><th>Priority</th>'
                || '<th>Due</th><th>Status</th></tr></thead><tbody>' || v_guid || '</tbody></table>',
                '<p class="none">No guidance was issued in this relationship.</p>')
    || '<h2>Documents sent to your Vault (' || v_n_doc || ')</h2>'
    || COALESCE('<table><thead><tr><th>Date</th><th>From</th><th>Document</th></tr></thead><tbody>'
                || v_docs || '</tbody></table>',
                '<p class="none">No documents were sent to your Vault in this relationship.</p>')
    || '<h2>Relationship history (' || v_n_led || ')</h2>'
    || COALESCE('<table><thead><tr><th>Date</th><th>Event</th><th>By</th><th>Reason</th></tr></thead><tbody>'
                || v_ledger || '</tbody></table>',
                '<p class="none">No sharing events were recorded for this relationship.</p>')
    || '<div class="watermark">OneCare care record · permanent copy · filed by OneCare for '
    || public.care_record_html(v_patient) || ' on ' || public.care_record_when(v_now, v_tz)
    || ' · Record reference ' || v_job.id::text || '.<br/>'
    || 'This is a preserved copy of what passed between the patient and '
    || public.care_record_html(v_with) || '. Neither party can edit or delete it. Its SHA-256 digest is '
    || 'stored with it in the Vault, so a copy that has been altered can be told apart from this one.'
    || '</div></body></html>';

  v_sha := encode(sha256(convert_to(v_html, 'UTF8')), 'hex');

  RETURN jsonb_build_object(
    'html', v_html,
    'sha256', v_sha,
    'title', v_title,
    'file_name', 'care-record-' || COALESCE(nullif(v_slug, ''), 'provider') || '-' || v_stamp || '.html',
    'document_date', v_stamp,
    'notes', format('Filed by OneCare: %s. Preserved record of %s message(s), %s guidance item(s), '
                    || '%s document(s) and %s relationship event(s). SHA-256 %s.',
                    v_reason, v_n_msg, v_n_guid, v_n_doc, v_n_led, v_sha),
    'patient_user_id', v_job.patient_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.care_record_entries(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compile_care_record_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compile_care_record_snapshot(uuid) TO service_role;

-- ===========================================================================
-- 7. OneCare's evidence survives the account
-- ===========================================================================

ALTER TABLE public.legal_acceptances
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS subject_id_sha256 text,
  ADD COLUMN IF NOT EXISTS subject_email_sha256 text;
ALTER TABLE public.consent_logs
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS subject_id_sha256 text,
  ADD COLUMN IF NOT EXISTS subject_email_sha256 text;
ALTER TABLE public.baa_agreements
  ALTER COLUMN clinician_user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS subject_id_sha256 text,
  ADD COLUMN IF NOT EXISTS subject_email_sha256 text;

/**
 * Stamp the hashes that keep a row attributable once its account is gone.
 * Written when the row is, so they exist before any deletion; kept when the
 * foreign key later nulls the account column. The email is the one on the
 * account at the time, which is the address the person agreed under.
 * TG_ARGV[0] names the account column.
 */
CREATE OR REPLACE FUNCTION public.stamp_evidence_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
BEGIN
  IF _uid IS NOT NULL THEN
    NEW.subject_id_sha256 := encode(sha256(convert_to(_uid::text, 'UTF8')), 'hex');
    NEW.subject_email_sha256 := COALESCE(
      (SELECT encode(sha256(convert_to(lower(btrim(u.email)), 'UTF8')), 'hex')
         FROM auth.users u WHERE u.id = _uid AND u.email IS NOT NULL),
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.subject_email_sha256 END);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.subject_id_sha256    := OLD.subject_id_sha256;
    NEW.subject_email_sha256 := OLD.subject_email_sha256;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_evidence_subject() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_evidence_subject ON public.legal_acceptances;
CREATE TRIGGER trg_stamp_evidence_subject
  BEFORE INSERT OR UPDATE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.stamp_evidence_subject('user_id');
DROP TRIGGER IF EXISTS trg_stamp_evidence_subject ON public.consent_logs;
CREATE TRIGGER trg_stamp_evidence_subject
  BEFORE INSERT OR UPDATE ON public.consent_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_evidence_subject('user_id');
DROP TRIGGER IF EXISTS trg_stamp_evidence_subject ON public.baa_agreements;
CREATE TRIGGER trg_stamp_evidence_subject
  BEFORE INSERT OR UPDATE ON public.baa_agreements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_evidence_subject('clinician_user_id');

-- Rows written before this migration get their hashes now, while every
-- account they name still exists.
UPDATE public.legal_acceptances SET user_id = user_id WHERE subject_id_sha256 IS NULL AND user_id IS NOT NULL;
UPDATE public.consent_logs SET user_id = user_id WHERE subject_id_sha256 IS NULL AND user_id IS NOT NULL;
UPDATE public.baa_agreements SET clinician_user_id = clinician_user_id WHERE subject_id_sha256 IS NULL AND clinician_user_id IS NOT NULL;

ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_user_id_fkey;
ALTER TABLE public.legal_acceptances
  ADD CONSTRAINT legal_acceptances_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.consent_logs DROP CONSTRAINT IF EXISTS consent_logs_user_id_fkey;
ALTER TABLE public.consent_logs
  ADD CONSTRAINT consent_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.baa_agreements DROP CONSTRAINT IF EXISTS baa_agreements_clinician_user_id_fkey;
ALTER TABLE public.baa_agreements
  ADD CONSTRAINT baa_agreements_clinician_user_id_fkey
  FOREIGN KEY (clinician_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.beta_nda_signatures DROP CONSTRAINT IF EXISTS beta_nda_signatures_tester_id_fkey;
ALTER TABLE public.beta_nda_signatures
  ADD CONSTRAINT beta_nda_signatures_tester_id_fkey
  FOREIGN KEY (tester_id) REFERENCES public.beta_testers(id) ON DELETE SET NULL;

-- RLS already had no UPDATE or DELETE policy on these, so a signed-in write
-- affected nothing. The grants said otherwise; now they agree, and a policy
-- added carelessly later cannot open them.
REVOKE UPDATE, DELETE, TRUNCATE ON public.legal_acceptances FROM authenticated, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.consent_logs FROM authenticated, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.baa_agreements FROM authenticated, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.beta_nda_signatures FROM authenticated, anon;

COMMENT ON COLUMN public.legal_acceptances.subject_email_sha256 IS
  'SHA-256 of the lower-cased account email when accepted. Keeps the acceptance attributable after the account is deleted and user_id is nulled.';
COMMENT ON COLUMN public.consent_logs.subject_email_sha256 IS
  'SHA-256 of the lower-cased account email when logged. Keeps the entry attributable after the account is deleted and user_id is nulled.';
COMMENT ON COLUMN public.baa_agreements.subject_email_sha256 IS
  'SHA-256 of the lower-cased account email when signed. Keeps the agreement attributable after the account is deleted and clinician_user_id is nulled.';
