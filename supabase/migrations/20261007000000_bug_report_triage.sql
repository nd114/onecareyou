-- ---------------------------------------------------------------------------
-- The "Needs you" queue's bug item is a nudge, not a workspace: a 140-
-- character clip of the description, no reporter, and the only bulk action
-- on the card ("restore N cleared") is a personal per-admin dismiss toggle
-- (admin_attention_dismissals) — it hides an item from one admin's queue, it
-- does not change the report. There was no way to see who filed a bug, read
-- the whole thing, or move more than one at a time.
--
-- This adds the actual triage surface behind that nudge: admin_bug_reports
-- lists reports in full (reporter included) with an open/archived/all
-- filter; admin_archive_bug_reports and admin_restore_bug_reports move any
-- number of them at once. Archive, not delete — the report and everything
-- it carries (page, browser info, who filed it) stays on the row, the way
-- every other admin-facing removal on this platform is an `archived_at` or
-- a status flip rather than a DELETE.
--
-- Reporter identity is not gated the way Accounts and Trust gate people
-- (see admin_guide.md §2): a bug report was sent to OneCare staff on
-- purpose, by the person who filed it, for the purpose of OneCare staff
-- reading it — the same footing as contact_submissions, which the console
-- has always shown in full. That is a different act from an admin browsing
-- who a patient is connected to, which nobody submitting a support ticket
-- agreed to.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_bug_reports(
  _status text DEFAULT 'open',
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  category text,
  description text,
  page_url text,
  browser_info jsonb,
  status text,
  created_at timestamptz,
  reporter_user_id uuid,
  reporter_name text,
  reporter_email text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _st text := lower(coalesce(nullif(trim(_status), ''), 'open'));
  _lim integer := greatest(1, least(coalesce(_limit, 25), 100));
  _off integer := greatest(0, coalesce(_offset, 0));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _st NOT IN ('open', 'archived', 'all') THEN
    RAISE EXCEPTION 'Unknown status filter';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.category,
    b.description,
    b.page_url,
    b.browser_info,
    b.status,
    b.created_at,
    b.user_id AS reporter_user_id,
    coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
             p.name, u.email, 'Unknown user') AS reporter_name,
    coalesce(p.email, u.email) AS reporter_email,
    count(*) OVER ()::bigint AS total_count
  FROM public.beta_bug_reports b
  LEFT JOIN auth.users u ON u.id = b.user_id
  LEFT JOIN public.profiles p ON p.user_id = b.user_id
  LEFT JOIN public.clinician_profiles c ON c.user_id = b.user_id
  WHERE _st = 'all'
     OR (_st = 'archived' AND b.status = 'archived')
     OR (_st = 'open' AND b.status IS DISTINCT FROM 'archived')
  ORDER BY b.created_at DESC
  LIMIT _lim OFFSET _off;
END $$;

REVOKE ALL ON FUNCTION public.admin_bug_reports(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bug_reports(text, integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bulk-move, tolerant of a stale selection: an id that no longer matches (or
-- never existed) is skipped rather than failing the whole batch, since the
-- caller is a set of checkboxes that could go stale between render and click.
-- Each row actually moved gets its own admin-action log entry, so the log
-- keeps naming one real target per line like everywhere else in the console.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_archive_bug_reports(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  FOR _id IN
    UPDATE public.beta_bug_reports
       SET status = 'archived'
     WHERE id = ANY(coalesce(_ids, ARRAY[]::uuid[]))
       AND status IS DISTINCT FROM 'archived'
    RETURNING id
  LOOP
    PERFORM public.log_platform_admin_action('archive_bug_report', 'bug_report', _id, '{}'::jsonb);
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.admin_archive_bug_reports(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_bug_reports(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_restore_bug_reports(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  FOR _id IN
    UPDATE public.beta_bug_reports
       SET status = 'new'
     WHERE id = ANY(coalesce(_ids, ARRAY[]::uuid[]))
       AND status = 'archived'
    RETURNING id
  LOOP
    PERFORM public.log_platform_admin_action('restore_bug_report', 'bug_report', _id, '{}'::jsonb);
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.admin_restore_bug_reports(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_bug_reports(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Redefined only to stop an archived bug report from still nudging the
-- attention queue as "open" — every other branch is unchanged from the
-- version in 20260912040503_9986b059-34d4-443f-9c63-ab64406b61bc.sql.
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
    -- Open bug reports from beta testers — 'archived' is a triage decision
    -- made from the dedicated bug-reports view, not a thing to keep nudging.
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
    WHERE coalesce(b.status, 'open') NOT IN ('closed', 'resolved', 'wont_fix', 'archived')

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
