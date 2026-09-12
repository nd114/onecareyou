-- ---------------------------------------------------------------------------
-- The founder command centre's Accounts and Trust areas let a platform admin
-- browse, unprompted: every patient and clinician on the platform, and every
-- active clinician-patient and institution-patient relationship, sorted
-- newest first. Neither required a reason.
--
-- sharing-access-consent-model.md is built entirely on the opposite premise —
-- "the patient holds the power", disclosure at the moment a relationship is
-- formed, no break-glass — none of which a patient consents to when a
-- platform employee (not a treating party, not named in the consent they
-- gave) can page through the whole platform's relationship graph at leisure.
-- A patient who shared with one named clinician did not agree to that
-- relationship being visible to OneCare staff generally, on a screen built
-- for revenue and reliability work.
--
-- The fix is "search, don't browse", applied unevenly on purpose:
--
-- * Organisations (tenants) are OneCare's business customers. The existing
--   Tenants and Revenue panels already list every one of them unsearched —
--   that is ordinary B2B account management and stays exactly as it is.
-- * Individual people — clinicians and patients — now require a search of at
--   least two characters before either function returns a row. A support
--   conversation ("this patient's account", "this clinician's shares") always
--   starts with a name or an email already in hand; nothing legitimate here
--   needs a scroll through everyone.
-- * A relationship itself only ever surfaces once you already know one of the
--   two people in it, which is what "close this compromised clinician's
--   shares" or "help this patient with their connection" actually require —
--   never the shares of someone you have not named.
--
-- Neither function raises on a short search. It answers with nothing, the
-- same shape a real search with zero matches would have, so the client's
-- empty state reads as "search to begin" rather than an error.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_accounts_directory(
  _kind text DEFAULT 'all',
  _search text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  kind text,
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  detail text,
  tenant_name text,
  connections bigint,
  storage_bytes bigint,
  last_seen timestamptz,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _k text := lower(coalesce(nullif(trim(_kind), ''), 'all'));
  _q text := nullif(trim(coalesce(_search, '')), '');
  _lim integer := greatest(1, least(coalesce(_limit, 25), 100));
  _off integer := greatest(0, coalesce(_offset, 0));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _k NOT IN ('all', 'tenant', 'clinician', 'patient') THEN
    RAISE EXCEPTION 'Unknown account kind';
  END IF;

  -- Individuals only surface once named. 'all' includes patients and
  -- clinicians, so it carries the same floor as searching for either alone.
  IF _k IN ('all', 'clinician', 'patient') AND (_q IS NULL OR length(_q) < 2) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      'tenant'::text AS kind,
      pr.id,
      NULL::uuid AS user_id,
      pr.name AS display_name,
      pr.email,
      coalesce(pr.subscription_tier, 'trial')
        || CASE WHEN pr.is_active THEN '' ELSE ' · suspended' END AS detail,
      NULL::text AS tenant_name,
      (SELECT count(*) FROM public.practice_shares ps
        WHERE ps.practice_id = pr.id AND ps.is_active) AS connections,
      coalesce((SELECT sum(sl.bytes) FROM public.storage_ledger sl
                 WHERE sl.practice_id = pr.id), 0)::bigint AS storage_bytes,
      pr.updated_at AS last_seen,
      pr.created_at
    FROM public.practices pr
    WHERE _k IN ('all', 'tenant')
      AND (_q IS NULL OR pr.name ILIKE '%' || _q || '%'
                      OR pr.slug ILIKE '%' || _q || '%'
                      OR pr.email ILIKE '%' || _q || '%')

    UNION ALL

    SELECT
      'clinician',
      c.id,
      c.user_id,
      coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
               p.name, u.email, 'Clinician'),
      coalesce(p.email, u.email),
      coalesce(c.subscription_tier, 'trial')
        || coalesce(' · ' || nullif(c.specialty, ''), '')
        || CASE WHEN c.is_verified THEN ' · verified' ELSE '' END,
      (SELECT pr.name FROM public.practice_members pm
         JOIN public.practices pr ON pr.id = pm.practice_id
        WHERE pm.user_id = c.user_id AND pm.status = 'active'
        ORDER BY pm.created_at LIMIT 1),
      (SELECT count(*) FROM public.provider_shares psh
        WHERE psh.clinician_user_id = c.user_id AND psh.is_active),
      coalesce((SELECT sum(sl.bytes) FROM public.storage_ledger sl
                 WHERE sl.user_id = c.user_id), 0)::bigint,
      u.last_sign_in_at,
      c.created_at
    FROM public.clinician_profiles c
    LEFT JOIN public.profiles p ON p.user_id = c.user_id
    LEFT JOIN auth.users u ON u.id = c.user_id
    WHERE _k IN ('all', 'clinician')
      AND _q IS NOT NULL
      AND (c.first_name ILIKE '%' || _q || '%'
           OR c.last_name ILIKE '%' || _q || '%'
           OR p.name ILIKE '%' || _q || '%'
           OR p.email ILIKE '%' || _q || '%'
           OR u.email ILIKE '%' || _q || '%'
           OR c.specialty ILIKE '%' || _q || '%')

    UNION ALL

    SELECT
      'patient',
      p.id,
      p.user_id,
      coalesce(p.name, u.email, 'Patient'),
      coalesce(p.email, u.email),
      coalesce(p.subscription_tier, 'free')
        || CASE WHEN p.onboarding_completed THEN '' ELSE ' · onboarding' END,
      (SELECT pr.name FROM public.practices pr WHERE pr.id = p.onboarded_via_practice_id),
      (SELECT count(*) FROM public.provider_shares psh
        WHERE psh.user_id = p.user_id AND psh.is_active)
      + (SELECT count(*) FROM public.practice_shares ps
          WHERE ps.user_id = p.user_id AND ps.is_active),
      coalesce((SELECT sum(sl.bytes) FROM public.storage_ledger sl
                 WHERE sl.user_id = p.user_id), 0)::bigint,
      u.last_sign_in_at,
      p.created_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.user_id
    WHERE _k IN ('all', 'patient')
      -- A clinician also has a profile row; listing them once, as a clinician.
      AND NOT EXISTS (SELECT 1 FROM public.clinician_profiles c2 WHERE c2.user_id = p.user_id)
      AND _q IS NOT NULL
      AND (p.name ILIKE '%' || _q || '%'
           OR p.email ILIKE '%' || _q || '%'
           OR u.email ILIKE '%' || _q || '%')
  )
  SELECT r.kind, r.id, r.user_id, r.display_name, r.email, r.detail, r.tenant_name,
         r.connections, r.storage_bytes, r.last_seen, r.created_at,
         count(*) OVER () AS total_count
    FROM rows r
   ORDER BY r.created_at DESC
   LIMIT _lim OFFSET _off;
END $$;

-- ---------------------------------------------------------------------------
-- Access review: only once you already know one of the two parties.
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

  IF _q IS NULL OR length(_q) < 2 THEN
    RETURN;
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
      AND (pp.name ILIKE '%' || _q || '%'
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
      AND (pp.name ILIKE '%' || _q || '%'
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
