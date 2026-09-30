-- Care record snapshots, made by the server
--
-- The consent model promises that every relationship closes with a care record
-- snapshot: generated at disconnection and quarterly, watermarked, filed in the
-- patient's Vault, and undeletable by either party. What existed was a function
-- in the patient's browser, called from one place (a patient ending a claimed
-- private share from Care Circle). So:
--
--   - Nothing was filed when a hospital share ended, from either side, when a
--     platform admin closed a share, or when a share expired, and nothing was
--     filed quarterly. There was no producer for any of those.
--   - Closing the tab before the upload finished meant no record, silently.
--   - The row it wrote was the patient's own upload: uploaded_by_user_id NULL,
--     so "Patients delete only documents they filed themselves" let the patient
--     delete it, the UPDATE policy let them rewrite its title, notes and file
--     path, and owner_may_remove_document let them delete or overwrite the
--     file. "Permanent record" was a padlock icon in DocumentCard, nothing more.
--   - Any patient could insert a row with source_context 'care_record_snapshot'
--     and it displayed as a permanent record. Once this migration makes those
--     rows undeletable, a forged one would be exactly as durable as a real one.
--   - Whole-vault access handed the snapshot of one clinician's conversation to
--     any other clinician or hospital the patient had opened the Vault to.
--
-- And one neighbouring hole found while checking the deletion rules the task
-- pointed at: the patient's UPDATE policy on health_documents has no column
-- restriction, so a patient could set uploaded_by_user_id to NULL on a
-- document a clinician sent them and then delete it under the "filed it
-- themselves" rule. Tested before this migration: the row was gone. That is a
-- class (b) care record, which the same section of the model says neither party
-- may delete.
--
-- What this does:
--
--   1. A queue, care_record_snapshot_jobs, one row per relationship per event:
--      a disconnection (keyed by when it ended), an expiry (keyed by the expiry
--      time), a quarter (keyed by the quarter it closes), or a patient's own
--      request. A unique index makes every trigger idempotent.
--   2. Triggers on provider_shares and practice_shares queue a snapshot when
--      is_active goes from true to false, whoever did it.
--   3. enqueue_due_care_record_snapshots(), run hourly by pg_cron, queues
--      expiries (and writes the 'expired' event the ledger vocabulary always had
--      and nothing ever wrote), picks up any ending in the last week the trigger
--      somehow missed, and in the first week of each quarter queues live
--      relationships with activity since their last snapshot.
--   4. compile_care_record_snapshot() builds the record in SQL, as the definer,
--      so no client read rule is involved: messages both ways, guidance,
--      documents the clinician or hospital sent, and the relationship ledger,
--      escaped, watermarked, with a SHA-256 of the exact bytes. The
--      care-record-snapshots edge function uploads it and calls
--      file_care_record_snapshot(), which files it in the patient's Vault.
--   5. A guard trigger on health_documents: a care record snapshot cannot be
--      deleted by anyone, including the service role, and cannot be edited
--      except to file it in a folder, archive it, or attach an AI summary;
--      a client cannot create one or relabel something as one; and a client can
--      no longer change who filed a document, where its file is, or whether it
--      was withdrawn.
--   6. owner_may_remove_document refuses a snapshot's file, and the whole-vault
--      read policies exclude snapshots the way they already exclude recordings.
--      A patient can still share one deliberately, one document at a time.
--
-- What it does not do: rows filed by the old browser path cannot be told apart
-- from forged ones (both were patient inserts). They are protected like the
-- rest, because the patient was told they were permanent; a snapshot the server
-- filed is the one with a job row pointing at it.

-- ---------------------------------------------------------------------------
-- 1. The queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.care_record_snapshot_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id   uuid NOT NULL,
  relationship_kind text NOT NULL CHECK (relationship_kind IN ('private_share', 'hospital_share')),
  -- The share this record is for. Kept as a plain id too, because the job and
  -- the record it filed outlive the share row if it ever goes.
  relationship_id   uuid NOT NULL,
  provider_share_id uuid REFERENCES public.provider_shares(id) ON DELETE SET NULL,
  practice_share_id uuid REFERENCES public.practice_shares(id) ON DELETE SET NULL,
  clinician_user_id uuid,
  practice_id       uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  trigger_kind      text NOT NULL CHECK (trigger_kind IN ('disconnected', 'expired', 'quarterly', 'requested')),
  trigger_key       text NOT NULL,
  requested_by      uuid,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'filed', 'failed')),
  attempts          integer NOT NULL DEFAULT 0,
  last_error        text,
  claimed_at        timestamptz,
  document_id       uuid REFERENCES public.health_documents(id) ON DELETE RESTRICT,
  content_sha256    text,
  filed_at          timestamptz,
  CONSTRAINT care_record_job_names_one_share CHECK (num_nonnulls(provider_share_id, practice_share_id) <= 1),
  CONSTRAINT care_record_job_filed_has_document CHECK (status <> 'filed' OR document_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS care_record_job_once_per_event
  ON public.care_record_snapshot_jobs (relationship_id, trigger_kind, trigger_key);
CREATE INDEX IF NOT EXISTS care_record_jobs_open
  ON public.care_record_snapshot_jobs (requested_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS care_record_jobs_patient
  ON public.care_record_snapshot_jobs (patient_user_id);

COMMENT ON TABLE public.care_record_snapshot_jobs IS
  'One row per care record snapshot owed: a relationship ended, expired, reached '
  'a quarter, or the patient asked. Written only by the server. The unique index '
  'on (relationship_id, trigger_kind, trigger_key) is what makes every producer '
  'safe to run twice.';

ALTER TABLE public.care_record_snapshot_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.care_record_snapshot_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.care_record_snapshot_jobs TO authenticated;
GRANT ALL ON public.care_record_snapshot_jobs TO service_role;

DROP POLICY IF EXISTS "Patients see their own care record jobs" ON public.care_record_snapshot_jobs;
CREATE POLICY "Patients see their own care record jobs"
  ON public.care_record_snapshot_jobs FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Small helpers
-- ---------------------------------------------------------------------------

-- A timestamp as a key that does not depend on the session's TimeZone, so the
-- trigger and the sweep derive the same key for the same ending.
CREATE OR REPLACE FUNCTION public.care_record_utc_key(_ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT to_char(_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

CREATE OR REPLACE FUNCTION public.care_record_html(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT replace(replace(replace(replace(replace(replace(
           COALESCE(_t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'),
         E'\n', '<br/>');
$$;

CREATE OR REPLACE FUNCTION public.care_record_when(_ts timestamptz, _tz text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN _ts IS NULL THEN '—'
              ELSE to_char(_ts AT TIME ZONE _tz, 'DD Mon YYYY, HH24:MI') END;
$$;

CREATE OR REPLACE FUNCTION public.care_record_person_label(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT nullif(btrim(concat_ws(' ', nullif(btrim(cp.title), ''),
                                        nullif(btrim(cp.first_name), ''),
                                        nullif(btrim(cp.last_name), ''))), '')
       FROM public.clinician_profiles cp
      WHERE cp.user_id = _user_id
        AND (nullif(btrim(cp.first_name), '') IS NOT NULL OR nullif(btrim(cp.last_name), '') IS NOT NULL)
      LIMIT 1),
    (SELECT nullif(btrim(p.name), '') FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1),
    'A clinician'
  );
$$;

-- The account on the other side of a private share: whoever claimed it, or a
-- confirmed account under its address (the same rule on_share_ended and
-- clinician_has_patient_access apply). NULL: nobody was ever there.
CREATE OR REPLACE FUNCTION public.care_record_counterparty(_share_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ps.clinician_user_id,
    (SELECT u.id FROM auth.users u
      WHERE u.email_confirmed_at IS NOT NULL
        AND lower(u.email) = lower(ps.provider_email)
      LIMIT 1)
  )
  FROM public.provider_shares ps
  WHERE ps.id = _share_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. What belongs to one relationship's record
-- ---------------------------------------------------------------------------
--
-- One definition, used both to build the record and to decide whether a
-- quarter had anything new in it, so the two cannot come to disagree.
--
-- Private share: the thread between the patient and that clinician with no
-- practice on it (stamp_message_context puts every hospital-context message
-- under its practice), everything that clinician issued or sent the patient,
-- and the ledger of every share between the two.
--
-- Hospital share: the hospital's thread (messages.practice_id), and guidance
-- and documents whose author was on the hospital's team at the time. Guidance
-- carries no practice of its own, so attribution is by membership; a clinician
-- who also treats the patient privately can appear in both records. Duplication
-- in the patient's own copy is the safe direction — a gap is not.

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
  -- Guidance
  SELECT 'guidance', g.created_at, g.clinician_user_id, g.title, g.instruction,
         jsonb_build_object('priority', g.priority, 'due_date', g.due_date, 'status', g.status,
                            'acknowledged_at', g.acknowledged_at, 'completed_at', g.completed_at)
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

-- ---------------------------------------------------------------------------
-- 4. Queueing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_care_record_snapshot(
  _share_id uuid, _trigger text, _key text, _requested_by uuid, _requested_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ps   public.provider_shares%ROWTYPE;
  v_hs   public.practice_shares%ROWTYPE;
  v_clin uuid;
  v_id   uuid;
BEGIN
  SELECT * INTO v_ps FROM public.provider_shares WHERE id = _share_id;
  IF FOUND THEN
    v_clin := public.care_record_counterparty(_share_id);
    -- An invitation nobody ever held has nothing between two parties to record;
    -- its ledger stays in the patient's sharing history.
    IF v_clin IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.care_record_snapshot_jobs (
      patient_user_id, relationship_kind, relationship_id, provider_share_id,
      clinician_user_id, trigger_kind, trigger_key, requested_by, requested_at
    ) VALUES (
      v_ps.user_id, 'private_share', _share_id, _share_id,
      v_clin, _trigger, _key, _requested_by, _requested_at
    )
    ON CONFLICT (relationship_id, trigger_kind, trigger_key) DO NOTHING
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_hs FROM public.practice_shares WHERE id = _share_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.care_record_snapshot_jobs (
      patient_user_id, relationship_kind, relationship_id, practice_share_id,
      practice_id, trigger_kind, trigger_key, requested_by, requested_at
    ) VALUES (
      v_hs.user_id, 'hospital_share', _share_id, _share_id,
      v_hs.practice_id, _trigger, _key, _requested_by, _requested_at
    )
    ON CONFLICT (relationship_id, trigger_kind, trigger_key) DO NOTHING
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.care_record_snapshot_jobs
     WHERE relationship_id = _share_id AND trigger_kind = _trigger AND trigger_key = _key;
  END IF;
  RETURN v_id;
END;
$$;

-- On disconnection, whoever did it: the patient, the hospital, a platform
-- admin, or a server-side revocation. Keyed by the moment it ended, so a
-- relationship that reconnects and ends again gets a second record, and an
-- unrelated edit to an ended share gets none.
CREATE OR REPLACE FUNCTION public.enqueue_care_record_on_share_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  v_at := CASE
    WHEN NEW.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN NEW.revoked_at
    ELSE now()
  END;
  -- Ending access is consent being withdrawn and must never fail because a
  -- record could not be queued. If it cannot be, say so in the log; the hourly
  -- sweep queues any ending from the past week that has no job.
  BEGIN
    PERFORM public.enqueue_care_record_snapshot(
      NEW.id, 'disconnected', public.care_record_utc_key(v_at),
      COALESCE(auth.uid(), NEW.revoked_by), now());
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'care record snapshot for share % could not be queued: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_share_care_record ON public.provider_shares;
CREATE TRIGGER trg_provider_share_care_record
AFTER UPDATE OF is_active ON public.provider_shares
FOR EACH ROW
WHEN (OLD.is_active AND NOT NEW.is_active)
EXECUTE FUNCTION public.enqueue_care_record_on_share_end();

DROP TRIGGER IF EXISTS trg_practice_share_care_record ON public.practice_shares;
CREATE TRIGGER trg_practice_share_care_record
AFTER UPDATE OF is_active ON public.practice_shares
FOR EACH ROW
WHEN (OLD.is_active AND NOT NEW.is_active)
EXECUTE FUNCTION public.enqueue_care_record_on_share_end();

/**
 * The hourly sweep. Three passes, each idempotent:
 *
 *   expiry     — a share past expires_at is over even though nobody touched
 *                is_active; it gets its snapshot and its 'expired' ledger entry.
 *   safety net — an ending in the last seven days with no job at or after it
 *                (the trigger's enqueue failed and only warned).
 *   quarterly  — in the first week of a quarter, every live relationship with
 *                something new since its last snapshot and before the quarter
 *                began, labelled with the quarter that closed. Restricted to the
 *                first week because that window is fixed once the quarter starts:
 *                evaluating it again later finds nothing new, only cost.
 */
CREATE OR REPLACE FUNCTION public.enqueue_due_care_record_snapshots(_as_of timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            record;
  v_id         uuid;
  v_key        text;
  v_since      timestamptz;
  v_q_start    timestamptz := date_trunc('quarter', _as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_label      text;
  v_expired    integer := 0;
  v_missed     integer := 0;
  v_quarterly  integer := 0;
BEGIN
  v_label := to_char((v_q_start - interval '1 day') AT TIME ZONE 'UTC', 'YYYY-"Q"Q');

  -- Expiry
  FOR r IN
    SELECT ps.* FROM public.provider_shares ps
     WHERE ps.is_active
       AND ps.expires_at IS NOT NULL
       AND ps.expires_at <= _as_of
       AND NOT EXISTS (
         SELECT 1 FROM public.care_record_snapshot_jobs j
          WHERE j.relationship_id = ps.id AND j.trigger_kind = 'expired'
            AND j.trigger_key = public.care_record_utc_key(ps.expires_at))
  LOOP
    v_id := public.enqueue_care_record_snapshot(
      r.id, 'expired', public.care_record_utc_key(r.expires_at), NULL, _as_of);
    IF v_id IS NOT NULL THEN
      INSERT INTO public.share_events (
        share_id, patient_user_id, clinician_user_id, provider_label,
        event_type, actor_user_id, actor_role, details, created_at
      ) VALUES (
        r.id, r.user_id, r.clinician_user_id, r.provider_name,
        'expired', NULL, 'system',
        jsonb_build_object('expires_at', r.expires_at, 'permissions', r.permissions),
        LEAST(r.expires_at, _as_of)
      );
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  -- Safety net for endings the trigger could not queue
  FOR r IN
    SELECT x.id, x.revoked_at FROM (
      SELECT ps.id, ps.revoked_at FROM public.provider_shares ps
       WHERE NOT ps.is_active AND ps.revoked_at IS NOT NULL
      UNION ALL
      SELECT hs.id, hs.revoked_at FROM public.practice_shares hs
       WHERE NOT hs.is_active AND hs.revoked_at IS NOT NULL
    ) x
     WHERE x.revoked_at > _as_of - interval '7 days'
       AND x.revoked_at <= _as_of
       AND NOT EXISTS (
         SELECT 1 FROM public.care_record_snapshot_jobs j
          WHERE j.relationship_id = x.id
            AND j.requested_at >= x.revoked_at - interval '1 minute')
  LOOP
    v_id := public.enqueue_care_record_snapshot(
      r.id, 'disconnected', public.care_record_utc_key(r.revoked_at), NULL, _as_of);
    IF v_id IS NOT NULL THEN
      v_missed := v_missed + 1;
    END IF;
  END LOOP;

  -- Quarterly
  IF _as_of < v_q_start + interval '7 days' THEN
    FOR r IN
      SELECT ps.id, ps.user_id AS patient, public.care_record_counterparty(ps.id) AS clinician, NULL::uuid AS practice
        FROM public.provider_shares ps
       WHERE ps.is_active AND (ps.expires_at IS NULL OR ps.expires_at > _as_of)
      UNION ALL
      SELECT hs.id, hs.user_id, NULL, hs.practice_id
        FROM public.practice_shares hs
       WHERE hs.is_active
    LOOP
      CONTINUE WHEN r.practice IS NULL AND r.clinician IS NULL;
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.care_record_snapshot_jobs j
         WHERE j.relationship_id = r.id AND j.trigger_kind = 'quarterly' AND j.trigger_key = v_label);

      SELECT max(j.requested_at) INTO v_since
        FROM public.care_record_snapshot_jobs j
       WHERE j.relationship_id = r.id AND j.status <> 'failed';

      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM public.care_record_entries(r.patient, r.clinician, r.practice, r.id) e
         WHERE e.occurred_at > COALESCE(v_since, '-infinity'::timestamptz)
           AND e.occurred_at < v_q_start);

      v_id := public.enqueue_care_record_snapshot(r.id, 'quarterly', v_label, NULL, _as_of);
      IF v_id IS NOT NULL THEN
        v_quarterly := v_quarterly + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('expired', v_expired, 'missed_endings', v_missed,
                            'quarterly', v_quarterly, 'quarter', v_label);
END;
$$;

-- The patient asking for one now. Only the patient: a clinician filing into
-- somebody else's Vault is exactly what this record must not become.
CREATE OR REPLACE FUNCTION public.request_care_record_snapshot(_share_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_shares WHERE id = _share_id AND user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.practice_shares WHERE id = _share_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Only the patient can file a care record for this connection' USING ERRCODE = '42501';
  END IF;

  -- A double tap, or a second tap while the first is still being prepared,
  -- is the same request.
  SELECT id INTO v_id FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _share_id AND trigger_kind = 'requested'
     AND (status IN ('pending', 'processing') OR requested_at > now() - interval '1 minute')
   ORDER BY requested_at DESC
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_id := public.enqueue_care_record_snapshot(_share_id, 'requested', gen_random_uuid()::text, v_uid, now());
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'This provider has not joined OneCare, so there is no record between you to file'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The worker's side: claim, compile, file, fail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_care_record_snapshot_jobs(
  _limit integer DEFAULT 10, _job_id uuid DEFAULT NULL, _patient uuid DEFAULT NULL
)
RETURNS SETOF public.care_record_snapshot_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A worker that died mid-job leaves it 'processing'. After fifteen minutes
  -- it is picked up again, and after five attempts it stops and says so.
  UPDATE public.care_record_snapshot_jobs
     SET status = 'failed',
         last_error = COALESCE(last_error, 'worker did not finish')
   WHERE status = 'processing' AND claimed_at < now() - interval '15 minutes' AND attempts >= 5;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.care_record_snapshot_jobs j
     WHERE (j.status = 'pending'
            OR (j.status = 'processing' AND j.claimed_at < now() - interval '15 minutes'))
       AND j.attempts < 5
       AND (_job_id IS NULL OR j.id = _job_id)
       AND (_patient IS NULL OR j.patient_user_id = _patient)
     ORDER BY j.requested_at
     LIMIT greatest(1, least(COALESCE(_limit, 10), 50))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.care_record_snapshot_jobs j
     SET status = 'processing', attempts = j.attempts + 1, claimed_at = now()
    FROM picked
   WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;

/**
 * Build the record for one job. Returns the HTML and everything needed to file
 * it: title, file name, notes, date, and the SHA-256 of the HTML's UTF-8
 * bytes, which the worker checks against what it uploads and which is stored on
 * the job and in the document's notes.
 */
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
           public.care_record_html(COALESCE(r.extra ->> 'status', '—'))
             || CASE WHEN r.extra ->> 'acknowledged_at' IS NOT NULL
                     THEN '<br/>Acknowledged ' || public.care_record_when((r.extra ->> 'acknowledged_at')::timestamptz, v_tz)
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

/**
 * File an uploaded record into the patient's Vault and close the job. Filing a
 * job that is already filed returns its record, so a worker retrying after a
 * lost response cannot file twice.
 */
CREATE OR REPLACE FUNCTION public.file_care_record_snapshot(
  _job_id uuid, _file_path text, _file_size integer, _compiled jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.care_record_snapshot_jobs%ROWTYPE;
  v_doc uuid;
  v_sha text := _compiled ->> 'sha256';
BEGIN
  SELECT * INTO v_job FROM public.care_record_snapshot_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No care record job %', _job_id;
  END IF;
  IF v_job.status = 'filed' THEN
    RETURN v_job.document_id;
  END IF;
  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'Care record job % has not been claimed', _job_id;
  END IF;
  IF _file_path IS NULL OR split_part(_file_path, '/', 1) <> v_job.patient_user_id::text THEN
    RAISE EXCEPTION 'A care record is filed in its patient''s own folder';
  END IF;
  IF v_sha IS NULL OR v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'A care record is filed with the digest of its contents';
  END IF;

  INSERT INTO public.health_documents (
    user_id, file_path, file_name, file_size, mime_type, title, category,
    document_date, notes, tags, source_context, family_member_id, uploaded_by_user_id
  ) VALUES (
    v_job.patient_user_id, _file_path,
    left(COALESCE(_compiled ->> 'file_name', 'care-record.html'), 255),
    _file_size, 'text/html',
    left(COALESCE(_compiled ->> 'title', 'Care record'), 500),
    'care_record',
    (_compiled ->> 'document_date')::date,
    _compiled ->> 'notes',
    '[]'::jsonb, 'care_record_snapshot', NULL, NULL
  )
  RETURNING id INTO v_doc;

  UPDATE public.care_record_snapshot_jobs
     SET status = 'filed', document_id = v_doc, content_sha256 = v_sha,
         filed_at = now(), last_error = NULL
   WHERE id = _job_id;
  RETURN v_doc;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_care_record_snapshot_job(_job_id uuid, _error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.care_record_snapshot_jobs
     SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
         last_error = left(COALESCE(_error, 'unknown error'), 500),
         claimed_at = NULL
   WHERE id = _job_id AND status = 'processing';
$$;

-- ---------------------------------------------------------------------------
-- 6. The record stays what it is
-- ---------------------------------------------------------------------------
--
-- Invoker rights on purpose, as stamp_record_context: current_user then says
-- whether the write came from a client or from a definer function such as
-- file_care_record_snapshot or withdraw_document.

CREATE OR REPLACE FUNCTION public.guard_health_document_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_client boolean := current_user IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Nobody, the server included: a cleanup script is how most records that
    -- were meant to be permanent actually go missing.
    IF OLD.source_context = 'care_record_snapshot' THEN
      RAISE EXCEPTION 'A care record is permanent and cannot be deleted by the patient, the clinician or OneCare'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_client AND (NEW.source_context = 'care_record_snapshot' OR NEW.category = 'care_record') THEN
      RAISE EXCEPTION 'Care records are filed by OneCare, not uploaded'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.source_context = 'care_record_snapshot' THEN
    -- Filing it in a folder, archiving it, and an AI summary beside it are the
    -- patient organising their own Vault. The record itself does not move.
    IF (NEW.id, NEW.user_id, NEW.family_member_id, NEW.file_path, NEW.file_name, NEW.file_size,
        NEW.mime_type, NEW.category, NEW.title, NEW.notes, NEW.document_date, NEW.created_at,
        NEW.source_context, NEW.uploaded_by_user_id, NEW.retracted_at, NEW.retracted_by,
        NEW.retraction_reason, NEW.tags)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.family_member_id, OLD.file_path, OLD.file_name, OLD.file_size,
        OLD.mime_type, OLD.category, OLD.title, OLD.notes, OLD.document_date, OLD.created_at,
        OLD.source_context, OLD.uploaded_by_user_id, OLD.retracted_at, OLD.retracted_by,
        OLD.retraction_reason, OLD.tags) THEN
      RAISE EXCEPTION 'A care record cannot be edited; it can be filed in a folder or archived'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF v_client THEN
    IF NEW.source_context = 'care_record_snapshot'
       OR (NEW.category = 'care_record' AND OLD.category IS DISTINCT FROM 'care_record') THEN
      RAISE EXCEPTION 'Only OneCare files care records; a document cannot be relabelled as one'
        USING ERRCODE = '42501';
    END IF;
    -- Blanking uploaded_by_user_id turned a clinician's document into the
    -- patient's own, which the DELETE policy then let them remove.
    IF (NEW.id, NEW.user_id, NEW.file_path, NEW.source_context, NEW.uploaded_by_user_id,
        NEW.retracted_at, NEW.retracted_by, NEW.retraction_reason, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.file_path, OLD.source_context, OLD.uploaded_by_user_id,
        OLD.retracted_at, OLD.retracted_by, OLD.retraction_reason, OLD.created_at) THEN
      RAISE EXCEPTION 'Who filed a document, where its file is, and whether it was withdrawn are recorded by OneCare and cannot be changed'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_health_document_record() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_health_document_record ON public.health_documents;
CREATE TRIGGER trg_guard_health_document_record
BEFORE INSERT OR UPDATE OR DELETE ON public.health_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_health_document_record();

-- The file behind it: the owner may remove or replace only their own upload,
-- only while it stands, and never a care record.
CREATE OR REPLACE FUNCTION public.owner_may_remove_document(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM public.health_documents d
       WHERE d.file_path = _file_path
         AND (
           -- Somebody else filed it. Theirs to withdraw, not the reader's to
           -- destroy.
           d.uploaded_by_user_id IS NOT NULL
           -- Or it is already withdrawn, and the file is incident evidence.
           OR d.retracted_at IS NOT NULL
           -- Or it is a care record, which nobody removes.
           OR d.source_context = 'care_record_snapshot'
         )
    )
    END;
$function$;

-- Whole-vault access is to the patient's documents, not to the record of their
-- conversations with somebody else. Same exclusion recordings already have; a
-- patient who wants a clinician to see one shares that one document.
DROP POLICY IF EXISTS "Clinicians can view whole vault when granted" ON public.health_documents;
CREATE POLICY "Clinicians can view whole vault when granted"
  ON public.health_documents FOR SELECT TO authenticated
  USING (
    retracted_at IS NULL
    AND archived_at IS NULL
    AND COALESCE(source_context, '') NOT IN ('patient_recording', 'care_record_snapshot')
    AND public.clinician_has_patient_permission(user_id, 'documents')
  );

DROP POLICY IF EXISTS "Institution team can view shared documents" ON public.health_documents;
CREATE POLICY "Institution team can view shared documents"
  ON public.health_documents FOR SELECT TO authenticated
  USING (
    retracted_at IS NULL
    AND archived_at IS NULL
    AND COALESCE(source_context, '') NOT IN ('patient_recording', 'care_record_snapshot')
    AND public.institution_has_clinical_permission(user_id, 'documents')
  );

-- ---------------------------------------------------------------------------
-- 7. Who may call what
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.care_record_utc_key(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_record_html(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_record_when(timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_record_person_label(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_record_counterparty(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_record_entries(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_care_record_snapshot(uuid, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_care_record_on_share_end() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enqueue_due_care_record_snapshots(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_care_record_snapshot_jobs(integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compile_care_record_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.file_care_record_snapshot(uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_care_record_snapshot_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_care_record_snapshots(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_care_record_snapshot_jobs(integer, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.compile_care_record_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.file_care_record_snapshot(uuid, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_care_record_snapshot_job(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.request_care_record_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_care_record_snapshot(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Schedule
-- ---------------------------------------------------------------------------
--
-- The sweep runs in the database, so endings and expiries are queued even if
-- the worker is not deployed or is failing; the worker then files whatever is
-- queued. Same credential as the other scheduled functions.
SELECT cron.schedule(
  'care-record-snapshots-hourly',
  '20 * * * *',
  $$
  SELECT public.enqueue_due_care_record_snapshots();
  SELECT net.http_post(
    url := 'https://cwngpcxxwvspcpkbxeax.supabase.co/functions/v1/care-record-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_auth WHERE id = 'internal')
    ),
    body := '{}'::jsonb
  );
  $$
);
