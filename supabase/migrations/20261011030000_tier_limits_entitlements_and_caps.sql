-- Plan limits live in one table, and the published patient and seat caps are
-- enforced by the database (pricing-and-tier-gating plan, items 2, 3 and 4).
--
-- Until now the caps existed only as three divergent maps (the edge function,
-- the checkout function, the client) and a disabled button. A direct API call
-- or a scripted import went straight past all of them.
--
-- This migration does NOT change any published number. It writes down the ones
-- already on the pricing page:
--
--   tier        patients   seats  storage
--   trial              5       1  500 MB
--   community         25       1  500 MB
--   solo             150       1  10 GB
--   pro            1,000       5  100 GB      ("5 seats" on the pricing page;
--   enterprise  unlimited unlimited negotiated  the client map said 6, see below)
--
-- A price or allowance change later is an UPDATE of tier_limits (plus the
-- Stripe price), not a code change. NULL means unlimited.
--
-- Rules the triggers follow:
--   * Only NEW additions are refused. Reads, updates, revocations and every
--     existing connection are untouched, and an account already over its cap
--     keeps everything it has (grandfathered): the check runs when a connection
--     is created or re-activated, never on what already exists.
--   * A revoked, ended or deleted connection frees its slot at once.
--   * A person is counted once however many routes connect them (a share, a
--     managed record, a practice share are deduplicated by patient).
--   * The platform is trusted: the service role, a migration and a platform
--     admin are not refused. A signed-in user is, including through the
--     SECURITY DEFINER functions the app really uses, because those run with
--     the caller's auth.uid().
--   * The errors are named so the app can say something kind:
--       patient_limit_reached  SQLSTATE OC001
--       seat_limit_reached     SQLSTATE OC002

-- ---------------------------------------------------------------------------
-- 1. The one table of limits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tier_limits (
  tier                   text PRIMARY KEY,
  patient_limit          integer CHECK (patient_limit IS NULL OR patient_limit >= 0),
  seat_limit             integer CHECK (seat_limit IS NULL OR seat_limit >= 0),
  storage_mb             integer CHECK (storage_mb IS NULL OR storage_mb >= 0),
  scribe_included        boolean NOT NULL DEFAULT false,
  -- Informational only. No monthly figure is published, so none is set; the
  -- scribe is metered (scribe_usage), not capped.
  scribe_minutes_monthly integer CHECK (scribe_minutes_monthly IS NULL OR scribe_minutes_monthly >= 0),
  note                   text
);

ALTER TABLE public.tier_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plan limits are readable by signed-in users" ON public.tier_limits;
CREATE POLICY "Plan limits are readable by signed-in users"
  ON public.tier_limits FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.tier_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tier_limits TO authenticated;
GRANT ALL ON public.tier_limits TO service_role;

INSERT INTO public.tier_limits
  (tier, patient_limit, seat_limit, storage_mb, scribe_included, scribe_minutes_monthly, note)
VALUES
  ('trial',      5,    1,    500,    true,  NULL, '14-day trial'),
  ('community',  25,   1,    500,    false, NULL, 'Community'),
  ('solo',       150,  1,    10240,  true,  NULL, 'Individual (stored key: solo)'),
  ('pro',        1000, 5,    102400, true,  NULL, 'Practice (stored key: pro); 5 seats as published'),
  ('enterprise', NULL, NULL, NULL,   true,  NULL, 'Enterprise: unlimited patients and seats, storage negotiated'),
  ('expired',    0,    1,    500,    false, NULL, 'Trial ended with no plan: nothing new can be added')
ON CONFLICT (tier) DO UPDATE
  SET patient_limit = EXCLUDED.patient_limit,
      seat_limit = EXCLUDED.seat_limit,
      storage_mb = EXCLUDED.storage_mb,
      scribe_included = EXCLUDED.scribe_included,
      scribe_minutes_monthly = EXCLUDED.scribe_minutes_monthly,
      note = EXCLUDED.note;

-- ---------------------------------------------------------------------------
-- 2. Small helpers (internal: nobody but the platform calls these directly)
-- ---------------------------------------------------------------------------

-- The legacy "unlimited" sentinel (999999) and NULL both mean no cap.
CREATE OR REPLACE FUNCTION public._lim_norm(_n integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _n IS NULL OR _n >= 999999 THEN NULL ELSE _n END
$$;

-- The larger of two limits, where NULL (unlimited) is larger than any number.
CREATE OR REPLACE FUNCTION public._lim_max(_a integer, _b integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _a IS NULL OR _b IS NULL THEN NULL ELSE greatest(_a, _b) END
$$;

-- Platform-trusted writers: a request with no signed-in user that is not
-- running as a client role (service role, migration, cron), or a platform
-- admin. A signed-in user is never trusted, whichever function they came
-- through.
CREATE OR REPLACE FUNCTION public._is_trusted_writer()
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN coalesce(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated');
  END IF;
  RETURN public.has_role(auth.uid(), 'admin');
END
$$;

-- ---------------------------------------------------------------------------
-- 3. What a clinician's own plan allows
-- ---------------------------------------------------------------------------
-- The plan comes from the profile, whose commercial columns are pinned against
-- client writes (20261011000000). A trial that has run out with no
-- subscription is 'expired' and allows nothing new, which is what the
-- subscription check writes too. The stored patient_limit may only raise the
-- table figure (an admin-granted allowance), never lower it.
CREATE OR REPLACE FUNCTION public._clinician_limits(_uid uuid)
RETURNS TABLE (
  tier text,
  patient_limit integer,
  seat_limit integer,
  storage_mb integer,
  scribe_included boolean,
  scribe_minutes_monthly integer
)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  cp public.clinician_profiles;
  tl public.tier_limits;
  _tier text;
  _stored integer;
BEGIN
  SELECT * INTO cp FROM public.clinician_profiles WHERE user_id = _uid LIMIT 1;

  IF cp.id IS NULL THEN
    _tier := 'community';
  ELSIF cp.subscription_tier = 'trial'
        AND cp.trial_ends_at IS NOT NULL
        AND cp.trial_ends_at < now()
        AND cp.stripe_subscription_id IS NULL THEN
    _tier := 'expired';
  ELSIF EXISTS (SELECT 1 FROM public.tier_limits t WHERE t.tier = cp.subscription_tier) THEN
    _tier := cp.subscription_tier;
  ELSE
    _tier := 'community';
  END IF;

  SELECT * INTO tl FROM public.tier_limits t WHERE t.tier = _tier;

  tier := _tier;
  patient_limit := tl.patient_limit;
  IF _tier <> 'expired' AND cp.id IS NOT NULL AND cp.patient_limit IS NOT NULL
     AND tl.patient_limit IS NOT NULL THEN
    _stored := public._lim_norm(cp.patient_limit);
    patient_limit := public._lim_max(tl.patient_limit, _stored);
  END IF;
  seat_limit := tl.seat_limit;
  storage_mb := tl.storage_mb;
  scribe_included := tl.scribe_included;
  scribe_minutes_monthly := tl.scribe_minutes_monthly;
  RETURN NEXT;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. What a practice or hospital allows
-- ---------------------------------------------------------------------------
-- A hospital tenant is whatever an admin stored (patient_limit, member_limit).
-- A practice-type tenant is created with column defaults (25 patients, 5
-- members) whatever its owner pays for, so for those the stored figure may only
-- be raised by the owner's plan: the larger of the stored figure, the tenant's
-- own tier and each active owner's tier. Nobody is locked out by a default.
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
      _seat := CASE WHEN _seat IS NULL THEN NULL ELSE public._lim_max(_seat, tl.seat_limit) END;
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
      IF _seat IS NOT NULL THEN
        _seat := public._lim_max(_seat, ol.seat_limit);
      END IF;
    END LOOP;
  END IF;

  tier := _tier;
  patient_limit := _pat;
  seat_limit := _seat;
  storage_mb := _store;
  RETURN NEXT;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Counting: distinct active patients, and seats in use
-- ---------------------------------------------------------------------------
-- A clinician's own connections: live provider_shares naming them (claimed, or
-- not yet claimed but addressed to their email, which is how the app lists
-- them) plus the managed records they hold outside a practice. A person who is
-- both a share and a managed record is one key.
CREATE OR REPLACE FUNCTION public._personal_patient_keys(_uid uuid)
RETURNS TABLE (k text)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _uid;

  RETURN QUERY
    SELECT ps.user_id::text
      FROM public.provider_shares ps
     WHERE ps.is_active AND ps.revoked_at IS NULL
       AND (ps.clinician_user_id = _uid
            OR (ps.clinician_user_id IS NULL
                AND _email IS NOT NULL
                AND lower(ps.provider_email) = _email))
    UNION
    SELECT coalesce(r.linked_user_id::text, 'rec:' || r.id::text)
      FROM public.clinician_patient_records r
     WHERE r.clinician_user_id = _uid AND r.practice_id IS NULL;
END
$$;

CREATE OR REPLACE FUNCTION public._practice_patient_keys(_pid uuid)
RETURNS TABLE (k text)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT s.user_id::text
    FROM public.practice_shares s
   WHERE s.practice_id = _pid AND s.is_active AND s.revoked_at IS NULL
  UNION
  SELECT coalesce(r.linked_user_id::text, 'rec:' || r.id::text)
    FROM public.clinician_patient_records r
   WHERE r.practice_id = _pid
$$;

CREATE OR REPLACE FUNCTION public._personal_patient_count(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(*)::integer FROM public._personal_patient_keys(_uid)
$$;

CREATE OR REPLACE FUNCTION public._practice_patient_count(_pid uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(*)::integer FROM public._practice_patient_keys(_pid)
$$;

-- Seats in use: active members plus invitations still waiting to be accepted.
CREATE OR REPLACE FUNCTION public._practice_seats_in_use(_pid uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (SELECT count(*) FROM public.practice_members m
           WHERE m.practice_id = _pid AND m.status = 'active')::integer
       + (SELECT count(*) FROM public.practice_invitations i
           WHERE i.practice_id = _pid AND i.status = 'pending' AND i.expires_at > now())::integer
$$;

-- The patient allowance that applies to one clinician's own connections: the
-- larger of their own plan and the plan of any practice they are an active
-- member of (a seat in a practice rides on the practice's plan).
CREATE OR REPLACE FUNCTION public._personal_patient_limit(_uid uuid)
RETURNS integer
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  _best integer;
  r record;
  _pl integer;
BEGIN
  SELECT cl.patient_limit INTO _best FROM public._clinician_limits(_uid) cl;
  FOR r IN
    SELECT pm.practice_id FROM public.practice_members pm
     WHERE pm.user_id = _uid AND pm.status = 'active'
  LOOP
    SELECT pl.patient_limit INTO _pl FROM public._practice_limits(r.practice_id) pl;
    _best := public._lim_max(_best, _pl);
  END LOOP;
  RETURN _best;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. entitlements_for: what a user's plan allows and how much is used
-- ---------------------------------------------------------------------------
-- A user may ask about themselves; the service role and a platform admin may
-- ask about anyone. It reads counts only, never another person's records.
-- NULL limits mean unlimited. The scribe figures are informational: the scribe
-- is metered, not enforced.
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
  over_seat_limit boolean
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
  _pid uuid;
  _pplim integer;
  _tier text;
  _plim integer;
  _pcount integer;
  _slim integer;
  _scount integer;
  _store integer;
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
    SELECT pm.practice_id AS id FROM public.practice_members pm
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
  END LOOP;

  _plim := public._personal_patient_limit(_uid);
  _pcount := public._personal_patient_count(_uid);

  IF _pid IS NOT NULL THEN
    SELECT * INTO win FROM public._practice_limits(_pid);
    _pplim := win.patient_limit;
    _slim := win.seat_limit;
    _scount := public._practice_seats_in_use(_pid);
  ELSE
    _scount := 1;
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
    (_slim IS NOT NULL AND _scount > _slim);
END
$$;

-- ---------------------------------------------------------------------------
-- 7. The caps
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._refuse_patient_cap(_scope text, _limit integer, _count integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'patient_limit_reached'
    USING ERRCODE = 'OC001',
          DETAIL = format('scope=%s; limit=%s; active=%s', _scope, _limit, _count),
          HINT = 'Existing patients and records are unaffected. Only new connections are paused until a slot is free or the plan is raised.';
END
$$;

-- Refuse when this patient would be a NEW one for the clinician and every slot
-- is taken. A patient already counted (another share, a managed record) takes
-- no extra slot, so reconnecting or adding a second route is always allowed.
CREATE OR REPLACE FUNCTION public._check_personal_patient_cap(_uid uuid, _key text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('patient_cap:' || _uid::text, 0));
  IF EXISTS (SELECT 1 FROM public._personal_patient_keys(_uid) pk WHERE pk.k = _key) THEN
    RETURN;
  END IF;
  _limit := public._personal_patient_limit(_uid);
  IF _limit IS NULL THEN
    RETURN;
  END IF;
  _count := public._personal_patient_count(_uid);
  IF _count >= _limit THEN
    PERFORM public._refuse_patient_cap('clinician', _limit, _count);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public._check_practice_patient_cap(_pid uuid, _key text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('patient_cap:' || _pid::text, 0));
  IF EXISTS (SELECT 1 FROM public._practice_patient_keys(_pid) pk WHERE pk.k = _key) THEN
    RETURN;
  END IF;
  SELECT pl.patient_limit INTO _limit FROM public._practice_limits(_pid) pl;
  IF _limit IS NULL THEN
    RETURN;
  END IF;
  _count := public._practice_patient_count(_pid);
  IF _count >= _limit THEN
    PERFORM public._refuse_patient_cap('practice', _limit, _count);
  END IF;
END
$$;

-- provider_shares: a connection becomes live when it is inserted live, is
-- re-activated, or is claimed by a clinician. Unclaimed shares (addressed to an
-- email, no account yet) are not refused here, so a patient can never learn
-- whether a clinician exists; they are counted, and refused at the claim.
CREATE OR REPLACE FUNCTION public.enforce_patient_cap_on_provider_share()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinician_user_id IS NULL
     OR NEW.is_active IS NOT TRUE
     OR NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.is_active IS TRUE AND OLD.revoked_at IS NULL
     AND OLD.clinician_user_id IS NOT DISTINCT FROM NEW.clinician_user_id THEN
    RETURN NEW;
  END IF;
  IF public._is_trusted_writer() THEN
    RETURN NEW;
  END IF;
  PERFORM public._check_personal_patient_cap(NEW.clinician_user_id, NEW.user_id::text);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_patient_cap_provider_share ON public.provider_shares;
CREATE TRIGGER trg_enforce_patient_cap_provider_share
  BEFORE INSERT OR UPDATE OF is_active, revoked_at, clinician_user_id ON public.provider_shares
  FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_cap_on_provider_share();

CREATE OR REPLACE FUNCTION public.enforce_patient_cap_on_practice_share()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS NOT TRUE OR NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.is_active IS TRUE AND OLD.revoked_at IS NULL
     AND OLD.practice_id IS NOT DISTINCT FROM NEW.practice_id THEN
    RETURN NEW;
  END IF;
  IF public._is_trusted_writer() THEN
    RETURN NEW;
  END IF;
  PERFORM public._check_practice_patient_cap(NEW.practice_id, NEW.user_id::text);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_patient_cap_practice_share ON public.practice_shares;
CREATE TRIGGER trg_enforce_patient_cap_practice_share
  BEFORE INSERT OR UPDATE OF is_active, revoked_at, practice_id ON public.practice_shares
  FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_cap_on_practice_share();

-- Managed records: counted against the practice when the record belongs to one,
-- otherwise against the clinician. Only INSERT adds a person.
CREATE OR REPLACE FUNCTION public.enforce_patient_cap_on_managed_record()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text := coalesce(NEW.linked_user_id::text, 'rec:' || NEW.id::text);
BEGIN
  IF public._is_trusted_writer() THEN
    RETURN NEW;
  END IF;
  IF NEW.practice_id IS NOT NULL THEN
    PERFORM public._check_practice_patient_cap(NEW.practice_id, _key);
  ELSIF NEW.clinician_user_id IS NOT NULL THEN
    PERFORM public._check_personal_patient_cap(NEW.clinician_user_id, _key);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_patient_cap_managed_record ON public.clinician_patient_records;
CREATE TRIGGER trg_enforce_patient_cap_managed_record
  BEFORE INSERT ON public.clinician_patient_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_cap_on_managed_record();

-- A lookup for the unclaimed-share count (the expression the helper filters on).
CREATE INDEX IF NOT EXISTS idx_provider_shares_provider_email_lower
  ON public.provider_shares (lower(provider_email))
  WHERE provider_email IS NOT NULL AND clinician_user_id IS NULL;

-- ---------------------------------------------------------------------------
-- 8. The seat cap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._refuse_seat_cap(_limit integer, _used integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'seat_limit_reached'
    USING ERRCODE = 'OC002',
          DETAIL = format('limit=%s; in_use=%s', _limit, _used),
          HINT = 'Existing members are unaffected. A new member can be added when a seat is free or the plan is raised.';
END
$$;

-- A member takes a seat when a row is inserted active or an ended one is made
-- active again (accept_practice_invitation upserts, so the re-add arrives as
-- either). An already-active person re-saved is not a new seat. Pending
-- invitations hold a seat for the invitation, not again on acceptance.
CREATE OR REPLACE FUNCTION public.enforce_seat_cap_on_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _active integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM public.practice_members m
        WHERE m.practice_id = NEW.practice_id AND m.user_id = NEW.user_id AND m.status = 'active') THEN
    RETURN NEW;
  END IF;
  IF public._is_trusted_writer() THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('seat_cap:' || NEW.practice_id::text, 0));
  SELECT pl.seat_limit INTO _limit FROM public._practice_limits(NEW.practice_id) pl;
  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*)::integer INTO _active
    FROM public.practice_members m
   WHERE m.practice_id = NEW.practice_id AND m.status = 'active';
  IF _active >= _limit THEN
    PERFORM public._refuse_seat_cap(_limit, _active);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_seat_cap_member ON public.practice_members;
CREATE TRIGGER trg_enforce_seat_cap_member
  BEFORE INSERT OR UPDATE OF status ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_cap_on_member();

CREATE OR REPLACE FUNCTION public.enforce_seat_cap_on_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _used integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND OLD.expires_at > now() THEN
    RETURN NEW;
  END IF;
  IF public._is_trusted_writer() THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('seat_cap:' || NEW.practice_id::text, 0));
  SELECT pl.seat_limit INTO _limit FROM public._practice_limits(NEW.practice_id) pl;
  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;
  _used := public._practice_seats_in_use(NEW.practice_id);
  IF _used >= _limit THEN
    PERFORM public._refuse_seat_cap(_limit, _used);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_seat_cap_invitation ON public.practice_invitations;
CREATE TRIGGER trg_enforce_seat_cap_invitation
  BEFORE INSERT OR UPDATE OF status, expires_at ON public.practice_invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_cap_on_invitation();

-- Backfill: no existing tenant is put over its own seat cap by this change.
-- Where a tenant already has more members and open invitations than its stored
-- limit, the limit is raised to what it has. They keep every seat; only new
-- additions beyond that are refused. A NULL limit stays unlimited.
UPDATE public.practices p
   SET member_limit = public._practice_seats_in_use(p.id)
 WHERE p.member_limit IS NOT NULL
   AND p.member_limit < 999999
   AND p.member_limit < public._practice_seats_in_use(p.id);

-- ---------------------------------------------------------------------------
-- 9. Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._lim_norm(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._lim_max(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._is_trusted_writer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clinician_limits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._practice_limits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._personal_patient_keys(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._practice_patient_keys(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._personal_patient_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._practice_patient_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._practice_seats_in_use(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._personal_patient_limit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._refuse_patient_cap(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._check_personal_patient_cap(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._check_practice_patient_cap(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._refuse_seat_cap(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_patient_cap_on_provider_share() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_patient_cap_on_practice_share() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_patient_cap_on_managed_record() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_seat_cap_on_member() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_seat_cap_on_invitation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._lim_norm(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public._lim_max(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public._clinician_limits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._practice_limits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._personal_patient_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._practice_patient_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._practice_seats_in_use(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._personal_patient_limit(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.entitlements_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entitlements_for(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.tier_limits IS
  'The single table of plan limits (NULL = unlimited). Change a published allowance by updating a row here; entitlements_for, the patient and seat caps and the edge functions all read it.';
COMMENT ON FUNCTION public.entitlements_for(uuid) IS
  'A user''s plan, limits and usage. Self or service role or admin only; counts only, never another person''s records. Scribe figures are informational, not enforced.';
