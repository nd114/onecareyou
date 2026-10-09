-- First-party page analytics for the founder console. Paths only (ids masked,
-- no query strings), never typed content. Identity comes from auth.uid().
CREATE TABLE public.site_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  visitor_id uuid NOT NULL,
  user_id uuid,
  path text NOT NULL,
  referrer_host text,
  utm_source text,
  device text,
  browser text,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_page_views TO authenticated;
GRANT ALL ON public.site_page_views TO service_role;
ALTER TABLE public.site_page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read page views" ON public.site_page_views
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX site_page_views_created_idx ON public.site_page_views (created_at DESC);
CREATE INDEX site_page_views_session_idx ON public.site_page_views (session_id, created_at);
CREATE INDEX site_page_views_user_idx ON public.site_page_views (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_page_view(
  _session_id uuid, _visitor_id uuid, _path text, _duration_ms integer,
  _referrer_host text DEFAULT NULL, _utm_source text DEFAULT NULL,
  _device text DEFAULT NULL, _browser text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _session_id IS NULL OR _visitor_id IS NULL OR _path IS NULL
     OR left(_path,1) <> '/' OR length(_path) > 200 THEN RETURN; END IF;
  -- Cap per-session volume so the endpoint cannot be flooded.
  IF (SELECT count(*) FROM public.site_page_views WHERE session_id = _session_id) >= 500 THEN RETURN; END IF;
  INSERT INTO public.site_page_views(session_id, visitor_id, user_id, path, referrer_host, utm_source, device, browser, duration_ms)
  VALUES (_session_id, _visitor_id, auth.uid(), split_part(_path,'?',1),
    left(_referrer_host,120), left(_utm_source,60), left(_device,20), left(_browser,30),
    greatest(0, least(coalesce(_duration_ms,0), 3600000)));
END $$;
REVOKE ALL ON FUNCTION public.log_page_view(uuid,uuid,text,integer,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_page_view(uuid,uuid,text,integer,text,text,text,text) TO anon, authenticated, service_role;

-- Aggregates: no individual is named here.
CREATE OR REPLACE FUNCTION public.admin_site_analytics(_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _since timestamptz := now() - make_interval(days => greatest(1, least(_days, 365))); _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RETURN NULL; END IF;
  WITH v AS (
    SELECT pv.*, CASE
      WHEN pv.user_id IS NULL THEN 'Guest'
      WHEN public.has_role(pv.user_id,'admin') THEN 'Team'
      WHEN EXISTS (SELECT 1 FROM clinician_profiles c WHERE c.user_id = pv.user_id) THEN 'Clinician'
      ELSE 'Patient' END AS audience
    FROM site_page_views pv WHERE pv.created_at >= _since),
  s AS (SELECT session_id, count(*) n, sum(duration_ms) d,
          (array_agg(path ORDER BY created_at))[1] entry,
          (array_agg(path ORDER BY created_at DESC))[1] exitp
        FROM v GROUP BY session_id)
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
       'views', (SELECT count(*) FROM v),
       'sessions', (SELECT count(*) FROM s),
       'visitors', (SELECT count(DISTINCT visitor_id) FROM v),
       'signed_in', (SELECT count(DISTINCT user_id) FROM v),
       'avg_session_s', (SELECT coalesce(round(avg(d)/1000),0) FROM s),
       'pages_per_session', (SELECT coalesce(round(avg(n)::numeric,1),0) FROM s),
       'bounce_rate', (SELECT coalesce(round(100.0*count(*) FILTER (WHERE n=1)/nullif(count(*),0)),0) FROM s))),
    'daily', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'day'),'[]') FROM (
       SELECT jsonb_build_object('day', date_trunc('day',created_at)::date, 'views', count(*),
         'sessions', count(DISTINCT session_id), 'visitors', count(DISTINCT visitor_id)) x
       FROM v GROUP BY 1=1, date_trunc('day',created_at)) q),
    'pages', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('path',path,'views',count(*),'sessions',count(DISTINCT session_id),
         'avg_s', round(avg(duration_ms)/1000)) x
       FROM v GROUP BY path ORDER BY count(*) DESC LIMIT 25) q),
    'entries', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('path',entry,'count',count(*)) x FROM s GROUP BY entry ORDER BY count(*) DESC LIMIT 10) q),
    'exits', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('path',exitp,'count',count(*)) x FROM s GROUP BY exitp ORDER BY count(*) DESC LIMIT 10) q),
    'referrers', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',coalesce(referrer_host,'Direct'),'count',count(DISTINCT session_id)) x
       FROM v GROUP BY 1=1, coalesce(referrer_host,'Direct') ORDER BY count(DISTINCT session_id) DESC LIMIT 10) q),
    'campaigns', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',utm_source,'count',count(DISTINCT session_id)) x
       FROM v WHERE utm_source IS NOT NULL GROUP BY utm_source ORDER BY count(DISTINCT session_id) DESC LIMIT 10) q),
    'devices', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',coalesce(device,'Unknown'),'count',count(DISTINCT session_id)) x
       FROM v GROUP BY 1=1, coalesce(device,'Unknown') ORDER BY 1) q),
    'browsers', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',coalesce(browser,'Other'),'count',count(DISTINCT session_id)) x
       FROM v GROUP BY 1=1, coalesce(browser,'Other') ORDER BY 1) q),
    'audiences', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',audience,'views',count(*),'sessions',count(DISTINCT session_id)) x
       FROM v GROUP BY audience) q),
    'hours', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('hour',extract(hour FROM created_at)::int,'views',count(*)) x
       FROM v GROUP BY extract(hour FROM created_at)) q),
    'recent_sessions', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('session_id',session_id,'audience',min(audience),
         'started_at',min(created_at),'duration_s',round(sum(duration_ms)/1000),
         'device',min(device),'referrer',min(referrer_host),
         'paths',(array_agg(path ORDER BY created_at))[1:15]) x
       FROM v GROUP BY session_id ORDER BY min(created_at) DESC LIMIT 25) q)
  ) INTO _r;
  RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.admin_site_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_site_analytics(integer) TO authenticated, service_role;

-- Named journeys only once a person is searched for (2+ chars), like the other people lists.
CREATE OR REPLACE FUNCTION public.admin_person_journeys(_search text, _days integer DEFAULT 30)
RETURNS TABLE(user_id uuid, email text, name text, session_id uuid, started_at timestamptz,
              duration_s integer, device text, steps jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _q text := nullif(trim(coalesce(_search,'')),'');
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') OR _q IS NULL OR length(_q) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.user_id, p.email::text, p.name, pv.session_id, min(pv.created_at),
         (sum(pv.duration_ms)/1000)::int, min(pv.device),
         jsonb_agg(jsonb_build_object('path',pv.path,'at',pv.created_at,'s',pv.duration_ms/1000) ORDER BY pv.created_at)
  FROM site_page_views pv JOIN profiles p ON p.user_id = pv.user_id
  WHERE pv.created_at >= now() - make_interval(days => greatest(1, least(_days,365)))
    AND (p.email ILIKE '%'||_q||'%' OR p.name ILIKE '%'||_q||'%')
  GROUP BY p.user_id, p.email, p.name, pv.session_id
  ORDER BY min(pv.created_at) DESC LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION public.admin_person_journeys(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_person_journeys(text,integer) TO authenticated, service_role;