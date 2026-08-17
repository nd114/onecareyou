-- Commercial fields are not the account holder's to write.
--
-- Found by red-teaming the row policies. RLS is row-level: "users can update
-- their own profile" grants the whole row, every column, including ones that
-- decide what the user is entitled to and what we invoice.
--
-- Two confirmed exploits, both a single API call from a normal signed-in
-- session with no special tooling:
--
--   1. Any patient could set profiles.subscription_tier = 'premium' and take
--      the paid plan for free. Feature gates, storage allowances and the
--      hospital revenue-share count all read that column, so it also inflates
--      what a hospital appears to be owed.
--
--   2. Any hospital owner/admin could rewrite their own commercial terms —
--      practices.revenue_share_pct to 100, storage_limit_gb and patient_limit
--      to anything, and their own subscription tier and status.
--
-- Postgres has no column-level RLS, and column GRANTs would break every time a
-- new column is added, so this is enforced with BEFORE UPDATE triggers that
-- pin the protected columns to their existing values unless the caller is
-- trusted. Trusted means the service role (Stripe webhooks, cron, admin
-- tooling running server-side, where auth.uid() is null) or a platform admin.
--
-- Everything else about the row stays editable exactly as before, so no
-- legitimate flow changes.

CREATE OR REPLACE FUNCTION public.guard_profile_commercial_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No auth.uid() means a server-side caller (service role / cron / migration).
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Entitlement follows payment, which is settled by Stripe server-side.
  NEW.subscription_tier := OLD.subscription_tier;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_profile_commercial_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_profile_commercial ON public.profiles;
CREATE TRIGGER trg_guard_profile_commercial
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_commercial_columns();

CREATE OR REPLACE FUNCTION public.guard_practice_commercial_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- A tenant admin runs their hospital. They do not set what the hospital pays,
  -- what it is owed, or how much of the platform it may consume — those are
  -- contract terms, changed by OneCare through the admin console.
  NEW.subscription_tier   := OLD.subscription_tier;
  NEW.subscription_status := OLD.subscription_status;
  NEW.subscription_ends_at := OLD.subscription_ends_at;
  NEW.revenue_share_pct   := OLD.revenue_share_pct;
  NEW.storage_limit_gb    := OLD.storage_limit_gb;
  NEW.patient_limit       := OLD.patient_limit;
  NEW.member_limit        := OLD.member_limit;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_practice_commercial_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_practice_commercial ON public.practices;
CREATE TRIGGER trg_guard_practice_commercial
BEFORE UPDATE ON public.practices
FOR EACH ROW EXECUTE FUNCTION public.guard_practice_commercial_columns();

COMMENT ON FUNCTION public.guard_profile_commercial_columns() IS
  'Pins profiles.subscription_tier against client writes. RLS grants the whole row, so without '
  'this any patient could grant themselves the paid plan.';

COMMENT ON FUNCTION public.guard_practice_commercial_columns() IS
  'Pins a tenant''s commercial terms (tier, status, revenue share, storage and seat limits) '
  'against client writes. A hospital admin manages their hospital, not their contract.';
