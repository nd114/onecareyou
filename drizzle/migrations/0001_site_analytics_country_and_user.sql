ALTER TABLE public.site_page_views ADD COLUMN IF NOT EXISTS country text, ADD COLUMN IF NOT EXISTS timezone text;

DROP FUNCTION IF EXISTS public.log_page_view(uuid, uuid, text, integer, text, text, text, text);

CREATE FUNCTION public.log_page_view(_session_id uuid, _visitor_id uuid, _path text, _duration_ms integer, _referrer_host text DEFAULT NULL, _utm_source text DEFAULT NULL, _device text DEFAULT NULL, _browser text DEFAULT NULL, _timezone text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _h jsonb; _c text;
BEGIN
  IF _session_id IS NULL OR _visitor_id IS NULL OR _path IS NULL
     OR left(_path,1) <> '/' OR length(_path) > 200 THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.site_page_views WHERE session_id = _session_id) >= 500 THEN RETURN; END IF;
  BEGIN _h := current_setting('request.headers', true)::jsonb; EXCEPTION WHEN others THEN _h := NULL; END;
  _c := upper(left(coalesce(_h->>'cf-ipcountry', _h->>'x-country', _h->>'x-vercel-ip-country'), 2));
  IF _c IN ('XX','T1') THEN _c := NULL; END IF;
  INSERT INTO public.site_page_views(session_id, visitor_id, user_id, path, referrer_host, utm_source, device, browser, duration_ms, country, timezone)
  VALUES (_session_id, _visitor_id, auth.uid(), split_part(_path,'?',1),
    left(_referrer_host,120), left(_utm_source,60), left(_device,20), left(_browser,30),
    greatest(0, least(coalesce(_duration_ms,0), 3600000)), _c, left(_timezone,60));
END $$;
GRANT EXECUTE ON FUNCTION public.log_page_view(uuid, uuid, text, integer, text, text, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_site_analytics(_days integer DEFAULT 7)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _since timestamptz := now() - make_interval(days => greatest(1, least(_days, 365))); _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RETURN NULL; END IF;
  WITH v AS (
    SELECT pv.*, coalesce(pv.country, CASE WHEN pv.timezone IS NOT NULL THEN 'tz:'||pv.timezone END) AS place,
      CASE
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
       'countries', (SELECT count(DISTINCT country) FROM v),
       'avg_session_s', (SELECT coalesce(round(avg(d)/1000),0) FROM s),
       'pages_per_session', (SELECT coalesce(round(avg(n)::numeric,1),0) FROM s),
       'bounce_rate', (SELECT coalesce(round(100.0*count(*) FILTER (WHERE n=1)/nullif(count(*),0)),0) FROM s))),
    'daily', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'day'),'[]') FROM (
       SELECT jsonb_build_object('day', date_trunc('day',created_at)::date, 'views', count(*),
         'sessions', count(DISTINCT session_id), 'visitors', count(DISTINCT visitor_id)) x
       FROM v GROUP BY date_trunc('day',created_at)) q),
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
       FROM v GROUP BY coalesce(referrer_host,'Direct') ORDER BY count(DISTINCT session_id) DESC LIMIT 10) q),
    'campaigns', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',utm_source,'count',count(DISTINCT session_id)) x
       FROM v WHERE utm_source IS NOT NULL GROUP BY utm_source ORDER BY count(DISTINCT session_id) DESC LIMIT 10) q),
    'countries', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',coalesce(place,'Unknown'),'count',count(DISTINCT session_id)) x
       FROM v GROUP BY coalesce(place,'Unknown') ORDER BY count(DISTINCT session_id) DESC LIMIT 25) q),
    'devices', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',coalesce(device,'Unknown'),'count',count(DISTINCT session_id)) x
       FROM v GROUP BY coalesce(device,'Unknown') ORDER BY 1) q),
    'browsers', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',coalesce(browser,'Other'),'count',count(DISTINCT session_id)) x
       FROM v GROUP BY coalesce(browser,'Other') ORDER BY 1) q),
    'audiences', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('label',audience,'views',count(*),'sessions',count(DISTINCT session_id)) x
       FROM v GROUP BY audience) q),
    'hours', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
       SELECT jsonb_build_object('hour',extract(hour FROM created_at)::int,'views',count(*)) x
       FROM v GROUP BY extract(hour FROM created_at)) q),
    'recent_sessions', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'started_at' DESC),'[]') FROM (
       SELECT jsonb_build_object('session_id',g.session_id,'audience',g.audience,
         'started_at',g.started_at,'duration_s',g.duration_s,'device',g.device,'browser',g.browser,
         'referrer',g.referrer,'country',g.place,'user_id',g.uid,
         'email',(SELECT p.email FROM profiles p WHERE p.user_id = g.uid),
         'paths',g.paths) x
       FROM (SELECT session_id, min(audience) audience, min(created_at) started_at,
               round(sum(duration_ms)/1000) duration_s, min(device) device, min(browser) browser,
               min(referrer_host) referrer, min(place) place,
               (array_agg(user_id ORDER BY created_at DESC) FILTER (WHERE user_id IS NOT NULL))[1] uid,
               (array_agg(path ORDER BY created_at))[1:15] paths
             FROM v GROUP BY session_id ORDER BY min(created_at) DESC LIMIT 50) g) q)
  ) INTO _r;
  RETURN _r;
END $function$;