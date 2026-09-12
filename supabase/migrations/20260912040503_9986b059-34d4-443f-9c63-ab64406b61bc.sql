-- ---------------------------------------------------------------------------
-- Founder command centre: Today (phase 1) and the morning digest (phase 4).
-- Everything here returns counts, states and identifiers only. No clinical
-- content is exposed to platform admins by any function below.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_attention_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  item_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, item_key)
);

GRANT SELECT, INSERT, DELETE ON public.admin_attention_dismissals TO authenticated;
GRANT ALL ON public.admin_attention_dismissals TO service_role;
ALTER TABLE public.admin_attention_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage their own dismissals" ON public.admin_attention_dismissals;
CREATE POLICY "Admins manage their own dismissals"
ON public.admin_attention_dismissals
FOR ALL
TO authenticated
USING (admin_user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (admin_user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.admin_digest_preferences (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  send_hour smallint NOT NULL DEFAULT 7,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.admin_digest_preferences TO authenticated;
GRANT ALL ON public.admin_digest_preferences TO service_role;
ALTER TABLE public.admin_digest_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage their own digest preference" ON public.admin_digest_preferences;
CREATE POLICY "Admins manage their own digest preference"
ON public.admin_digest_preferences
FOR ALL
TO authenticated
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_admin_digest_preferences_updated_at ON public.admin_digest_preferences;
CREATE TRIGGER update_admin_digest_preferences_updated_at
BEFORE UPDATE ON public.admin_digest_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add a validation guard rather than a CHECK on send_hour so it stays editable.
CREATE OR REPLACE FUNCTION public.validate_digest_send_hour()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.send_hour < 0 OR NEW.send_hour > 23 THEN
    RAISE EXCEPTION 'send_hour must be between 0 and 23';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_admin_digest_send_hour ON public.admin_digest_preferences;
CREATE TRIGGER validate_admin_digest_send_hour
BEFORE INSERT OR UPDATE ON public.admin_digest_preferences
FOR EACH ROW EXECUTE FUNCTION public.validate_digest_send_hour();

-- ---------------------------------------------------------------------------
-- Movement: one row per metric, this period against the one before it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_movement_metrics(_days integer DEFAULT 7)
RETURNS TABLE (
  metric_key text,
  label text,
  current_value bigint,
  previous_value bigint,
  total_value bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d integer := greatest(1, least(coalesce(_days, 7), 365));
  _from timestamptz := now() - make_interval(days => _d);
  _prev timestamptz := now() - make_interval(days => _d * 2);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT 'signups', 'New accounts',
         count(*) FILTER (WHERE p.created_at >= _from),
         count(*) FILTER (WHERE p.created_at >= _prev AND p.created_at < _from),
         count(*)
    FROM public.profiles p;

  RETURN QUERY
  SELECT 'clinicians', 'Clinicians',
         count(*) FILTER (WHERE c.created_at >= _from),
         count(*) FILTER (WHERE c.created_at >= _prev AND c.created_at < _from),
         count(*)
    FROM public.clinician_profiles c;

  RETURN QUERY
  SELECT 'tenants', 'Tenants',
         count(*) FILTER (WHERE pr.created_at >= _from),
         count(*) FILTER (WHERE pr.created_at >= _prev AND pr.created_at < _from),
         count(*)
    FROM public.practices pr;

  RETURN QUERY
  SELECT 'connections', 'Patient connections',
         count(*) FILTER (WHERE s.created_at >= _from),
         count(*) FILTER (WHERE s.created_at >= _prev AND s.created_at < _from),
         count(*)
    FROM (
      SELECT created_at FROM public.practice_shares WHERE is_active
      UNION ALL
      SELECT created_at FROM public.provider_shares WHERE is_active
    ) s;

  RETURN QUERY
  SELECT 'documents', 'Documents stored',
         count(*) FILTER (WHERE h.created_at >= _from),
         count(*) FILTER (WHERE h.created_at >= _prev AND h.created_at < _from),
         count(*)
    FROM public.health_documents h;

  RETURN QUERY
  SELECT 'ai_conversations', 'Assistant conversations',
         count(*) FILTER (WHERE a.created_at >= _from),
         count(*) FILTER (WHERE a.created_at >= _prev AND a.created_at < _from),
         count(*)
    FROM public.ai_conversations a;
END $$;

REVOKE ALL ON FUNCTION public.admin_movement_metrics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_movement_metrics(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trend lines: per-day counts for the sparklines.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_metric_series(_days integer DEFAULT 30)
RETURNS TABLE (metric_key text, day date, value bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d integer := greatest(1, least(coalesce(_days, 30), 180));
  _from date := (now() - make_interval(days => _d - 1))::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(_from, now()::date, interval '1 day')::date AS day
  ),
  events AS (
    SELECT 'signups'::text AS metric_key, created_at FROM public.profiles
    UNION ALL SELECT 'clinicians', created_at FROM public.clinician_profiles
    UNION ALL SELECT 'tenants', created_at FROM public.practices
    UNION ALL SELECT 'connections', created_at FROM public.practice_shares WHERE is_active
    UNION ALL SELECT 'connections', created_at FROM public.provider_shares WHERE is_active
    UNION ALL SELECT 'documents', created_at FROM public.health_documents
    UNION ALL SELECT 'ai_conversations', created_at FROM public.ai_conversations
  ),
  keys AS (
    SELECT unnest(ARRAY['signups','clinicians','tenants','connections','documents','ai_conversations']) AS metric_key
  )
  SELECT k.metric_key, d.day, count(e.created_at)
    FROM keys k
    CROSS JOIN days d
    LEFT JOIN events e
      ON e.metric_key = k.metric_key
     AND e.created_at >= d.day
     AND e.created_at < d.day + 1
   GROUP BY k.metric_key, d.day
   ORDER BY k.metric_key, d.day;
END $$;

REVOKE ALL ON FUNCTION public.admin_metric_series(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metric_series(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Attention queue: derived, never stored. Dismissals are per admin.
-- _for_admin lets the digest ask on a specific admin's behalf.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_attention_queue(_for_admin uuid DEFAULT NULL)
RETURNS TABLE (
  item_key text,
  kind text,
  severity text,
  title text,
  detail text,
  target_type text,
  target_id uuid,
  occurred_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid := coalesce(_for_admin, auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Not authorised';
    END IF;
    -- An admin may only ask on their own behalf; the digest runs without a session.
    _admin := auth.uid();
  END IF;

  RETURN QUERY
  WITH items AS (
    -- Storage against allowance
    SELECT
      'storage:' || p.id::text AS item_key,
      'storage' AS kind,
      CASE WHEN pct >= 90 THEN 'critical' ELSE 'warning' END AS severity,
      p.name || ' is at ' || round(pct)::text || '% of its storage allowance' AS title,
      'Raise the allowance or sell a pack before writes start failing.' AS detail,
      'tenant' AS target_type,
      p.id AS target_id,
      now() AS occurred_at
    FROM (
      SELECT pr.id, pr.name,
             CASE WHEN coalesce(pr.storage_limit_gb, 0) > 0
                  THEN least(100, (public.get_practice_storage_bytes(pr.id)::numeric
                       / (pr.storage_limit_gb * 1024 ^ 3)) * 100)
                  ELSE 0 END AS pct
        FROM public.practices pr
       WHERE pr.is_active
    ) p
    WHERE pct >= 75

    UNION ALL
    -- Owner invitations left hanging
    SELECT
      'invitation:' || i.id::text,
      'invitation',
      'warning',
      'Owner invitation to ' || i.email || ' is still unaccepted',
      'Sent ' || date_part('day', now() - i.created_at)::int::text || ' days ago for ' || pr.name || '.',
      'tenant',
      i.practice_id,
      i.created_at
    FROM public.tenant_owner_invitations i
    JOIN public.practices pr ON pr.id = i.practice_id
    WHERE i.status = 'pending'
      AND i.accepted_at IS NULL
      AND i.created_at < now() - interval '7 days'

    UNION ALL
    -- Contact submissions nobody has answered
    SELECT
      'contact:' || cs.id::text,
      'contact',
      'warning',
      'Unanswered message from ' || coalesce(cs.contact_name, cs.contact_email),
      coalesce(nullif(cs.subject, ''), 'No subject') || ' · ' || coalesce(cs.inquiry_type, 'general'),
      'contact_submission',
      cs.id,
      cs.created_at
    FROM public.contact_submissions cs
    WHERE coalesce(cs.status, 'new') NOT IN ('closed', 'resolved', 'answered')
      AND cs.created_at < now() - interval '1 day'

    UNION ALL
    -- Open bug reports from beta testers
    SELECT
      'bug:' || b.id::text,
      'bug',
      CASE WHEN b.created_at < now() - interval '7 days' THEN 'warning' ELSE 'info' END,
      'Open bug report: ' || coalesce(nullif(b.category, ''), 'general'),
      left(coalesce(b.description, ''), 140),
      'bug_report',
      b.id,
      b.created_at
    FROM public.beta_bug_reports b
    WHERE coalesce(b.status, 'open') NOT IN ('closed', 'resolved', 'wont_fix')

    UNION ALL
    -- Trials running long
    SELECT
      'trial:' || pr.id::text,
      'trial',
      'info',
      pr.name || ' has been on trial for ' || date_part('day', now() - pr.created_at)::int::text || ' days',
      'Decide whether to convert, extend or close it.',
      'tenant',
      pr.id,
      pr.created_at
    FROM public.practices pr
    WHERE pr.is_active
      AND coalesce(pr.subscription_tier, 'trial') = 'trial'
      AND pr.created_at < now() - interval '14 days'

    UNION ALL
    -- Tenants that never onboarded anybody
    SELECT
      'empty:' || pr.id::text,
      'empty_tenant',
      'warning',
      pr.name || ' still has no team members',
      'Created ' || date_part('day', now() - pr.created_at)::int::text || ' days ago and nobody has joined.',
      'tenant',
      pr.id,
      pr.created_at
    FROM public.practices pr
    WHERE pr.is_active
      AND pr.created_at < now() - interval '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.practice_members m
         WHERE m.practice_id = pr.id AND m.status = 'active'
      )

    UNION ALL
    -- Background record sync that failed in the last day
    SELECT
      'sync:' || l.id::text,
      'sync_failure',
      'critical',
      'Record sync failed (' || coalesce(l.resource_type, l.sync_type, 'unknown') || ')',
      'A hospital connection could not exchange records.',
      'ehr_sync',
      l.id,
      l.created_at
    FROM public.ehr_sync_logs l
    WHERE l.status IN ('error', 'failed')
      AND l.created_at > now() - interval '24 hours'
  )
  SELECT i.item_key, i.kind, i.severity, i.title, i.detail, i.target_type, i.target_id, i.occurred_at
    FROM items i
   WHERE _admin IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.admin_attention_dismissals d
         WHERE d.admin_user_id = _admin AND d.item_key = i.item_key
      )
   ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
            i.occurred_at DESC
   LIMIT 60;
END $$;

REVOKE ALL ON FUNCTION public.admin_attention_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_attention_queue(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Live pulse: the last 24 hours, from signals already in the database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_live_pulse()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - interval '24 hours';
  _out jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT jsonb_build_object(
    'sync_failures', (SELECT count(*) FROM public.ehr_sync_logs
                       WHERE status IN ('error','failed') AND created_at > _since),
    'signin_throttles', (SELECT count(*) FROM public.rate_limit_events
                          WHERE created_at > _since),
    'signin_partner_failures', (SELECT count(*) FROM public.kingschat_login_attempts
                                 WHERE status = 'failed' AND created_at > _since),
    'new_accounts', (SELECT count(*) FROM public.profiles WHERE created_at > _since),
    'documents_added', (SELECT count(*) FROM public.health_documents WHERE created_at > _since),
    'assistant_conversations', (SELECT count(*) FROM public.ai_conversations WHERE created_at > _since),
    'messages_sent', (SELECT count(*) FROM public.messages WHERE created_at > _since),
    'checked_at', now()
  ) INTO _out;

  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.admin_live_pulse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_live_pulse() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Digest snapshot for the morning email. Backend services only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_digest_snapshot(_for_admin uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - interval '24 hours';
  _prev timestamptz := now() - interval '48 hours';
BEGIN
  RETURN jsonb_build_object(
    'movement', jsonb_build_object(
      'signups', (SELECT count(*) FROM public.profiles WHERE created_at > _since),
      'signups_previous', (SELECT count(*) FROM public.profiles
                            WHERE created_at > _prev AND created_at <= _since),
      'tenants', (SELECT count(*) FROM public.practices WHERE created_at > _since),
      'connections', (SELECT count(*) FROM public.practice_shares
                       WHERE is_active AND created_at > _since),
      'documents', (SELECT count(*) FROM public.health_documents WHERE created_at > _since),
      'assistant_conversations', (SELECT count(*) FROM public.ai_conversations
                                   WHERE created_at > _since)
    ),
    'pulse', public.admin_live_pulse(),
    'attention', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'severity', q.severity, 'title', q.title, 'detail', q.detail))
        FROM public.admin_attention_queue(_for_admin) q
    ), '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_digest_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_digest_snapshot(uuid) TO service_role;