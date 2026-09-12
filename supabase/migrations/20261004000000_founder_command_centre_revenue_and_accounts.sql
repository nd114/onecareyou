-- ---------------------------------------------------------------------------
-- Founder command centre, phase 2: Revenue and Accounts.
--
-- Same rule as phase 1: these functions return counts, states and identifiers.
-- No clinical content reaches a platform admin through anything below. The
-- accounts directory deliberately returns a person's name, email and activity
-- counts and stops there — never a medication, reading, document or note.
--
-- Money is counted here in tiers and invoice minor units only. The price of a
-- tier lives in src/lib/pricing-constants.ts and useClinicianSubscription.ts,
-- and the console multiplies there, so a price change never means a migration.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Revenue overview: who is on what, what is owed, what is about to lapse.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revenue_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT jsonb_build_object(
    -- Tenants grouped by the tier they are on and whether it is still running.
    'tenants_by_tier', coalesce((
      SELECT jsonb_agg(t ORDER BY t->>'tier')
        FROM (
          SELECT jsonb_build_object(
                   'tier', coalesce(pr.subscription_tier, 'trial'),
                   'status', coalesce(pr.subscription_status, 'active'),
                   'count', count(*)
                 ) AS t
            FROM public.practices pr
           WHERE pr.is_active
           GROUP BY coalesce(pr.subscription_tier, 'trial'),
                    coalesce(pr.subscription_status, 'active')
        ) s
    ), '[]'::jsonb),

    -- Clinicians who pay on their own account rather than through a tenant.
    'clinicians_by_tier', coalesce((
      SELECT jsonb_agg(t ORDER BY t->>'tier')
        FROM (
          SELECT jsonb_build_object(
                   'tier', coalesce(c.subscription_tier, 'trial'),
                   'status', coalesce(c.subscription_status, 'active'),
                   'count', count(*)
                 ) AS t
            FROM public.clinician_profiles c
           GROUP BY coalesce(c.subscription_tier, 'trial'),
                    coalesce(c.subscription_status, 'active')
        ) s
    ), '[]'::jsonb),

    -- Patients on the consumer plan.
    'patients_by_tier', coalesce((
      SELECT jsonb_agg(t ORDER BY t->>'tier')
        FROM (
          SELECT jsonb_build_object(
                   'tier', coalesce(p.subscription_tier, 'free'),
                   'count', count(*)
                 ) AS t
            FROM public.profiles p
           GROUP BY coalesce(p.subscription_tier, 'free')
        ) s
    ), '[]'::jsonb),

    'trials', jsonb_build_object(
      'tenants', (SELECT count(*) FROM public.practices
                   WHERE is_active AND coalesce(subscription_tier, 'trial') = 'trial'),
      'clinicians', (SELECT count(*) FROM public.clinician_profiles
                      WHERE coalesce(subscription_tier, 'trial') = 'trial'),
      'lapsing_within_7_days', (SELECT count(*) FROM public.practices
                                 WHERE is_active
                                   AND subscription_ends_at IS NOT NULL
                                   AND subscription_ends_at BETWEEN now() AND now() + interval '7 days'),
      'already_lapsed', (SELECT count(*) FROM public.practices
                          WHERE is_active
                            AND subscription_ends_at IS NOT NULL
                            AND subscription_ends_at < now())
    ),

    -- Cancellations, with the reason where the tenant left one.
    'cancellations', jsonb_build_object(
      'last_30_days', (SELECT count(*) FROM public.practices
                        WHERE coalesce(subscription_status, 'active') IN ('canceled', 'cancelled')
                          AND updated_at > now() - interval '30 days'),
      'last_90_days', (SELECT count(*) FROM public.practices
                        WHERE coalesce(subscription_status, 'active') IN ('canceled', 'cancelled')
                          AND updated_at > now() - interval '90 days'),
      'tenants_deactivated', (SELECT count(*) FROM public.practices WHERE NOT is_active)
    ),

    -- Invoices a practice has raised. The platform's own interest is the fee.
    'invoices', jsonb_build_object(
      'unpaid_count', (SELECT count(*) FROM public.fhir_invoices
                        WHERE coalesce(status, 'draft') NOT IN ('paid', 'cancelled', 'balanced')),
      'unpaid_minor', (SELECT coalesce(sum(greatest(coalesce(total_minor, 0) - coalesce(paid_minor, 0), 0)), 0)
                         FROM public.fhir_invoices
                        WHERE coalesce(status, 'draft') NOT IN ('paid', 'cancelled', 'balanced')),
      'overdue_count', (SELECT count(*) FROM public.fhir_invoices
                         WHERE coalesce(status, 'draft') NOT IN ('paid', 'cancelled', 'balanced')
                           AND due_at IS NOT NULL AND due_at < now()),
      'platform_fee_minor', (SELECT coalesce(sum(coalesce(platform_fee_minor, 0)), 0)
                               FROM public.fhir_invoices
                              WHERE coalesce(status, 'draft') = 'paid'),
      'issued_last_30_days', (SELECT count(*) FROM public.fhir_invoices
                               WHERE created_at > now() - interval '30 days')
    ),

    -- Revenue share promised to institutional partners.
    'revenue_share', jsonb_build_object(
      'tenant_count', (SELECT count(*) FROM public.practices
                        WHERE is_active AND coalesce(revenue_share_pct, 0) > 0),
      'highest_pct', (SELECT coalesce(max(revenue_share_pct), 0) FROM public.practices
                       WHERE is_active),
      'attributed_patients', (SELECT count(*) FROM public.profiles
                               WHERE onboarded_via_practice_id IS NOT NULL)
    ),

    -- Storage is sold as an allowance per plan; packs are not a product yet.
    'storage', jsonb_build_object(
      'allowance_gb', (SELECT coalesce(sum(coalesce(storage_limit_gb, 0)), 0)
                         FROM public.practices WHERE is_active),
      'used_bytes', (SELECT coalesce(sum(bytes), 0) FROM public.storage_ledger),
      'tenants_over_75_pct', (
        SELECT count(*) FROM public.practices pr
         WHERE pr.is_active
           AND coalesce(pr.storage_limit_gb, 0) > 0
           AND public.get_practice_storage_bytes(pr.id)::numeric
               >= (pr.storage_limit_gb * 1024 ^ 3) * 0.75
      )
    ),

    'checked_at', now()
  ) INTO _out;

  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.admin_revenue_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_overview() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One billing row per tenant, for the table the founder acts from.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revenue_tenants()
RETURNS TABLE (
  id uuid,
  name text,
  tenant_type text,
  subscription_tier text,
  subscription_status text,
  subscription_ends_at timestamptz,
  days_remaining integer,
  member_count bigint,
  connected_patients bigint,
  patient_limit integer,
  member_limit integer,
  storage_limit_gb numeric,
  storage_bytes bigint,
  revenue_share_pct numeric,
  unpaid_invoice_count bigint,
  unpaid_invoice_minor bigint,
  currency text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.tenant_type,
    coalesce(pr.subscription_tier, 'trial'),
    coalesce(pr.subscription_status, 'active'),
    pr.subscription_ends_at,
    CASE WHEN pr.subscription_ends_at IS NULL THEN NULL
         ELSE ceil(extract(epoch FROM pr.subscription_ends_at - now()) / 86400)::integer
    END,
    (SELECT count(*) FROM public.practice_members pm
      WHERE pm.practice_id = pr.id AND pm.status = 'active'),
    (SELECT count(*) FROM public.practice_shares ps
      WHERE ps.practice_id = pr.id AND ps.is_active),
    pr.patient_limit,
    pr.member_limit,
    pr.storage_limit_gb,
    coalesce((SELECT sum(sl.bytes) FROM public.storage_ledger sl
               WHERE sl.practice_id = pr.id), 0)::bigint,
    coalesce(pr.revenue_share_pct, 0),
    (SELECT count(*) FROM public.fhir_invoices fi
      WHERE fi.practice_id = pr.id
        AND coalesce(fi.status, 'draft') NOT IN ('paid', 'cancelled', 'balanced')),
    coalesce((SELECT sum(greatest(coalesce(fi.total_minor, 0) - coalesce(fi.paid_minor, 0), 0))
                FROM public.fhir_invoices fi
               WHERE fi.practice_id = pr.id
                 AND coalesce(fi.status, 'draft') NOT IN ('paid', 'cancelled', 'balanced')), 0)::bigint,
    coalesce(pr.default_currency, 'USD'),
    pr.is_active,
    pr.created_at
  FROM public.practices pr
  ORDER BY
    CASE coalesce(pr.subscription_tier, 'trial')
      WHEN 'enterprise' THEN 0 WHEN 'pro' THEN 1 WHEN 'solo' THEN 2
      WHEN 'community' THEN 3 ELSE 4 END,
    pr.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_revenue_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_tenants() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Extend a tenant's runway. Extending from today rather than from an expiry
-- already in the past, so "14 more days" always means fourteen days from now.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_extend_trial(_practice_id uuid, _days integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_end timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _days IS NULL OR _days < 1 OR _days > 365 THEN
    RAISE EXCEPTION 'Extend by between 1 and 365 days';
  END IF;

  UPDATE public.practices
     SET subscription_ends_at =
           greatest(now(), coalesce(subscription_ends_at, now())) + make_interval(days => _days),
         updated_at = now()
   WHERE id = _practice_id
  RETURNING subscription_ends_at INTO _new_end;

  IF _new_end IS NULL THEN
    RAISE EXCEPTION 'No such tenant';
  END IF;

  PERFORM public.log_platform_admin_action(
    'extend_trial', 'tenant', _practice_id,
    jsonb_build_object('days', _days, 'ends_at', _new_end)
  );

  RETURN _new_end;
END $$;

REVOKE ALL ON FUNCTION public.admin_extend_trial(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accounts: one directory across tenants, clinicians and patients.
--
-- Searching and paging happen here rather than in the browser, so the console
-- never pulls the whole profiles table down to filter it. total_count rides
-- along on every row so the pager knows how far it can go.
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
      AND (_q IS NULL OR c.first_name ILIKE '%' || _q || '%'
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
      AND (_q IS NULL OR p.name ILIKE '%' || _q || '%'
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

REVOKE ALL ON FUNCTION public.admin_accounts_directory(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_accounts_directory(text, text, integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The drawer behind a directory row.
--
-- Audit entries come back as action names and timestamps. The details column
-- of hipaa_audit_logs is deliberately not returned: it can carry the shape of
-- a clinical record, and the console's promise is that it never shows one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_account_detail(_kind text, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _k text := lower(coalesce(_kind, ''));
  _user uuid;
  _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _k = 'tenant' THEN
    SELECT jsonb_build_object(
      'kind', 'tenant',
      'id', pr.id,
      'name', pr.name,
      'email', pr.email,
      'slug', pr.slug,
      'tenant_type', pr.tenant_type,
      'tier', coalesce(pr.subscription_tier, 'trial'),
      'status', coalesce(pr.subscription_status, 'active'),
      'ends_at', pr.subscription_ends_at,
      'is_active', pr.is_active,
      'location', nullif(concat_ws(', ', pr.city, pr.country), ''),
      'created_at', pr.created_at,
      'members', (SELECT count(*) FROM public.practice_members pm
                   WHERE pm.practice_id = pr.id AND pm.status = 'active'),
      'departments', (SELECT count(*) FROM public.practice_departments pd
                       WHERE pd.practice_id = pr.id),
      'connections', (SELECT count(*) FROM public.practice_shares ps
                       WHERE ps.practice_id = pr.id AND ps.is_active),
      'storage_bytes', coalesce((SELECT sum(sl.bytes) FROM public.storage_ledger sl
                                  WHERE sl.practice_id = pr.id), 0),
      'storage_limit_gb', coalesce(pr.storage_limit_gb, 0),
      'revenue_share_pct', coalesce(pr.revenue_share_pct, 0),
      'pending_invitations', (SELECT count(*) FROM public.practice_invitations pi
                               WHERE pi.practice_id = pr.id AND pi.status = 'pending'),
      'roles', '[]'::jsonb,
      'recent_activity', coalesce((
        SELECT jsonb_agg(a ORDER BY a->>'at' DESC)
          FROM (
            SELECT jsonb_build_object('action', pa.action, 'at', pa.created_at) AS a
              FROM public.platform_admin_actions pa
             WHERE pa.target_id = pr.id
             ORDER BY pa.created_at DESC LIMIT 10
          ) s
      ), '[]'::jsonb)
    ) INTO _out
    FROM public.practices pr
    WHERE pr.id = _id;

  ELSIF _k IN ('clinician', 'patient') THEN
    SELECT CASE WHEN _k = 'clinician'
                THEN (SELECT c.user_id FROM public.clinician_profiles c WHERE c.id = _id)
                ELSE (SELECT p.user_id FROM public.profiles p WHERE p.id = _id)
           END
      INTO _user;

    IF _user IS NULL THEN
      RAISE EXCEPTION 'No such account';
    END IF;

    SELECT jsonb_build_object(
      'kind', _k,
      'id', _id,
      'user_id', _user,
      'name', coalesce(p.name, u.email),
      'email', coalesce(p.email, u.email),
      'tier', CASE WHEN _k = 'clinician'
                   THEN coalesce(c.subscription_tier, 'trial')
                   ELSE coalesce(p.subscription_tier, 'free') END,
      'specialty', c.specialty,
      'is_verified', c.is_verified,
      'onboarding_completed', p.onboarding_completed,
      'email_confirmed', u.email_confirmed_at IS NOT NULL,
      'last_seen', u.last_sign_in_at,
      'created_at', coalesce(p.created_at, c.created_at, u.created_at),
      'roles', coalesce((
        SELECT jsonb_agg(ur.role::text ORDER BY ur.role::text)
          FROM public.user_roles ur WHERE ur.user_id = _user
      ), '[]'::jsonb),
      'tenants', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', pr.id, 'name', pr.name, 'role', pm.role, 'status', pm.status))
          FROM public.practice_members pm
          JOIN public.practices pr ON pr.id = pm.practice_id
         WHERE pm.user_id = _user
      ), '[]'::jsonb),
      'connections', jsonb_build_object(
        'clinician_shares', (SELECT count(*) FROM public.provider_shares ps
                              WHERE (ps.user_id = _user OR ps.clinician_user_id = _user)
                                AND ps.is_active),
        'institution_shares', (SELECT count(*) FROM public.practice_shares ps
                                WHERE ps.user_id = _user AND ps.is_active),
        'revoked', (SELECT count(*) FROM public.provider_shares ps
                     WHERE (ps.user_id = _user OR ps.clinician_user_id = _user)
                       AND NOT ps.is_active)
      ),
      'storage_bytes', coalesce((SELECT sum(sl.bytes) FROM public.storage_ledger sl
                                  WHERE sl.user_id = _user), 0),
      'record_counts', jsonb_build_object(
        'documents', (SELECT count(*) FROM public.health_documents h WHERE h.user_id = _user),
        'medications', (SELECT count(*) FROM public.medications m WHERE m.user_id = _user),
        'vitals', (SELECT count(*) FROM public.vitals v WHERE v.user_id = _user)
      ),
      'recent_activity', coalesce((
        SELECT jsonb_agg(a ORDER BY a->>'at' DESC)
          FROM (
            SELECT jsonb_build_object(
                     'action', al.action,
                     'resource_type', al.resource_type,
                     'at', al.created_at) AS a
              FROM public.hipaa_audit_logs al
             WHERE al.user_id = _user
             ORDER BY al.created_at DESC LIMIT 10
          ) s
      ), '[]'::jsonb)
    ) INTO _out
    FROM (SELECT 1) dummy
    LEFT JOIN public.profiles p ON p.user_id = _user
    LEFT JOIN public.clinician_profiles c ON c.user_id = _user
    LEFT JOIN auth.users u ON u.id = _user;

  ELSE
    RAISE EXCEPTION 'Unknown account kind';
  END IF;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'No such account';
  END IF;

  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.admin_account_detail(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_account_detail(text, uuid) TO authenticated, service_role;
