-- ---------------------------------------------------------------------------
-- Founder command centre, phase 3: Reliability and Trust.
--
-- Reliability answers "what broke" from the signals already stored in this
-- database. Log sources that live outside Postgres — edge function logs, auth
-- logs — are not invented here; the console says plainly that it reports what
-- the database can see.
--
-- Trust answers "who can see whom, and did they agree to it". It returns the
-- existence and shape of consent, never the record the consent covers. The
-- details column of the audit tables is never returned for the same reason:
-- it can carry the shape of a clinical record.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Reliability: the last day and the last week, by failure kind.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reliability_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _day timestamptz := now() - interval '24 hours';
  _week timestamptz := now() - interval '7 days';
  _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT jsonb_build_object(
    'record_exchange', jsonb_build_object(
      'connections', (SELECT count(*) FROM public.ehr_connections WHERE is_active),
      'connections_in_error', (SELECT count(*) FROM public.ehr_connections
                                WHERE is_active AND sync_status = 'error'),
      'failures_24h', (SELECT count(*) FROM public.ehr_sync_logs
                        WHERE status IN ('error', 'failed') AND created_at > _day),
      'failures_7d', (SELECT count(*) FROM public.ehr_sync_logs
                       WHERE status IN ('error', 'failed') AND created_at > _week),
      'successes_24h', (SELECT count(*) FROM public.ehr_sync_logs
                         WHERE status NOT IN ('error', 'failed') AND created_at > _day),
      'never_synced', (SELECT count(*) FROM public.ehr_connections
                        WHERE is_active AND last_sync_at IS NULL)
    ),

    'export_queue', jsonb_build_object(
      'pending', (SELECT count(*) FROM public.ehr_export_queue
                   WHERE coalesce(status, 'pending') = 'pending'),
      'failed', (SELECT count(*) FROM public.ehr_export_queue
                  WHERE coalesce(status, 'pending') IN ('error', 'failed')),
      -- Anything retried repeatedly is stuck rather than merely slow.
      'stuck', (SELECT count(*) FROM public.ehr_export_queue
                 WHERE coalesce(status, 'pending') <> 'exported'
                   AND coalesce(attempts, 0) >= 3),
      'oldest_pending_at', (SELECT min(created_at) FROM public.ehr_export_queue
                             WHERE coalesce(status, 'pending') = 'pending')
    ),

    -- The database records that an assistant conversation happened, not what
    -- it cost. Spend lives with the model provider, so it is reported as
    -- volume here and the panel says so rather than implying a currency total.
    'assistant', jsonb_build_object(
      'conversations_24h', (SELECT count(*) FROM public.ai_conversations WHERE created_at > _day),
      'conversations_7d', (SELECT count(*) FROM public.ai_conversations WHERE created_at > _week),
      'messages_24h', (SELECT count(*) FROM public.ai_messages WHERE created_at > _day),
      'messages_7d', (SELECT count(*) FROM public.ai_messages WHERE created_at > _week)
    ),

    'dictation', jsonb_build_object(
      'failed_24h', (SELECT count(*) FROM public.clinician_dictations
                      WHERE status = 'error' AND created_at > _day),
      'failed_7d', (SELECT count(*) FROM public.clinician_dictations
                     WHERE status = 'error' AND created_at > _week),
      'awaiting_review', (SELECT count(*) FROM public.clinician_dictations
                           WHERE status NOT IN ('error', 'filed')
                             AND archived_at IS NULL)
    ),

    'sign_in', jsonb_build_object(
      'throttled_24h', (SELECT count(*) FROM public.rate_limit_events WHERE created_at > _day),
      'throttled_7d', (SELECT count(*) FROM public.rate_limit_events WHERE created_at > _week),
      'partner_failures_24h', (SELECT count(*) FROM public.kingschat_login_attempts
                                WHERE status = 'failed' AND created_at > _day),
      'top_buckets', coalesce((
        SELECT jsonb_agg(b ORDER BY (b->>'count')::bigint DESC)
          FROM (
            SELECT jsonb_build_object('bucket', bucket, 'count', count(*)) AS b
              FROM public.rate_limit_events
             WHERE created_at > _week
             GROUP BY bucket
             ORDER BY count(*) DESC
             LIMIT 5
          ) s
      ), '[]'::jsonb)
    ),

    'alerts', jsonb_build_object(
      'vital_alerts_24h', (SELECT count(*) FROM public.alert_logs WHERE created_at > _day),
      'unacknowledged', (SELECT count(*) FROM public.alert_logs
                          WHERE acknowledged_at IS NULL AND created_at > _week),
      'caregiver_alerts_7d', (SELECT count(*) FROM public.care_alert_logs WHERE sent_at > _week)
    ),

    'checked_at', now()
  ) INTO _out;

  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.admin_reliability_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reliability_overview() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Which connections are failing, and what they last said.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_sync_failures(_limit integer DEFAULT 25)
RETURNS TABLE (
  connection_id uuid,
  provider_name text,
  provider_type text,
  sync_status text,
  last_sync_at timestamptz,
  failures_7d bigint,
  last_error text,
  last_failed_at timestamptz,
  queued_exports bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lim integer := greatest(1, least(coalesce(_limit, 25), 100));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.provider_name,
    c.provider_type,
    coalesce(c.sync_status, 'pending'),
    c.last_sync_at,
    (SELECT count(*) FROM public.ehr_sync_logs l
      WHERE l.connection_id = c.id
        AND l.status IN ('error', 'failed')
        AND l.created_at > now() - interval '7 days'),
    coalesce(
      (SELECT left(coalesce(l.error_details->>'message', l.error_details::text), 200)
         FROM public.ehr_sync_logs l
        WHERE l.connection_id = c.id AND l.status IN ('error', 'failed')
        ORDER BY l.created_at DESC LIMIT 1),
      c.error_message),
    (SELECT max(l.created_at) FROM public.ehr_sync_logs l
      WHERE l.connection_id = c.id AND l.status IN ('error', 'failed')),
    (SELECT count(*) FROM public.ehr_export_queue q
      WHERE q.connection_id = c.id AND coalesce(q.status, 'pending') <> 'exported')
  FROM public.ehr_connections c
  WHERE c.is_active
  ORDER BY
    (SELECT count(*) FROM public.ehr_sync_logs l
      WHERE l.connection_id = c.id
        AND l.status IN ('error', 'failed')
        AND l.created_at > now() - interval '7 days') DESC,
    c.last_sync_at DESC NULLS FIRST
  LIMIT _lim;
END $$;

REVOKE ALL ON FUNCTION public.admin_sync_failures(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sync_failures(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Put a stalled export back in the queue. Clears the attempt count so the
-- worker treats it as new work rather than skipping it as exhausted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_requeue_ehr_exports(_connection_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.ehr_export_queue
     SET status = 'pending',
         attempts = 0,
         error_message = NULL
   WHERE connection_id = _connection_id
     AND coalesce(status, 'pending') <> 'exported';

  GET DIAGNOSTICS _count = ROW_COUNT;

  PERFORM public.log_platform_admin_action(
    'requeue_ehr_exports', 'ehr_connection', _connection_id,
    jsonb_build_object('requeued', _count)
  );

  RETURN _count;
END $$;

REVOKE ALL ON FUNCTION public.admin_requeue_ehr_exports(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_requeue_ehr_exports(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trust: the state of consent across the platform.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_trust_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _week timestamptz := now() - interval '7 days';
  _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT jsonb_build_object(
    'shares', jsonb_build_object(
      'clinician_active', (SELECT count(*) FROM public.provider_shares WHERE is_active),
      'institution_active', (SELECT count(*) FROM public.practice_shares WHERE is_active),
      'revoked_7d', (SELECT count(*) FROM public.provider_shares
                      WHERE revoked_at IS NOT NULL AND revoked_at > _week)
                  + (SELECT count(*) FROM public.practice_shares
                      WHERE revoked_at IS NOT NULL AND revoked_at > _week),
      'granted_7d', (SELECT count(*) FROM public.provider_shares
                      WHERE is_active AND created_at > _week)
                  + (SELECT count(*) FROM public.practice_shares
                      WHERE is_active AND created_at > _week),
      -- An expiry already in the past that still reads as active is the kind
      -- of drift worth seeing; the permission helpers refuse it either way.
      'expired_but_active', (SELECT count(*) FROM public.provider_shares
                              WHERE is_active AND expires_at IS NOT NULL AND expires_at < now()),
      'suspended_institutions', (SELECT count(*) FROM public.practice_shares
                                  WHERE is_active AND practice_suspended_at IS NOT NULL),
      'share_all', (SELECT count(*) FROM public.practice_shares
                     WHERE is_active AND share_all)
    ),

    'consent', jsonb_build_object(
      'ai_processing_on', (SELECT count(*) FROM public.profiles WHERE ai_processing_consent),
      'ai_actions_on', (SELECT count(*) FROM public.profiles WHERE ai_actions_consent),
      'qhin_consented', (SELECT count(*) FROM public.profiles WHERE qhin_consent_at IS NOT NULL),
      'changes_7d', (SELECT count(*) FROM public.consent_logs WHERE created_at > _week)
    ),

    'legal', jsonb_build_object(
      'current_documents', (SELECT count(*) FROM public.legal_documents WHERE is_current),
      'accounts', (SELECT count(*) FROM public.profiles),
      -- Coverage means: has accepted every document currently in force.
      'fully_accepted', (
        SELECT count(*) FROM public.profiles p
         WHERE NOT EXISTS (
           SELECT 1 FROM public.legal_documents d
            WHERE d.is_current
              AND NOT EXISTS (
                SELECT 1 FROM public.legal_acceptances a
                 WHERE a.user_id = p.user_id AND a.document_id = d.id
              )
         )
      ),
      'accepted_7d', (SELECT count(*) FROM public.legal_acceptances WHERE accepted_at > _week)
    ),

    'baa', jsonb_build_object(
      'signed', (SELECT count(*) FROM public.baa_agreements WHERE status = 'signed'),
      'pending', (SELECT count(*) FROM public.baa_agreements WHERE status <> 'signed')
    ),

    'audit', jsonb_build_object(
      'entries_7d', (SELECT count(*) FROM public.hipaa_audit_logs WHERE created_at > _week),
      'access_entries_7d', (SELECT count(*) FROM public.access_audit_logs WHERE created_at > _week),
      'admin_actions_7d', (SELECT count(*) FROM public.platform_admin_actions WHERE created_at > _week)
    ),

    'checked_at', now()
  ) INTO _out;

  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.admin_trust_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_trust_overview() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access review: who can currently see whom, and how broadly.
--
-- Returns the two parties and the breadth of the grant. It does not return
-- anything the grant gives access to.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_access_reviews(
  _search text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  share_type text,
  share_id uuid,
  patient_user_id uuid,
  patient_name text,
  viewer_name text,
  viewer_user_id uuid,
  permission_count integer,
  share_all boolean,
  connected_at timestamptz,
  last_accessed_at timestamptz,
  expires_at timestamptz,
  is_suspended boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q text := nullif(trim(coalesce(_search, '')), '');
  _lim integer := greatest(1, least(coalesce(_limit, 25), 100));
  _off integer := greatest(0, coalesce(_offset, 0));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      'clinician'::text AS share_type,
      ps.id AS share_id,
      ps.user_id AS patient_user_id,
      coalesce(pp.name, 'Patient') AS patient_name,
      coalesce(ps.provider_name, ps.provider_email, 'Clinician') AS viewer_name,
      ps.clinician_user_id AS viewer_user_id,
      (SELECT count(*)::integer FROM jsonb_each(coalesce(ps.permissions, '{}'::jsonb)) e
        WHERE e.value = 'true'::jsonb) AS permission_count,
      false AS share_all,
      ps.created_at AS connected_at,
      ps.last_accessed_at,
      ps.expires_at,
      false AS is_suspended
    FROM public.provider_shares ps
    LEFT JOIN public.profiles pp ON pp.user_id = ps.user_id
    WHERE ps.is_active
      AND (_q IS NULL OR pp.name ILIKE '%' || _q || '%'
                      OR pp.email ILIKE '%' || _q || '%'
                      OR ps.provider_name ILIKE '%' || _q || '%'
                      OR ps.provider_email ILIKE '%' || _q || '%')

    UNION ALL

    SELECT
      'institution',
      psh.id,
      psh.user_id,
      coalesce(pp.name, 'Patient'),
      coalesce(pr.name, 'Institution'),
      NULL::uuid,
      (SELECT count(*)::integer FROM jsonb_each(coalesce(psh.permissions, '{}'::jsonb)) e
        WHERE e.value = 'true'::jsonb),
      coalesce(psh.share_all, false),
      psh.connected_at,
      NULL::timestamptz,
      NULL::timestamptz,
      psh.practice_suspended_at IS NOT NULL
    FROM public.practice_shares psh
    LEFT JOIN public.profiles pp ON pp.user_id = psh.user_id
    LEFT JOIN public.practices pr ON pr.id = psh.practice_id
    WHERE psh.is_active
      AND (_q IS NULL OR pp.name ILIKE '%' || _q || '%'
                      OR pp.email ILIKE '%' || _q || '%'
                      OR pr.name ILIKE '%' || _q || '%')
  )
  SELECT r.share_type, r.share_id, r.patient_user_id, r.patient_name, r.viewer_name,
         r.viewer_user_id, r.permission_count, r.share_all, r.connected_at,
         r.last_accessed_at, r.expires_at, r.is_suspended,
         count(*) OVER () AS total_count
    FROM rows r
   ORDER BY r.connected_at DESC NULLS LAST
   LIMIT _lim OFFSET _off;
END $$;

REVOKE ALL ON FUNCTION public.admin_access_reviews(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_access_reviews(text, integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Before the console can close a share, the consent guard has to let it.
--
-- guard_provider_share_consent pins every term of the relationship back to its
-- old value for any caller who is not the patient or a server-side job. A
-- platform admin is neither, so an admin revoke reported success and changed
-- nothing — the update matched a row, the trigger quietly put it back.
--
-- The guard now recognises one more caller, as narrowly as it can be written:
-- a platform admin may close a share, and may do nothing else to it. Closing
-- only ever narrows access. Widening the permissions, moving the share to
-- another patient, extending the expiry or reopening a closed share all stay
-- exactly where they were — with the patient.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_provider_share_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Server-side callers (cron, service role, migrations) and the patient who
  -- owns the share may change anything about it.
  IF auth.uid() IS NULL OR auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- A platform admin closing a share: allowed, and only that. The revocation
  -- stamps ride along so the share records who closed it and why.
  IF OLD.is_active AND NOT NEW.is_active AND public.has_role(auth.uid(), 'admin') THEN
    NEW.user_id        := OLD.user_id;
    NEW.permissions    := OLD.permissions;
    NEW.expires_at     := OLD.expires_at;
    NEW.invite_code    := OLD.invite_code;
    NEW.reconnected_at := OLD.reconnected_at;
    RETURN NEW;
  END IF;

  -- Anyone else — in practice the clinician on the share — may not touch the
  -- terms of the relationship.
  NEW.user_id        := OLD.user_id;
  NEW.is_active      := OLD.is_active;
  NEW.permissions    := OLD.permissions;
  NEW.expires_at     := OLD.expires_at;
  NEW.invite_code    := OLD.invite_code;
  NEW.revoked_at     := OLD.revoked_at;
  NEW.revoked_by     := OLD.revoked_by;
  NEW.revoke_reason  := OLD.revoke_reason;
  NEW.reconnected_at := OLD.reconnected_at;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Close a share from the console.
--
-- This only ever narrows access, which is why a platform admin is allowed to
-- do it at all: a compromised clinician account should not wait for its
-- patients to each revoke in turn. It demands a reason, writes that reason on
-- to the share itself, and leaves a platform-admin entry behind.
--
-- It re-reads the row after writing, because the consent guard above is
-- entitled to overrule it: reporting a revocation that did not happen would be
-- worse than refusing one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_patient_share(
  _share_type text,
  _share_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t text := lower(coalesce(_share_type, ''));
  _reason_clean text := nullif(trim(coalesce(_reason, '')), '');
  _found uuid;
  _still_active boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _reason_clean IS NULL THEN
    RAISE EXCEPTION 'A reason is required to revoke a share';
  END IF;

  IF _t = 'clinician' THEN
    UPDATE public.provider_shares
       SET is_active = false,
           revoked_at = now(),
           revoked_by = auth.uid(),
           revoke_reason = _reason_clean
     WHERE id = _share_id AND is_active
    RETURNING id, is_active INTO _found, _still_active;
  ELSIF _t = 'institution' THEN
    UPDATE public.practice_shares
       SET is_active = false,
           revoked_at = now(),
           revoked_by = auth.uid(),
           revoke_reason = _reason_clean,
           updated_at = now()
     WHERE id = _share_id AND is_active
    RETURNING id, is_active INTO _found, _still_active;
  ELSE
    RAISE EXCEPTION 'Unknown share type';
  END IF;

  IF _found IS NULL THEN
    RAISE EXCEPTION 'No active share with that id';
  END IF;

  -- RETURNING reports the row as the BEFORE triggers left it, so a guard that
  -- put the share back shows up here rather than as a false success upstream.
  IF _still_active THEN
    RAISE EXCEPTION 'The share was not closed';
  END IF;

  PERFORM public.log_platform_admin_action(
    'revoke_patient_share', _t || '_share', _share_id,
    jsonb_build_object('reason', _reason_clean)
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_revoke_patient_share(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_patient_share(text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit export: the same log the Trust tab searches, over a date range, in a
-- shape the console can write out as a file. Actor and subject are resolved
-- to emails; the details column stays behind.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_audit_export(
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _action text DEFAULT NULL,
  _limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  action text,
  resource_type text,
  actor_email text,
  patient_email text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lim integer := greatest(1, least(coalesce(_limit, 1000), 5000));
  _start timestamptz := coalesce(_from, now() - interval '30 days');
  _end timestamptz := coalesce(_to, now());
  _act text := nullif(trim(coalesce(_action, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.action,
    l.resource_type,
    actor.email,
    subject.email,
    l.created_at
  FROM public.hipaa_audit_logs l
  LEFT JOIN auth.users actor ON actor.id = l.user_id
  LEFT JOIN auth.users subject ON subject.id = l.patient_user_id
  WHERE l.created_at >= _start
    AND l.created_at <= _end
    AND (_act IS NULL OR l.action ILIKE '%' || _act || '%')
  ORDER BY l.created_at DESC
  LIMIT _lim;
END $$;

REVOKE ALL ON FUNCTION public.admin_audit_export(timestamptz, timestamptz, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_export(timestamptz, timestamptz, text, integer) TO authenticated, service_role;
