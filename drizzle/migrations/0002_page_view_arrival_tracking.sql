-- log_page_view now returns the inserted row id so the client can update dwell time on exit
DROP FUNCTION IF EXISTS public.log_page_view(text, text, text, integer, text, text, text, text, text);

CREATE FUNCTION public.log_page_view(
  _session_id text,
  _visitor_id text,
  _path text,
  _duration_ms integer,
  _referrer_host text DEFAULT NULL,
  _utm_source text DEFAULT NULL,
  _device text DEFAULT NULL,
  _browser text DEFAULT NULL,
  _timezone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _country text;
BEGIN
  _country := coalesce(
    current_setting('request.headers', true)::jsonb ->> 'cf-ipcountry',
    current_setting('request.headers', true)::jsonb ->> 'x-country',
    current_setting('request.headers', true)::jsonb ->> 'x-vercel-ip-country'
  );
  IF _country IS NULL OR _country IN ('XX', 'T1') THEN
    _country := CASE WHEN _timezone IS NOT NULL THEN 'tz:' || _timezone ELSE 'Unknown' END;
  END IF;

  INSERT INTO public.site_page_views (
    session_id, visitor_id, user_id, path, duration_ms,
    referrer_host, utm_source, device, browser, timezone, country
  ) VALUES (
    _session_id, _visitor_id, auth.uid(), _path, greatest(_duration_ms, 0),
    _referrer_host, _utm_source, _device, _browser, _timezone, _country
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_page_view(text, text, text, integer, text, text, text, text, text) TO anon, authenticated, service_role;

-- Update dwell time for an already-logged view (called on page exit / navigation)
CREATE OR REPLACE FUNCTION public.update_page_view_duration(_id uuid, _duration_ms integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.site_page_views
  SET duration_ms = greatest(_duration_ms, 0)
  WHERE id = _id;
$$;

GRANT EXECUTE ON FUNCTION public.update_page_view_duration(uuid, integer) TO anon, authenticated, service_role;

-- Live visitors: distinct sessions with a page view in the last 10 minutes (admin only)
CREATE OR REPLACE FUNCTION public.admin_active_visitors()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin')
    THEN (SELECT count(DISTINCT session_id)::integer FROM public.site_page_views WHERE created_at > now() - interval '10 minutes')
    ELSE 0
  END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_active_visitors() TO authenticated, service_role;
-- Re-assert read grants in case they were missed
GRANT EXECUTE ON FUNCTION public.admin_site_analytics(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_person_journeys(text, integer) TO authenticated, service_role;