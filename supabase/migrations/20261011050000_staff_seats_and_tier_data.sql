-- Paid non-clinical staff seats, and the tier_limits data matched to the decided
-- pricing (step 2A; the account RPCs that buy and release seats are step 2B).
--
-- What changes
--   * A seat is now one of two kinds, decided per member (not per tenant):
--       clinical  practice_member_is_clinical(...) - owner/admin outside a
--                 hospital, a hospital owner/admin WITH a clinical seat, and
--                 sub_admin / provider / clinician / nurse.
--       staff     every role that is not clinical by role: front_desk, billing,
--                 read_only, staff (practice_role_is_clinical is an allowlist, so
--                 a role added later is staff until somebody decides).
--     A hospital owner/admin without a clinical seat is ops-only. They hold
--     neither kind of seat and never count against either cap.
--   * The clinician cap keeps its meaning and its error: practices.member_limit
--     (floored by tier_limits.seat_limit), seat_limit_reached, SQLSTATE OC002.
--   * Staff are governed by tier_limits.staff_seat_model:
--       shared      the legacy rule. Staff take a seat from the same cap as
--                   clinicians (trial, community, Individual/solo, expired). So
--                   Individual still has no room for staff, exactly as before.
--       staff_paid  Practice (pro) and Clinic. Clinicians count against the
--                   clinician cap only. Every staff member needs a purchased seat:
--                   active staff + pending staff invitations must stay below
--                   practices.staff_seats_purchased, else staff_seat_limit_reached,
--                   SQLSTATE OC003. None are included.
--       unlimited   Enterprise and every hospital tenant: no staff cap.
--     The model is read from the tenant's effective tier (the same tier
--     _practice_limits reports); a hospital is always unlimited.
--   * practices.staff_seats_purchased is the paid-staff counter. It is pinned:
--     a signed-in client cannot write it (only the service role, a platform admin
--     or a SECURITY DEFINER function, which step 2B will be, can).
--   * Only NEW additions are refused (the idiom of 20261011030000): an insert, a
--     re-activation, a role change into a seat kind the member did not hold, and
--     a new pending invitation. Existing members are untouched, ending a
--     membership frees its seat, an over-cap tenant is grandfathered, and the
--     platform stays trusted.
--   * The backfill sets staff_seats_purchased to the staff each practice-type
--     tenant already has, and raises member_limit to the clinicians it already
--     has where that exceeds the limit, so nobody is put over a cap by this.
--   * tier_limits is re-seeded with the decided numbers, and entitlements_for
--     reports the new figures.
--
-- Errors: patient_limit_reached OC001, seat_limit_reached OC002,
-- staff_seat_limit_reached OC003 (new), clinical_seat_not_applicable OC004.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.tier_limits
  ADD COLUMN IF NOT EXISTS seat_max integer
    CHECK (seat_max IS NULL OR seat_max >= 0),
  ADD COLUMN IF NOT EXISTS storage_mb_per_extra_clinician integer
    CHECK (storage_mb_per_extra_clinician IS NULL OR storage_mb_per_extra_clinician >= 0),
  ADD COLUMN IF NOT EXISTS staff_seat_model text NOT NULL DEFAULT 'shared'
    CHECK (staff_seat_model IN ('shared', 'staff_paid', 'unlimited'));

COMMENT ON COLUMN public.tier_limits.seat_max IS
  'Informational: the most clinician seats the plan can be bought up to (Clinic: 30). NULL = not published. seat_limit is what the plan includes and what the cap enforces with practices.member_limit.';
COMMENT ON COLUMN public.tier_limits.storage_mb_per_extra_clinician IS
  'Informational: storage added per clinician bought beyond the included ones (Practice and Clinic: 10 GB). storage_mb is the base.';
COMMENT ON COLUMN public.tier_limits.staff_seat_model IS
  'How non-clinical staff are seated: shared (they use the clinician cap), staff_paid (each needs a purchased seat, practices.staff_seats_purchased, none included) or unlimited.';

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS staff_seats_purchased integer NOT NULL DEFAULT 0
    CHECK (staff_seats_purchased >= 0);

COMMENT ON COLUMN public.practices.staff_seats_purchased IS
  'Paid non-clinical staff seats (front_desk, billing, read_only, staff) for a staff_paid tenant. Pinned: not writable by a signed-in client, only by the service role, a platform admin or a SECURITY DEFINER function.';

-- ---------------------------------------------------------------------------
-- 2. The decided numbers
-- ---------------------------------------------------------------------------
--   tier        patients  clinicians  storage    scribe min  staff
--   trial              5           1  500 MB     (trial)     shared
--   community         25           1  500 MB     none        shared
--   solo (Indiv.)    150           1  10 GB      none        shared (no staff)
--   pro (Practice) 1,000           3  30 GB      900         $15 each, none included
--   clinic         3,500          10  100 GB     3,000       $15 each, none included
--   enterprise     5,000          25  1 TB       15,000      unlimited
-- Add-on clinician seats and 10 GB per added clinician are bought in step 2B
-- (member_limit is raised then); seat_max and storage_mb_per_extra_clinician
-- record the published ceiling and increment.
INSERT INTO public.tier_limits
  (tier, patient_limit, seat_limit, storage_mb, scribe_included, scribe_minutes_monthly,
   seat_max, storage_mb_per_extra_clinician, staff_seat_model, note)
VALUES
  ('trial',      5,    1,  500,     true,  NULL,  NULL, NULL,  'shared',     '14-day trial'),
  ('community',  25,   1,  500,     false, 0,     NULL, NULL,  'shared',     'Community: no scribe'),
  ('solo',       150,  1,  10240,   false, 0,     NULL, NULL,  'shared',     'Individual (stored key: solo): 1 clinician, no staff, no scribe'),
  ('pro',        1000, 3,  30720,   true,  900,   NULL, 10240, 'staff_paid', 'Practice (stored key: pro): 3 clinicians included, add-on seats, staff paid per seat'),
  ('clinic',     3500, 10, 102400,  true,  3000,  30,   10240, 'staff_paid', 'Clinic: 10 clinicians included, add-on seats up to 30, staff paid per seat'),
  ('enterprise', 5000, 25, 1048576, true,  15000, NULL, NULL,  'unlimited',  'Enterprise (hospital): 25 clinicians, unlimited staff, storage 1 TB base'),
  ('expired',    0,    1,  500,     false, 0,     NULL, NULL,  'shared',     'Trial ended with no plan: nothing new can be added')
ON CONFLICT (tier) DO UPDATE
  SET patient_limit = EXCLUDED.patient_limit,
      seat_limit = EXCLUDED.seat_limit,
      storage_mb = EXCLUDED.storage_mb,
      scribe_included = EXCLUDED.scribe_included,
      scribe_minutes_monthly = EXCLUDED.scribe_minutes_monthly,
      seat_max = EXCLUDED.seat_max,
      storage_mb_per_extra_clinician = EXCLUDED.storage_mb_per_extra_clinician,
      staff_seat_model = EXCLUDED.staff_seat_model,
      note = EXCLUDED.note;

-- ---------------------------------------------------------------------------
-- 3. Seat kinds and counting (internal helpers)
-- ---------------------------------------------------------------------------
-- 'clinical', 'staff' or 'ops' (a hospital owner/admin without a clinical seat).
CREATE OR REPLACE FUNCTION public._member_seat_kind(
  _practice_id uuid, _role public.practice_role, _clinical_seat boolean)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.practice_role_is_clinical(_role) THEN 'staff'
    WHEN public.practice_member_is_clinical(_practice_id, _role, _clinical_seat) THEN 'clinical'
    ELSE 'ops'
  END
$$;

-- Active members of one kind, plus (optionally) invitations still waiting. An
-- invitation carries no clinical seat, so an owner/admin invited into a hospital
-- is ops-only until a seat is taken (the same rule set_member_clinical_seat uses).
CREATE OR REPLACE FUNCTION public._practice_seats_of_kind(
  _pid uuid, _kind text, _include_pending boolean DEFAULT true)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (SELECT count(*) FROM public.practice_members m
           WHERE m.practice_id = _pid AND m.status = 'active'
             AND public._member_seat_kind(m.practice_id, m.role, m.clinical_seat) = _kind)::integer
       + CASE WHEN _include_pending THEN
           (SELECT count(*) FROM public.practice_invitations i
             WHERE i.practice_id = _pid AND i.status = 'pending' AND i.expires_at > now()
               AND public._member_seat_kind(i.practice_id, i.role, false) = _kind)::integer
         ELSE 0 END
$$;

-- How this tenant seats staff. A hospital is always unlimited; a practice-type
-- tenant follows its effective tier; anything unknown is the legacy shared rule.
CREATE OR REPLACE FUNCTION public._practice_staff_model(_pid uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.tenant_type = 'hospital' THEN 'unlimited'
    ELSE coalesce(
      (SELECT t.staff_seat_model FROM public.tier_limits t
        WHERE t.tier = (SELECT pl.tier FROM public._practice_limits(_pid) pl)),
      'shared')
  END
  FROM public.practices p
  WHERE p.id = _pid
$$;

-- Seats in use against the clinician cap (seat_count in entitlements_for). Under
-- the legacy shared rule that is everyone (members and open invitations, as
-- before); otherwise it is clinicians only.
CREATE OR REPLACE FUNCTION public._practice_seats_in_use(_pid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public._practice_staff_model(_pid) = 'shared' THEN
      (SELECT count(*) FROM public.practice_members m
        WHERE m.practice_id = _pid AND m.status = 'active')::integer
      + (SELECT count(*) FROM public.practice_invitations i
          WHERE i.practice_id = _pid AND i.status = 'pending' AND i.expires_at > now())::integer
    ELSE public._practice_seats_of_kind(_pid, 'clinical', true)
  END
$$;

CREATE OR REPLACE FUNCTION public._refuse_staff_seat_cap(_purchased integer, _used integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'staff_seat_limit_reached'
    USING ERRCODE = 'OC003',
          DETAIL = format('purchased=%s; in_use=%s', _purchased, _used),
          HINT = 'Existing staff are unaffected. A new staff member can be added when a paid staff seat is free.';
END
$$;

-- ---------------------------------------------------------------------------
-- 4. The pin on staff_seats_purchased
-- ---------------------------------------------------------------------------
-- Not SECURITY DEFINER, so current_user is the caller: a signed-in client
-- (authenticated/anon) is refused unless it is a platform admin. The service
-- role, a migration and SECURITY DEFINER functions run as other roles and pass.
CREATE OR REPLACE FUNCTION public.guard_staff_seats_purchased()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin')) THEN
    IF TG_OP = 'INSERT' AND NEW.staff_seats_purchased IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'staff_seats_purchased is set by billing, not by a client'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE'
          AND NEW.staff_seats_purchased IS DISTINCT FROM OLD.staff_seats_purchased THEN
      RAISE EXCEPTION 'staff_seats_purchased is set by billing, not by a client'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_staff_seats_purchased ON public.practices;
CREATE TRIGGER trg_guard_staff_seats_purchased
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_seats_purchased();

-- ---------------------------------------------------------------------------
-- 5. The caps, by seat kind
-- ---------------------------------------------------------------------------
-- practice_members: runs after trg_a_normalise_member_clinical_seat, so
-- NEW.clinical_seat is already honest. A seat is new when the row is inserted
-- active, an ended row is made active again, or an active member's role moves
-- into a seat kind they did not hold. Under the shared rule a role change was
-- never a new seat and still is not.
CREATE OR REPLACE FUNCTION public.enforce_seat_cap_on_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _model text;
  _kind text;
  _limit integer;
  _used integer;
  _bought integer;
  _pending boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'active'
     AND OLD.role IS NOT DISTINCT FROM NEW.role THEN
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
  _model := public._practice_staff_model(NEW.practice_id);
  _kind := public._member_seat_kind(NEW.practice_id, NEW.role, NEW.clinical_seat);

  -- A new member or a returning one arrives into the seat an invitation may be
  -- holding for them, so only active members are counted. A role change on an
  -- active member holds no invitation, so open invitations count too.
  _pending := (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'active');
  IF _pending THEN
    IF _model = 'shared'
       OR _kind = public._member_seat_kind(OLD.practice_id, OLD.role, OLD.clinical_seat) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF _model = 'shared' THEN
    SELECT pl.seat_limit INTO _limit FROM public._practice_limits(NEW.practice_id) pl;
    IF _limit IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT count(*)::integer INTO _used
      FROM public.practice_members m
     WHERE m.practice_id = NEW.practice_id AND m.status = 'active';
    IF _used >= _limit THEN
      PERFORM public._refuse_seat_cap(_limit, _used);
    END IF;
  ELSIF _kind = 'clinical' THEN
    SELECT pl.seat_limit INTO _limit FROM public._practice_limits(NEW.practice_id) pl;
    IF _limit IS NULL THEN
      RETURN NEW;
    END IF;
    _used := public._practice_seats_of_kind(NEW.practice_id, 'clinical', _pending);
    IF _used >= _limit THEN
      PERFORM public._refuse_seat_cap(_limit, _used);
    END IF;
  ELSIF _kind = 'staff' AND _model = 'staff_paid' THEN
    SELECT p.staff_seats_purchased INTO _bought FROM public.practices p WHERE p.id = NEW.practice_id;
    _used := public._practice_seats_of_kind(NEW.practice_id, 'staff', _pending);
    IF _used >= coalesce(_bought, 0) THEN
      PERFORM public._refuse_staff_seat_cap(coalesce(_bought, 0), _used);
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_seat_cap_member ON public.practice_members;
CREATE TRIGGER trg_enforce_seat_cap_member
  BEFORE INSERT OR UPDATE OF status, role ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_cap_on_member();

-- practice_invitations: an invitation holds a seat of its kind while it waits.
-- Acceptance does not take a second one (the member trigger counts active
-- members only), so the held seat is the invitee's.
CREATE OR REPLACE FUNCTION public.enforce_seat_cap_on_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _model text;
  _kind text;
  _limit integer;
  _used integer;
  _bought integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;
  IF public._is_trusted_writer() THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('seat_cap:' || NEW.practice_id::text, 0));
  _model := public._practice_staff_model(NEW.practice_id);
  _kind := public._member_seat_kind(NEW.practice_id, NEW.role, false);

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND OLD.expires_at > now() THEN
    IF _model = 'shared'
       OR _kind = public._member_seat_kind(OLD.practice_id, OLD.role, false) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF _model = 'shared' THEN
    SELECT pl.seat_limit INTO _limit FROM public._practice_limits(NEW.practice_id) pl;
    IF _limit IS NULL THEN
      RETURN NEW;
    END IF;
    _used := public._practice_seats_in_use(NEW.practice_id);
    IF _used >= _limit THEN
      PERFORM public._refuse_seat_cap(_limit, _used);
    END IF;
  ELSIF _kind = 'clinical' THEN
    SELECT pl.seat_limit INTO _limit FROM public._practice_limits(NEW.practice_id) pl;
    IF _limit IS NULL THEN
      RETURN NEW;
    END IF;
    _used := public._practice_seats_of_kind(NEW.practice_id, 'clinical', true);
    IF _used >= _limit THEN
      PERFORM public._refuse_seat_cap(_limit, _used);
    END IF;
  ELSIF _kind = 'staff' AND _model = 'staff_paid' THEN
    SELECT p.staff_seats_purchased INTO _bought FROM public.practices p WHERE p.id = NEW.practice_id;
    _used := public._practice_seats_of_kind(NEW.practice_id, 'staff', true);
    IF _used >= coalesce(_bought, 0) THEN
      PERFORM public._refuse_staff_seat_cap(coalesce(_bought, 0), _used);
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_seat_cap_invitation ON public.practice_invitations;
CREATE TRIGGER trg_enforce_seat_cap_invitation
  BEFORE INSERT OR UPDATE OF status, expires_at, role ON public.practice_invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_cap_on_invitation();

-- ---------------------------------------------------------------------------
-- 6. Backfill: nobody is put over a cap by this change
-- ---------------------------------------------------------------------------
-- Paid staff seats start at the staff a practice-type tenant already has (active
-- plus pending), so they keep every person and only NEW staff need a purchase.
-- New tenants start at 0. A hospital is unlimited and needs no figure.
UPDATE public.practices p
   SET staff_seats_purchased = public._practice_seats_of_kind(p.id, 'staff', true)
 WHERE p.tenant_type = 'practice'
   AND p.staff_seats_purchased < public._practice_seats_of_kind(p.id, 'staff', true);

-- Where a tenant already has more clinicians (and open clinical invitations, and
-- under the shared rule everyone) than its limit allows, raise the stored limit
-- to what it has. A NULL or 999999 limit stays unlimited.
UPDATE public.practices p
   SET member_limit = public._practice_seats_in_use(p.id)
 WHERE p.member_limit IS NOT NULL
   AND p.member_limit < 999999
   AND p.member_limit < public._practice_seats_in_use(p.id);

-- ---------------------------------------------------------------------------
-- 7. entitlements_for: staff-seat and clinician-seat figures, scribe pool
-- ---------------------------------------------------------------------------
-- The return shape grows, so the function is dropped and recreated. New columns
-- are appended, and the old ones keep their meaning:
--   clinician_seat_limit / clinician_seat_count   the clinician cap and use
--                      (same figures as seat_limit, but seat_count is now
--                      clinicians only for staff_paid and unlimited tenants)
--   staff_seat_model   shared | staff_paid | unlimited
--   staff_seats_purchased, staff_in_use   paid staff seats and active + pending
--                      staff of the person's practice (0 and 0 with no practice)
--   scribe_minutes_included   pooled minutes per month the plan includes, 0 where
--                      there is no scribe, NULL where none is published. Not
--                      enforced: the scribe stays metered, not capped.
DROP FUNCTION IF EXISTS public.entitlements_for(uuid);

CREATE FUNCTION public.entitlements_for(_user uuid DEFAULT NULL)
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
  _pid uuid;
  _pplim integer;
  _tier text;
  _plim integer;
  _pcount integer;
  _slim integer;
  _scount integer;
  _store integer;
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
-- 8. Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._member_seat_kind(uuid, public.practice_role, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._practice_seats_of_kind(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._practice_staff_model(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._refuse_staff_seat_cap(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_staff_seats_purchased() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_seat_cap_on_member() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_seat_cap_on_invitation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._practice_seats_of_kind(uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._practice_staff_model(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.entitlements_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entitlements_for(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.entitlements_for(uuid) IS
  'A user''s plan, limits and usage, including clinician and paid-staff seats. Self or service role or admin only; counts only, never another person''s records. Scribe figures are informational, not enforced.';
