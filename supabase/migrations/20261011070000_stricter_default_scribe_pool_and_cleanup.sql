-- Small-gaps pass over steps 1 to 3 of the hospital-seat / account work.
--
--   1. A new practice starts with ONE clinician seat. practices.member_limit
--      defaults to 1 and a client-made practice is pinned to 1 (was 5). Every
--      existing tenant keeps its stored value: the stored limit is a floor, and
--      the plan's included seats plus purchased add-ons still lift it, so a new
--      Practice or Clinic tenant is not made smaller than its plan.
--   2. The scribe pool grows with the clinicians a practice has bought:
--      tier_limits.scribe_minutes_per_extra_clinician (300 on Practice and
--      Clinic, 0 elsewhere) times clinician_seats_purchased, added to the pool
--      in practice_account_overview and to scribe_minutes_included in
--      entitlements_for. Informational: nothing enforces it.
--   3. guard_practice_member_standing is not a definer, so it cannot call
--      _is_trusted_writer (revoked from clients). It used to, and a client
--      writing clinical_seat directly got "permission denied for function"
--      instead of the intended refusal. It now uses the current_user idiom of
--      the other pinned triggers.
--   4. Housekeeping from re-reading the earlier SQL (below).
--
-- No PHI is read or stored by anything here.

-- ---------------------------------------------------------------------------
-- 1. One clinician seat for a new practice
-- ---------------------------------------------------------------------------
ALTER TABLE public.practices ALTER COLUMN member_limit SET DEFAULT 1;

CREATE OR REPLACE FUNCTION public.guard_practice_commercial_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.subscription_tier := 'trial';
    NEW.subscription_status := 'active';
    NEW.subscription_ends_at := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.patient_limit := 25;
    NEW.member_limit := 1;
    NEW.storage_limit_gb := 25;
    NEW.revenue_share_pct := 0;
  ELSE
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_status := OLD.subscription_status;
    NEW.subscription_ends_at := OLD.subscription_ends_at;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.patient_limit := OLD.patient_limit;
    NEW.member_limit := OLD.member_limit;
    NEW.storage_limit_gb := OLD.storage_limit_gb;
    NEW.revenue_share_pct := OLD.revenue_share_pct;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_practice_commercial_fields() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Scribe minutes per purchased clinician seat
-- ---------------------------------------------------------------------------
ALTER TABLE public.tier_limits
  ADD COLUMN IF NOT EXISTS scribe_minutes_per_extra_clinician integer NOT NULL DEFAULT 0
    CHECK (scribe_minutes_per_extra_clinician >= 0);

COMMENT ON COLUMN public.tier_limits.scribe_minutes_per_extra_clinician IS
  'Pooled scribe minutes per month added for each purchased add-on clinician seat (300 on Practice and Clinic). Informational: the scribe is log-only metered and nothing blocks on it.';

UPDATE public.tier_limits SET scribe_minutes_per_extra_clinician = 300 WHERE tier IN ('pro', 'clinic');
UPDATE public.tier_limits SET scribe_minutes_per_extra_clinician = 0
 WHERE tier NOT IN ('pro', 'clinic');

-- ---------------------------------------------------------------------------
-- 3. practice_account_overview: the pool grows with purchased clinicians
-- ---------------------------------------------------------------------------
-- Same body as step 2B with the extra minutes added to the pool. No key is
-- added to the JSON, so the page contract is unchanged.

CREATE OR REPLACE FUNCTION public.practice_account_overview(_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  pr public.practices;
  lim record;
  ts record;
  tl public.tier_limits;
  efl public.tier_limits;
  _full boolean;
  _type text;
  _from timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  _to timestamptz := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
  _included integer;
  _used integer;
  _packs_total integer;
  _pack_left integer;
  _first_pack timestamptz;
  _overflow integer;
  _allocated integer;
  _members jsonb;
  _per jsonb;
  _packs jsonb;
  _clin_inc integer;
  _clin_max integer;
  _buy integer;
  _stor_mb integer;
  _used_bytes bigint;
  _staff_model text;
  _staff_limit integer;
  _extra_min integer := 0;
BEGIN
  IF _uid IS NULL OR _practice_id IS NULL THEN
    RAISE EXCEPTION 'Not available' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO pr FROM public.practices WHERE id = _practice_id;
  IF pr.id IS NULL THEN
    RAISE EXCEPTION 'Not available' USING ERRCODE = '42501';
  END IF;
  _full := public.can_manage_practice(_practice_id);
  IF NOT _full AND NOT (
       EXISTS (SELECT 1 FROM public.practice_members m
                WHERE m.practice_id = _practice_id AND m.user_id = _uid AND m.status = 'active')
       AND public.has_practice_capability(_uid, 'manage_billing', _practice_id)) THEN
    RAISE EXCEPTION 'Not available' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO lim FROM public._practice_limits(_practice_id);
  _type := pr.tenant_type;
  _staff_model := public._practice_staff_model(_practice_id);

  SELECT * INTO ts FROM public._practice_tier_seats(_practice_id);
  IF _type = 'practice' THEN
    _clin_inc := ts.included;
    _clin_max := ts.seat_max;
    _buy := pr.clinician_seats_purchased;
    SELECT * INTO tl FROM public.tier_limits t WHERE t.tier = ts.tier;
    _stor_mb := CASE WHEN lim.storage_mb IS NULL THEN NULL
                     ELSE greatest(lim.storage_mb, coalesce(ts.storage_mb, 0))
                          + _buy * coalesce(ts.extra_storage_mb, 0) END;
  ELSE
    _clin_inc := lim.seat_limit;
    _clin_max := NULL;
    _buy := 0;
    _stor_mb := lim.storage_mb;
  END IF;

  SELECT * INTO efl FROM public.tier_limits t WHERE t.tier = lim.tier;
  _included := coalesce(efl.scribe_minutes_monthly, 0);
  -- The pool grows with the clinicians the practice has bought: the plan's
  -- minutes per add-on clinician seat (300 on Practice and Clinic) times the
  -- seats purchased. Informational, like the rest of the pool figures.
  IF _type = 'practice' AND pr.clinician_seats_purchased > 0 THEN
    SELECT coalesce(t.scribe_minutes_per_extra_clinician, 0) * pr.clinician_seats_purchased
      INTO _extra_min
      FROM public.tier_limits t WHERE t.tier = ts.tier;
    _extra_min := coalesce(_extra_min, 0);
  END IF;
  _included := _included + _extra_min;
  _staff_limit := CASE WHEN _staff_model = 'staff_paid' THEN pr.staff_seats_purchased ELSE NULL END;

  SELECT coalesce(sum(s.billed_minutes), 0)::integer INTO _used
    FROM public.scribe_usage s
   WHERE s.practice_id = _practice_id AND s.created_at >= _from AND s.created_at < _to;

  SELECT coalesce(sum(k.minutes), 0)::integer, min(k.purchased_at)
    INTO _packs_total, _first_pack
    FROM public.scribe_packs k
   WHERE k.practice_id = _practice_id AND k.expires_at > now();

  -- Packs are drawn on only for use beyond the monthly included pool, month by
  -- month since the earliest live pack was bought. Informational.
  SELECT coalesce(sum(greatest(0, m.mins - _included)), 0)::integer INTO _overflow
    FROM (SELECT date_trunc('month', s.created_at AT TIME ZONE 'UTC') AS mth,
                 sum(s.billed_minutes) AS mins
            FROM public.scribe_usage s
           WHERE s.practice_id = _practice_id
             AND _first_pack IS NOT NULL AND s.created_at >= _first_pack
           GROUP BY 1) m;
  _pack_left := greatest(0, _packs_total - _overflow);

  SELECT coalesce(sum(a.cap_minutes), 0)::integer INTO _allocated
    FROM public.practice_scribe_allocations a
    JOIN public.practice_members m
      ON m.practice_id = a.practice_id AND m.user_id = a.user_id AND m.status = 'active'
   WHERE a.practice_id = _practice_id;

  SELECT coalesce(sum(l.bytes), 0) INTO _used_bytes
    FROM public.storage_ledger l WHERE l.practice_id = _practice_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'minutes', k.minutes,
           'purchased_at', k.purchased_at,
           'expires_at', k.expires_at) ORDER BY k.purchased_at), '[]'::jsonb)
    INTO _packs
    FROM public.scribe_packs k
   WHERE k.practice_id = _practice_id AND k.expires_at > now();

  IF _full THEN
    SELECT coalesce(jsonb_agg(r.j ORDER BY r.ord, r.created_at), '[]'::jsonb) INTO _members
      FROM (
        SELECT m.created_at,
               CASE m.role::text WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END AS ord,
               jsonb_build_object(
                 'user_id', m.user_id,
                 'name', coalesce(
                           nullif(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''),
                           nullif(btrim(pf.name), ''),
                           'Team member'),
                 'role', m.role::text,
                 'clinical_seat', m.clinical_seat,
                 'is_clinical', public.practice_member_is_clinical(m.practice_id, m.role, m.clinical_seat),
                 'status', m.status,
                 'scribe_cap_minutes', al.cap_minutes) AS j
          FROM public.practice_members m
          LEFT JOIN LATERAL (SELECT c.first_name, c.last_name FROM public.clinician_profiles c
                              WHERE c.user_id = m.user_id LIMIT 1) cp ON true
          LEFT JOIN LATERAL (SELECT p.name FROM public.profiles p
                              WHERE p.user_id = m.user_id LIMIT 1) pf ON true
          LEFT JOIN public.practice_scribe_allocations al
                 ON al.practice_id = m.practice_id AND al.user_id = m.user_id
         WHERE m.practice_id = _practice_id AND m.status = 'active'
      ) r;

    SELECT coalesce(jsonb_agg(r.j ORDER BY r.ord, r.created_at), '[]'::jsonb) INTO _per
      FROM (
        SELECT m.created_at,
               CASE m.role::text WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END AS ord,
               jsonb_build_object(
                 'user_id', m.user_id,
                 'name', coalesce(
                           nullif(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''),
                           nullif(btrim(pf.name), ''),
                           'Team member'),
                 'used_minutes', coalesce(u.mins, 0),
                 'cap_minutes', al.cap_minutes) AS j
          FROM public.practice_members m
          LEFT JOIN LATERAL (SELECT c.first_name, c.last_name FROM public.clinician_profiles c
                              WHERE c.user_id = m.user_id LIMIT 1) cp ON true
          LEFT JOIN LATERAL (SELECT p.name FROM public.profiles p
                              WHERE p.user_id = m.user_id LIMIT 1) pf ON true
          LEFT JOIN public.practice_scribe_allocations al
                 ON al.practice_id = m.practice_id AND al.user_id = m.user_id
          LEFT JOIN LATERAL (SELECT sum(s.billed_minutes)::integer AS mins
                               FROM public.scribe_usage s
                              WHERE s.practice_id = m.practice_id AND s.user_id = m.user_id
                                AND s.created_at >= _from AND s.created_at < _to) u ON true
         WHERE m.practice_id = _practice_id AND m.status = 'active'
           AND (public.practice_member_is_clinical(m.practice_id, m.role, m.clinical_seat)
                OR al.cap_minutes IS NOT NULL OR coalesce(u.mins, 0) > 0)
      ) r;
  ELSE
    _members := '[]'::jsonb;
    _per := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'view', CASE WHEN _full THEN 'full' ELSE 'billing' END,
    'practice', jsonb_build_object(
      'id', pr.id,
      'name', pr.name,
      'tenant_type', _type,
      'tier', lim.tier,
      -- Only a hospital has the clinical-seat switch (owner/admin are clinical
      -- only when given a seat).
      'clinical_seat_switch', (_type = 'hospital')),
    'seats', jsonb_build_object(
      'clinician', jsonb_build_object(
        'used', public._practice_seats_in_use(_practice_id),
        'limit', lim.seat_limit,
        'included', _clin_inc,
        'purchased', _buy,
        'max', _clin_max,
        'addon_price_usd', CASE WHEN _type = 'practice' THEN tl.clinician_addon_price_usd ELSE NULL END),
      'staff', jsonb_build_object(
        'used', public._practice_seats_of_kind(_practice_id, 'staff', true),
        'purchased', pr.staff_seats_purchased,
        'limit', _staff_limit,
        'model', _staff_model,
        'price_usd', CASE WHEN _staff_model = 'staff_paid' THEN tl.staff_seat_price_usd ELSE NULL END)),
    'patients', jsonb_build_object(
      'used', public._practice_patient_count(_practice_id),
      'limit', lim.patient_limit),
    'storage', jsonb_build_object(
      'used_gb', round(_used_bytes / 1073741824.0, 2),
      'limit_gb', CASE WHEN _stor_mb IS NULL THEN NULL ELSE round(_stor_mb / 1024.0, 2) END),
    'scribe', jsonb_build_object(
      'pool_minutes', _included,
      'used_minutes', _used,
      'pack_minutes_remaining', _pack_left,
      'period_start', to_char(_from AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      'period_end', to_char((_to - interval '1 day') AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      'included_minutes', _included,
      'pack_minutes_total', _packs_total,
      'total_minutes', _included + _packs_total,
      'allocated_minutes', _allocated,
      'allocation_exceeds_pool', (_allocated > _included + _packs_total),
      'per_member', _per),
    'partner', jsonb_build_object(
      'status', pr.partner_status,
      'revenue_share_pct', CASE WHEN _full AND pr.partner_status = 'active'
                                 THEN nullif(pr.revenue_share_pct, 0) ELSE NULL END,
      'referral_slug', CASE WHEN _full AND pr.partner_status = 'active'
                            THEN pr.referral_slug ELSE NULL END),
    'addons', jsonb_build_object(
      'clinician_seats', _buy,
      'staff_seats', pr.staff_seats_purchased,
      'scribe_packs', _packs,
      'extra_storage_gb', CASE WHEN _type = 'practice'
                               THEN round((_buy * coalesce(ts.extra_storage_mb, 0)) / 1024.0, 2)
                               ELSE 0 END),
    'members', _members);
END
$$;

-- guard_practice_member_standing
CREATE OR REPLACE FUNCTION public.guard_practice_member_standing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  -- The clinical seat is pinned. A client cannot write it, nor can a manager
  -- under the UPDATE policy; set_member_clinical_seat (a definer) is the route.
  -- The service role and a platform admin are trusted. This trigger is not a
  -- definer, so it cannot call _is_trusted_writer (revoked from clients); it
  -- uses the same current_user idiom as guard_practice_account_columns.
  IF current_user IN ('authenticated', 'anon')
     AND NEW.clinical_seat IS DISTINCT FROM OLD.clinical_seat
     AND NOT (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'The clinical seat changes only through set_member_clinical_seat'
      USING ERRCODE = '42501';
  END IF;

  -- A client may still edit the other member settings (invite rights and the
  -- like) under the manager UPDATE policy. Standing is not one of them.
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.status IS DISTINCT FROM OLD.status
          OR NEW.role IS DISTINCT FROM OLD.role
          OR NEW.can_view_all_patients IS DISTINCT FROM OLD.can_view_all_patients
          OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
          OR NEW.ended_by IS DISTINCT FROM OLD.ended_by
          OR NEW.end_reason IS DISTINCT FROM OLD.end_reason) THEN
    RAISE EXCEPTION 'Membership status, role and patient scope change only through end_practice_membership, leave_practice or change_practice_member_access'
      USING ERRCODE = '42501';
  END IF;

  -- The owner rules. They bind every end-user request, whichever definer it
  -- came through; a request with no signed-in user (the service role, a
  -- migration) is the platform's own escape hatch and is let by.
  IF _actor IS NOT NULL
     AND OLD.role = 'owner' AND OLD.status = 'active'
     AND (NEW.role IS DISTINCT FROM 'owner' OR NEW.status IS DISTINCT FROM 'active') THEN
    -- Serialise concurrent owner changes on one tenant, or two owners leaving
    -- at once would each see the other still there.
    PERFORM 1 FROM public.practices WHERE id = NEW.practice_id FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.practice_id = NEW.practice_id
         AND pm.user_id = _actor
         AND pm.role = 'owner'
         AND pm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Only an owner can end or change another owner''s membership'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.practice_id = NEW.practice_id
         AND pm.id <> NEW.id
         AND pm.role = 'owner'
         AND pm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'This is the last owner of the hospital — appoint another owner first'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Someone who left of their own accord is not put back by a manager: that
  -- would enrol them without agreeing to it. They are invited and accept.
  IF _actor IS NOT NULL
     AND OLD.status IS DISTINCT FROM 'active' AND NEW.status = 'active'
     AND OLD.end_reason = 'left'
     AND _actor IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'This person left the practice themselves. Invite them again instead.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' THEN
    NEW.ended_at := now();
    NEW.ended_by := _actor;
    IF NEW.end_reason IS NOT DISTINCT FROM OLD.end_reason THEN
      NEW.end_reason := CASE WHEN _actor IS NOT NULL AND _actor = NEW.user_id
                             THEN 'left' ELSE 'ended_by_practice' END;
    END IF;
  ELSIF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    -- A new period. The previous ending stays in the ledger.
    NEW.ended_at := NULL;
    NEW.ended_by := NULL;
    NEW.end_reason := NULL;
  END IF;

  -- A member moved off the clinical side does not keep the wide view it gave
  -- them as a clinician (G8). A manager may grant it again deliberately, and
  -- even then the clinical gates are role-checked.
  IF NEW.role IS DISTINCT FROM OLD.role
     AND public.practice_member_is_clinical(OLD.practice_id, OLD.role, OLD.clinical_seat)
     AND NOT public.practice_member_is_clinical(NEW.practice_id, NEW.role, NEW.clinical_seat) THEN
    NEW.can_view_all_patients := false;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. entitlements_for
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entitlements_for(_user uuid DEFAULT NULL)
RETURNS TABLE (
  tier text,
  patient_limit integer,
  patient_count integer,
  seat_limit integer,
  seat_count integer,
  scribe_included boolean,
  scribe_minutes_monthly integer,
  storage_mb integer,
  practice_id uuid,
  practice_patient_limit integer,
  practice_patient_count integer,
  at_patient_limit boolean,
  over_patient_limit boolean,
  at_seat_limit boolean,
  over_seat_limit boolean,
  clinician_seat_limit integer,
  clinician_seat_count integer,
  staff_seat_model text,
  staff_seats_purchased integer,
  staff_in_use integer,
  scribe_minutes_included integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := coalesce(_user, auth.uid());
  _caller uuid := auth.uid();
  own record;
  win record;
  pr record;
  ts record;
  _pid uuid;
  _pplim integer;
  _tier text;
  _plim integer;
  _pcount integer;
  _slim integer;
  _scount integer;
  _store integer;
  _extra integer := 0;
  _model text;
  _bought integer;
  _staff integer;
  _clin integer;
  _scribe_min integer;
  _cbought integer;
  _per_extra integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '28000';
  END IF;
  IF _caller IS NOT NULL AND _caller IS DISTINCT FROM _uid
     AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'You can only read your own entitlements' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO own FROM public._clinician_limits(_uid);
  _tier := own.tier;
  _plim := own.patient_limit;
  _slim := own.seat_limit;
  _store := own.storage_mb;

  -- The practice this person works in (an owned one first), and whether its
  -- plan is bigger than their own.
  SELECT pm.practice_id INTO _pid
    FROM public.practice_members pm
   WHERE pm.user_id = _uid AND pm.status = 'active'
   ORDER BY (pm.role = 'owner') DESC, pm.created_at
   LIMIT 1;

  FOR pr IN
    SELECT pm.practice_id AS id, p.tenant_type, p.clinician_seats_purchased AS bought
      FROM public.practice_members pm
      JOIN public.practices p ON p.id = pm.practice_id
     WHERE pm.user_id = _uid AND pm.status = 'active'
  LOOP
    SELECT * INTO win FROM public._practice_limits(pr.id);
    IF win.tier IS NOT NULL
       AND public._lim_max(_plim, win.patient_limit) IS NOT DISTINCT FROM win.patient_limit
       AND win.patient_limit IS DISTINCT FROM _plim THEN
      _tier := win.tier;
      _plim := win.patient_limit;
      IF win.storage_mb IS NULL OR _store IS NULL THEN _store := NULL;
      ELSE _store := greatest(_store, win.storage_mb);
      END IF;
    END IF;
    -- Storage bought with add-on clinician seats, from any practice they belong to.
    IF pr.tenant_type = 'practice' AND pr.bought > 0 THEN
      SELECT * INTO ts FROM public._practice_tier_seats(pr.id);
      _extra := greatest(_extra, pr.bought * coalesce(ts.extra_storage_mb, 0));
    END IF;
  END LOOP;

  IF _store IS NOT NULL THEN
    _store := _store + _extra;
  END IF;

  _plim := public._personal_patient_limit(_uid);
  _pcount := public._personal_patient_count(_uid);

  IF _pid IS NOT NULL THEN
    SELECT * INTO win FROM public._practice_limits(_pid);
    _pplim := win.patient_limit;
    _slim := win.seat_limit;
    _scount := public._practice_seats_in_use(_pid);
    _model := public._practice_staff_model(_pid);
    SELECT p.staff_seats_purchased INTO _bought FROM public.practices p WHERE p.id = _pid;
    _staff := public._practice_seats_of_kind(_pid, 'staff', true);
    _clin := public._practice_seats_of_kind(_pid, 'clinical', true);
  ELSE
    _scount := 1;
    SELECT t.staff_seat_model INTO _model FROM public.tier_limits t WHERE t.tier = _tier;
    _bought := 0;
    _staff := 0;
    _clin := 1;
  END IF;
  _model := coalesce(_model, 'shared');

  SELECT t.scribe_minutes_monthly INTO _scribe_min FROM public.tier_limits t WHERE t.tier = _tier;
  -- Pooled minutes grow with the add-on clinician seats the practice bought
  -- (300 each on Practice and Clinic). Informational: nothing enforces it.
  IF _scribe_min IS NOT NULL AND _pid IS NOT NULL THEN
    SELECT p.clinician_seats_purchased INTO _cbought
      FROM public.practices p WHERE p.id = _pid AND p.tenant_type = 'practice';
    IF coalesce(_cbought, 0) > 0 THEN
      SELECT * INTO ts FROM public._practice_tier_seats(_pid);
      SELECT t.scribe_minutes_per_extra_clinician INTO _per_extra
        FROM public.tier_limits t WHERE t.tier = ts.tier;
      _scribe_min := _scribe_min + _cbought * coalesce(_per_extra, 0);
    END IF;
  END IF;

  RETURN QUERY SELECT
    _tier,
    _plim,
    _pcount,
    _slim,
    _scount,
    own.scribe_included,
    own.scribe_minutes_monthly,
    _store,
    _pid,
    _pplim,
    CASE WHEN _pid IS NULL THEN NULL ELSE public._practice_patient_count(_pid) END,
    (_plim IS NOT NULL AND _pcount >= _plim),
    (_plim IS NOT NULL AND _pcount > _plim),
    (_slim IS NOT NULL AND _scount >= _slim),
    (_slim IS NOT NULL AND _scount > _slim),
    _slim,
    _clin,
    _model,
    coalesce(_bought, 0),
    _staff,
    _scribe_min;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. Housekeeping found on re-reading steps 1 to 3
-- ---------------------------------------------------------------------------
-- _effective_clinician_limit was the one function of the set without a pinned
-- search_path (its body names public. everywhere, but every other function here
-- pins it, and an unpinned one is a finding waiting to be written).
ALTER FUNCTION public._effective_clinician_limit(integer, integer, integer, integer)
  SET search_path = public;

-- Re-read and found sound: every function these steps added is either a client
-- RPC with EXECUTE for authenticated only (anon revoked), a helper revoked from
-- clients, or a trigger function revoked from clients; every definer pins
-- search_path; the four new tables have RLS on and no client write grants.
-- CREATE OR REPLACE above keeps the existing grants, so none are repeated.
