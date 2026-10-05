-- Step 2B: the account RPCs, purchased clinician seats, scribe packs and
-- allocations, partner requests and the add-on billing entry point.
--
--   1. Effective clinician limit = the larger of the stored practices.member_limit
--      (a floor the platform sets; every existing row keeps it, grandfathered)
--      and the plan's included seats + purchased add-on seats (capped at the
--      plan's seat_max). practices.clinician_seats_purchased is a pinned column.
--      Add-on storage (10 GB per purchased clinician) is part of storage_mb.
--   2. practice_account_overview(_practice_id): one JSON document for the
--      Manage Account page (owner/admin, or manage_billing for a reduced view).
--   3. set_scribe_member_cap + practice_scribe_allocations: INFORMATIONAL. The
--      scribe stays log-only metered; nothing here blocks anything.
--   4. scribe_packs: bought pooled minutes, written only by the billing path.
--   5. request_partnership + partner_requests; partner_status and referral_slug
--      are pinned columns. Nothing here stores a commission or revenue figure.
--   6. apply_addon_change: service-role-only, idempotent on the Stripe event.
--
-- No PHI is read or stored by anything in this file: counts, minutes, roles and
-- first names of the practice's own members only, and only for the people who
-- run the practice.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS clinician_seats_purchased integer NOT NULL DEFAULT 0
    CHECK (clinician_seats_purchased >= 0),
  ADD COLUMN IF NOT EXISTS partner_status text NOT NULL DEFAULT 'none'
    CHECK (partner_status IN ('none', 'requested', 'active')),
  ADD COLUMN IF NOT EXISTS referral_slug text
    CHECK (referral_slug IS NULL OR referral_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$');

CREATE UNIQUE INDEX IF NOT EXISTS practices_referral_slug_key
  ON public.practices (referral_slug) WHERE referral_slug IS NOT NULL;

COMMENT ON COLUMN public.practices.clinician_seats_purchased IS
  'Paid add-on clinician seats, on top of the plan''s included seats. Pinned: only the service role, a platform admin or a SECURITY DEFINER function can change it.';
COMMENT ON COLUMN public.practices.partner_status IS
  'none | requested | active. Pinned: set by request_partnership (requested) and by a platform decision (active). No commission or revenue figure is kept here.';
COMMENT ON COLUMN public.practices.referral_slug IS
  'Public referral handle for an active partner. Pinned: set by a platform admin or the service role.';

-- The column default of practices.member_limit (5) and the client-INSERT guard are
-- NOT lowered here: thirteen existing fixtures create a default or client-made
-- practice and seat several people, and would all be refused at 1. A tenant's
-- stored limit is therefore a floor the platform sets (admin_create_tenant takes
-- it explicitly); the plan and purchases lift it, never lower it.

ALTER TABLE public.tier_limits
  ADD COLUMN IF NOT EXISTS clinician_addon_price_usd numeric(8, 2)
    CHECK (clinician_addon_price_usd IS NULL OR clinician_addon_price_usd >= 0),
  ADD COLUMN IF NOT EXISTS staff_seat_price_usd numeric(8, 2)
    CHECK (staff_seat_price_usd IS NULL OR staff_seat_price_usd >= 0);

COMMENT ON COLUMN public.tier_limits.clinician_addon_price_usd IS
  'Monthly price of one add-on clinician seat, shown on the account page. Display only; Stripe is the source of the charge.';
COMMENT ON COLUMN public.tier_limits.staff_seat_price_usd IS
  'Monthly price of one paid staff seat, shown on the account page. Display only.';

UPDATE public.tier_limits SET clinician_addon_price_usd = 49, staff_seat_price_usd = 15 WHERE tier = 'pro';
UPDATE public.tier_limits SET clinician_addon_price_usd = 45, staff_seat_price_usd = 15 WHERE tier = 'clinic';

-- ---------------------------------------------------------------------------
-- 2. One pin for every billing/partner column on practices
-- ---------------------------------------------------------------------------
-- Replaces guard_staff_seats_purchased. Not SECURITY DEFINER, so current_user is
-- the caller: a signed-in client (authenticated/anon) is refused unless it is a
-- platform admin. The service role, a migration and SECURITY DEFINER functions
-- (request_partnership, apply_addon_change) run as other roles and pass.
CREATE OR REPLACE FUNCTION public.guard_practice_account_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _col text := NULL;
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin')) THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.staff_seats_purchased IS DISTINCT FROM 0 THEN _col := 'staff_seats_purchased';
      ELSIF NEW.clinician_seats_purchased IS DISTINCT FROM 0 THEN _col := 'clinician_seats_purchased';
      ELSIF NEW.partner_status IS DISTINCT FROM 'none' THEN _col := 'partner_status';
      ELSIF NEW.referral_slug IS NOT NULL THEN _col := 'referral_slug';
      END IF;
    ELSE
      IF NEW.staff_seats_purchased IS DISTINCT FROM OLD.staff_seats_purchased THEN _col := 'staff_seats_purchased';
      ELSIF NEW.clinician_seats_purchased IS DISTINCT FROM OLD.clinician_seats_purchased THEN _col := 'clinician_seats_purchased';
      ELSIF NEW.partner_status IS DISTINCT FROM OLD.partner_status THEN _col := 'partner_status';
      ELSIF NEW.referral_slug IS DISTINCT FROM OLD.referral_slug THEN _col := 'referral_slug';
      END IF;
    END IF;
    IF _col IS NOT NULL THEN
      RAISE EXCEPTION '% is set by billing, not by a client', _col USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_staff_seats_purchased ON public.practices;
DROP FUNCTION IF EXISTS public.guard_staff_seats_purchased();

DROP TRIGGER IF EXISTS trg_guard_practice_account_columns ON public.practices;
CREATE TRIGGER trg_guard_practice_account_columns
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_account_columns();

-- ---------------------------------------------------------------------------
-- 3. The effective clinician limit
-- ---------------------------------------------------------------------------
-- The plan that supplies a practice's seats: the practice's own tier or an
-- active owner's personal tier, whichever includes the most (the rule
-- _practice_limits already used). NULL included = unlimited.
CREATE OR REPLACE FUNCTION public._practice_tier_seats(_pid uuid)
RETURNS TABLE (
  tier text,
  included integer,
  seat_max integer,
  storage_mb integer,
  extra_storage_mb integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.tier,
         public._lim_norm(t.seat_limit),
         t.seat_max,
         t.storage_mb,
         t.storage_mb_per_extra_clinician
    FROM (
      SELECT pr.subscription_tier AS tier FROM public.practices pr WHERE pr.id = _pid
      UNION
      SELECT cl.tier
        FROM public.practice_members pm
        CROSS JOIN LATERAL public._clinician_limits(pm.user_id) cl
       WHERE pm.practice_id = _pid AND pm.role = 'owner' AND pm.status = 'active'
    ) s
    JOIN public.tier_limits t ON t.tier = s.tier
   ORDER BY public._lim_norm(t.seat_limit) DESC NULLS FIRST, t.seat_max DESC NULLS FIRST, t.tier
   LIMIT 1
$$;

-- Plan seats + purchased seats, capped at the plan's published maximum; the
-- stored limit is a floor (grandfathered tenants keep what they have). NULL
-- (stored or plan) is unlimited.
CREATE OR REPLACE FUNCTION public._effective_clinician_limit(
  _stored integer, _included integer, _seat_max integer, _purchased integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public._lim_norm(_stored) IS NULL THEN NULL
    WHEN _included IS NULL THEN NULL
    ELSE greatest(
      public._lim_norm(_stored),
      greatest(_included,
               least(coalesce(_seat_max, 2147483647)::bigint,
                     _included::bigint + greatest(_purchased, 0))::integer))
  END
$$;

-- Practice-type tenants: stored limit as a floor, raised to the plan's included
-- seats plus purchased add-ons. Hospitals: stored figures only.
CREATE OR REPLACE FUNCTION public._practice_limits(_pid uuid)
RETURNS TABLE (
  tier text,
  patient_limit integer,
  seat_limit integer,
  storage_mb integer
)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  pr public.practices;
  tl public.tier_limits;
  ol record;
  ts record;
  _pat integer;
  _seat integer;
  _store integer;
  _tier text;
BEGIN
  SELECT * INTO pr FROM public.practices WHERE id = _pid;
  IF pr.id IS NULL THEN
    RETURN;
  END IF;

  _pat := public._lim_norm(pr.patient_limit);
  _seat := public._lim_norm(pr.member_limit);
  _store := CASE WHEN pr.storage_limit_gb IS NULL THEN NULL
                 ELSE (pr.storage_limit_gb * 1024)::integer END;
  _tier := coalesce(pr.subscription_tier, 'trial');

  IF pr.tenant_type = 'practice' THEN
    SELECT * INTO tl FROM public.tier_limits t WHERE t.tier = pr.subscription_tier;
    IF tl.tier IS NOT NULL THEN
      _pat := CASE WHEN _pat IS NULL THEN NULL ELSE public._lim_max(_pat, tl.patient_limit) END;
    END IF;

    FOR ol IN
      SELECT cl.*
        FROM public.practice_members pm
        CROSS JOIN LATERAL public._clinician_limits(pm.user_id) cl
       WHERE pm.practice_id = _pid AND pm.role = 'owner' AND pm.status = 'active'
    LOOP
      IF _pat IS NOT NULL AND (ol.patient_limit IS NULL OR ol.patient_limit > _pat) THEN
        _pat := ol.patient_limit;
        _tier := ol.tier;
      END IF;
    END LOOP;

    SELECT * INTO ts FROM public._practice_tier_seats(_pid);
    IF ts.tier IS NOT NULL THEN
      _seat := public._effective_clinician_limit(
                 pr.member_limit, ts.included, ts.seat_max, pr.clinician_seats_purchased);
    END IF;
  END IF;

  tier := _tier;
  patient_limit := _pat;
  seat_limit := _seat;
  storage_mb := _store;
  RETURN NEXT;
END
$$;

-- Where the plan row is missing (no tier_limits row for the tenant's tier or any
-- owner tier) the stored limit stands, as before.

-- ---------------------------------------------------------------------------
-- 4. entitlements_for: add-on storage
-- ---------------------------------------------------------------------------
-- Same 21 columns. storage_mb gains 10 GB (storage_mb_per_extra_clinician) per
-- purchased add-on clinician seat, from the practice that has bought them.
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
-- 5. Tables
-- ---------------------------------------------------------------------------
-- Pooled scribe minutes an owner has set aside for one member. INFORMATIONAL:
-- nothing reads this to allow or refuse a scribe request.
CREATE TABLE IF NOT EXISTS public.practice_scribe_allocations (
  practice_id  uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  cap_minutes  integer NOT NULL CHECK (cap_minutes BETWEEN 0 AND 1000000),
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (practice_id, user_id)
);

-- Bought pooled minutes. Written only by apply_addon_change (service role).
CREATE TABLE IF NOT EXISTS public.scribe_packs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id   uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  minutes       integer NOT NULL CHECK (minutes > 0),
  purchased_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '12 months'),
  stripe_ref    text NOT NULL UNIQUE CHECK (length(stripe_ref) BETWEEN 1 AND 255)
);
CREATE INDEX IF NOT EXISTS scribe_packs_practice_idx ON public.scribe_packs (practice_id, expires_at);

-- Requests to become a referral partner. Business contact details only.
CREATE TABLE IF NOT EXISTS public.partner_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id   uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  requested_by  uuid NOT NULL,
  contact       text NOT NULL CHECK (length(contact) BETWEEN 3 AND 200),
  message       text CHECK (message IS NULL OR length(message) <= 2000),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'declined')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_requests_one_open
  ON public.partner_requests (practice_id) WHERE status = 'open';

-- Every add-on event the billing path has seen, once per (Stripe event, add-on).
-- The outcome is kept, including a refusal, so a retry gets the same answer.
CREATE TABLE IF NOT EXISTS public.addon_events (
  stripe_event_id  text NOT NULL CHECK (length(stripe_event_id) BETWEEN 1 AND 255),
  addon            text NOT NULL CHECK (length(addon) BETWEEN 1 AND 40),
  practice_id      uuid,
  qty              integer,
  status           text NOT NULL,
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stripe_event_id, addon)
);

ALTER TABLE public.practice_scribe_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scribe_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins read scribe allocations" ON public.practice_scribe_allocations;
CREATE POLICY "Owners and admins read scribe allocations"
  ON public.practice_scribe_allocations FOR SELECT TO authenticated
  USING (public.can_manage_practice(practice_id));

DROP POLICY IF EXISTS "Members read their own scribe cap" ON public.practice_scribe_allocations;
CREATE POLICY "Members read their own scribe cap"
  ON public.practice_scribe_allocations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners and admins read scribe packs" ON public.scribe_packs;
CREATE POLICY "Owners and admins read scribe packs"
  ON public.scribe_packs FOR SELECT TO authenticated
  USING (public.can_manage_practice(practice_id));

DROP POLICY IF EXISTS "Owners and admins read partner requests" ON public.partner_requests;
CREATE POLICY "Owners and admins read partner requests"
  ON public.partner_requests FOR SELECT TO authenticated
  USING (public.can_manage_practice(practice_id));

-- addon_events: no client policy at all.

REVOKE ALL ON public.practice_scribe_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scribe_packs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.partner_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.addon_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_scribe_allocations TO authenticated;
GRANT SELECT ON public.scribe_packs TO authenticated;
GRANT SELECT ON public.partner_requests TO authenticated;
GRANT ALL ON public.practice_scribe_allocations TO service_role;
GRANT ALL ON public.scribe_packs TO service_role;
GRANT ALL ON public.partner_requests TO service_role;
GRANT ALL ON public.addon_events TO service_role;

COMMENT ON TABLE public.practice_scribe_allocations IS
  'Informational per-member share of the pooled scribe minutes. Never enforced: the scribe is metered, not capped. Written by set_scribe_member_cap only.';
COMMENT ON TABLE public.scribe_packs IS
  'Pooled scribe minutes bought as packs (live until expires_at). Written only by apply_addon_change.';
COMMENT ON TABLE public.partner_requests IS
  'Partnership requests from a practice owner or admin. Business contact only, no PHI. Decided by the platform (service role).';
COMMENT ON TABLE public.addon_events IS
  'Idempotency ledger for apply_addon_change, one row per (Stripe event, add-on) with the outcome. Service role only.';

-- A platform decision on a request moves the practice's partner_status with it:
-- approved becomes active, declined goes back to none. SECURITY DEFINER, so the
-- column pin on practices lets it through; clients cannot update this table.
CREATE OR REPLACE FUNCTION public.apply_partner_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'open' THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
    IF NEW.decided_by IS NULL THEN NEW.decided_by := auth.uid(); END IF;
    UPDATE public.practices
       SET partner_status = CASE NEW.status WHEN 'approved' THEN 'active' ELSE 'none' END
     WHERE id = NEW.practice_id;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A decided request cannot be changed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_apply_partner_decision ON public.partner_requests;
CREATE TRIGGER trg_apply_partner_decision
  BEFORE UPDATE OF status ON public.partner_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_partner_decision();

-- ---------------------------------------------------------------------------
-- 6. practice_account_overview
-- ---------------------------------------------------------------------------
-- Owner/admin see everything. A member with manage_billing (but not owner/admin)
-- sees the figures without the member list, the per-member scribe rows, the
-- referral slug or any revenue figure. Everyone else, a stranger and a platform
-- admin who is not a member get the same refusal ('Not available'), so the call
-- does not confirm that a practice exists.
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

-- ---------------------------------------------------------------------------
-- 7. set_scribe_member_cap
-- ---------------------------------------------------------------------------
-- Owner/admin (or manage_team). NULL clears the cap. The member must be active
-- in this practice. The figures are informational: nothing in the scribe path
-- reads them, and the sum may exceed the pool (the overview flags that).
CREATE OR REPLACE FUNCTION public.set_scribe_member_cap(
  _practice_id uuid, _user_id uuid, _cap_minutes integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _old integer;
BEGIN
  IF _uid IS NULL OR _practice_id IS NULL OR _user_id IS NULL
     OR NOT (public.can_manage_practice(_practice_id)
             OR (EXISTS (SELECT 1 FROM public.practice_members m
                          WHERE m.practice_id = _practice_id AND m.user_id = _uid AND m.status = 'active')
                 AND public.has_practice_capability(_uid, 'manage_team', _practice_id))) THEN
    RAISE EXCEPTION 'Not available' USING ERRCODE = '42501';
  END IF;
  IF _cap_minutes IS NOT NULL AND (_cap_minutes < 0 OR _cap_minutes > 1000000) THEN
    RAISE EXCEPTION 'A cap is between 0 and 1,000,000 minutes' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practice_members m
                  WHERE m.practice_id = _practice_id AND m.user_id = _user_id AND m.status = 'active') THEN
    RAISE EXCEPTION 'That person is not an active member of this practice' USING ERRCODE = '22023';
  END IF;

  SELECT a.cap_minutes INTO _old FROM public.practice_scribe_allocations a
   WHERE a.practice_id = _practice_id AND a.user_id = _user_id;

  IF _cap_minutes IS NULL THEN
    DELETE FROM public.practice_scribe_allocations a
     WHERE a.practice_id = _practice_id AND a.user_id = _user_id;
  ELSE
    INSERT INTO public.practice_scribe_allocations (practice_id, user_id, cap_minutes, updated_by, updated_at)
    VALUES (_practice_id, _user_id, _cap_minutes, _uid, now())
    ON CONFLICT (practice_id, user_id)
    DO UPDATE SET cap_minutes = EXCLUDED.cap_minutes, updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;

  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_uid, 'practice_scribe_cap_set', 'practice', _practice_id::text,
          jsonb_build_object('practice_id', _practice_id, 'member_user_id', _user_id,
                             'cap_minutes', _cap_minutes, 'previous_cap_minutes', _old,
                             'informational', true));

  RETURN jsonb_build_object('practice_id', _practice_id, 'user_id', _user_id,
                            'cap_minutes', _cap_minutes);
END
$$;

-- ---------------------------------------------------------------------------
-- 8. request_partnership
-- ---------------------------------------------------------------------------
-- Owner/admin only. One open request per practice. Marks the practice
-- 'requested'; a platform decision (partner_requests.status) moves it on.
CREATE OR REPLACE FUNCTION public.request_partnership(
  _practice_id uuid, _contact text, _message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _status text;
  _c text := btrim(coalesce(_contact, ''));
  _m text := nullif(btrim(coalesce(_message, '')), '');
BEGIN
  IF _uid IS NULL OR _practice_id IS NULL OR NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Not available' USING ERRCODE = '42501';
  END IF;
  IF length(_c) < 3 OR length(_c) > 200 THEN
    RAISE EXCEPTION 'Add a way for us to reach you (3 to 200 characters)' USING ERRCODE = '22023';
  END IF;
  IF _m IS NOT NULL AND length(_m) > 2000 THEN
    RAISE EXCEPTION 'Keep the message under 2000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT p.partner_status INTO _status FROM public.practices p WHERE p.id = _practice_id FOR UPDATE;
  IF _status = 'active' THEN
    RAISE EXCEPTION 'This practice is already a partner' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_requests r
              WHERE r.practice_id = _practice_id AND r.status = 'open') THEN
    RAISE EXCEPTION 'A partnership request is already open' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.partner_requests (practice_id, requested_by, contact, message)
  VALUES (_practice_id, _uid, _c, _m)
  RETURNING id INTO _id;

  UPDATE public.practices SET partner_status = 'requested' WHERE id = _practice_id;

  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_uid, 'practice_partner_requested', 'practice', _practice_id::text,
          jsonb_build_object('practice_id', _practice_id, 'request_id', _id));

  RETURN _id;
END
$$;

-- ---------------------------------------------------------------------------
-- 9. apply_addon_change: the billing path (service role only)
-- ---------------------------------------------------------------------------
-- _addon: clinician_seat | staff_seat | scribe_pack. _qty is signed for seats
-- (a cancellation or reduction is negative) and positive for packs. Idempotent
-- on (_stripe_event_id, _addon): a repeat returns {status:'duplicate'} and
-- changes nothing. Expected conditions are returned as a status, not raised, so
-- the webhook can acknowledge the event and the outcome is on record:
--   applied | duplicate | rejected_in_use | rejected_seat_max | rejected_negative |
--   not_applicable | unknown_practice | invalid | unknown_addon
-- A reduction NEVER removes a member. It is rejected (not clamped, not deferred)
-- when it would leave more seats in use than the new limit, so the person who
-- manages the plan decides who to remove first and the billing side retries or
-- refunds. There is no server-side storage pack, so 'storage_pack' is
-- unknown_addon.
CREATE OR REPLACE FUNCTION public.apply_addon_change(
  _practice_id uuid,
  _addon text,
  _qty integer,
  _stripe_event_id text,
  _pack_minutes integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr public.practices;
  ts record;
  _prev public.addon_events;
  _status text;
  _detail jsonb := '{}'::jsonb;
  _newp integer;
  _newstored integer;
  _newlimit integer;
  _inuse integer;
  _model text;
BEGIN
  IF coalesce(current_setting('role', true), 'none') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'apply_addon_change is for the billing service only' USING ERRCODE = '42501';
  END IF;
  IF _practice_id IS NULL OR _stripe_event_id IS NULL OR btrim(_stripe_event_id) = ''
     OR length(_stripe_event_id) > 255 OR _addon IS NULL OR btrim(_addon) = '' OR length(_addon) > 40 THEN
    RAISE EXCEPTION 'practice, add-on and Stripe event id are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('addon_event:' || _stripe_event_id || ':' || _addon, 0));
  SELECT * INTO _prev FROM public.addon_events e
   WHERE e.stripe_event_id = _stripe_event_id AND e.addon = _addon;
  IF _prev.stripe_event_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'previous_status', _prev.status,
                              'practice_id', _prev.practice_id, 'addon', _addon);
  END IF;

  SELECT * INTO pr FROM public.practices p WHERE p.id = _practice_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('seat_cap:' || _practice_id::text, 0));

  IF pr.id IS NULL THEN
    _status := 'unknown_practice';
  ELSIF _qty IS NULL OR _qty = 0 OR abs(_qty) > 1000 THEN
    _status := 'invalid';
  ELSIF _addon IN ('clinician_seat', 'staff_seat') THEN
    SELECT * INTO ts FROM public._practice_tier_seats(_practice_id);
    _model := public._practice_staff_model(_practice_id);
    IF pr.tenant_type <> 'practice' OR ts.tier IS NULL OR _model <> 'staff_paid' THEN
      -- Hospitals have fixed seats; trial, Community and Individual plans have no
      -- add-on seats to buy.
      _status := 'not_applicable';
    ELSIF _addon = 'clinician_seat' THEN
      _newp := pr.clinician_seats_purchased + _qty;
      IF _newp < 0 THEN
        _status := 'rejected_negative';
      ELSIF _qty > 0 AND ts.seat_max IS NOT NULL AND ts.included + _newp > ts.seat_max THEN
        _status := 'rejected_seat_max';
        _detail := jsonb_build_object('seat_max', ts.seat_max);
      ELSE
        -- The stored limit moves with the purchase, so a grandfathered tenant
        -- (stored above the plan) gets the new seats on top of what it had.
        _newstored := CASE WHEN public._lim_norm(pr.member_limit) IS NULL THEN pr.member_limit
                           ELSE greatest(1, pr.member_limit + _qty) END;
        _newlimit := public._effective_clinician_limit(_newstored, ts.included, ts.seat_max, _newp);
        _inuse := public._practice_seats_in_use(_practice_id);
        IF _qty < 0 AND _newlimit IS NOT NULL AND _newlimit < _inuse THEN
          _status := 'rejected_in_use';
          _detail := jsonb_build_object('in_use', _inuse, 'would_be_limit', _newlimit);
        ELSE
          UPDATE public.practices
             SET clinician_seats_purchased = _newp,
                 member_limit = _newstored
           WHERE id = _practice_id;
          _status := 'applied';
          _detail := jsonb_build_object('clinician_seats_purchased', _newp, 'seat_limit', _newlimit);
        END IF;
      END IF;
    ELSE
      _newp := pr.staff_seats_purchased + _qty;
      IF _newp < 0 THEN
        _status := 'rejected_negative';
      ELSE
        _inuse := public._practice_seats_of_kind(_practice_id, 'staff', true);
        IF _qty < 0 AND _newp < _inuse THEN
          _status := 'rejected_in_use';
          _detail := jsonb_build_object('in_use', _inuse, 'would_be_limit', _newp);
        ELSE
          UPDATE public.practices SET staff_seats_purchased = _newp WHERE id = _practice_id;
          _status := 'applied';
          _detail := jsonb_build_object('staff_seats_purchased', _newp);
        END IF;
      END IF;
    END IF;
  ELSIF _addon = 'scribe_pack' THEN
    IF _qty < 0 OR _pack_minutes IS NULL OR _pack_minutes < 1 OR _pack_minutes > 100000 THEN
      _status := 'invalid';
    ELSE
      INSERT INTO public.scribe_packs (practice_id, minutes, stripe_ref)
      VALUES (_practice_id, _pack_minutes * _qty, _stripe_event_id);
      _status := 'applied';
      _detail := jsonb_build_object('minutes', _pack_minutes * _qty);
    END IF;
  ELSE
    _status := 'unknown_addon';
  END IF;

  INSERT INTO public.addon_events (stripe_event_id, addon, practice_id, qty, status, detail)
  VALUES (_stripe_event_id, _addon, _practice_id, _qty, _status, _detail);

  RETURN jsonb_build_object('status', _status, 'practice_id', _practice_id, 'addon', _addon,
                            'qty', _qty) || _detail;
END
$$;

-- ---------------------------------------------------------------------------
-- 10. Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._practice_tier_seats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._effective_clinician_limit(integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_practice_account_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_partner_decision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._practice_tier_seats(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._effective_clinician_limit(integer, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.practice_account_overview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_scribe_member_cap(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_partnership(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_account_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_scribe_member_cap(uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_partnership(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_addon_change(uuid, text, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_addon_change(uuid, text, integer, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.entitlements_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entitlements_for(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.practice_account_overview(uuid) IS
  'The Manage Account page in one document. Owner/admin: everything. manage_billing: figures only (no member list, slug or revenue share). Anyone else: Not available. Counts, minutes and first names only; no PHI.';
COMMENT ON FUNCTION public.apply_addon_change(uuid, text, integer, text, integer) IS
  'Service role only. Idempotent per (Stripe event, add-on). Reductions never remove a member: they are rejected when they would leave seats in use above the new limit.';
