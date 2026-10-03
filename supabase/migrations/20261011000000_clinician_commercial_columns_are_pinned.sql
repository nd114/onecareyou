-- A clinician's commercial columns are not the clinician's to write.
--
-- "Users can update their own clinician profile" (20260117063816) is row-level,
-- so it grants every column of the row, including subscription_tier,
-- subscription_status, subscription_ends_at, trial_ends_at, patient_limit and
-- the stripe_* ids. One PATCH from a signed-in clinician could set themselves
-- to enterprise with patient_limit 999999, or push trial_ends_at out forever.
-- The practices and profiles tables were closed in August; this is the same
-- guard for clinician_profiles (pricing-and-tier-gating plan, gap 1).
--
-- Same behaviour as guard_practice_commercial_fields: the commercial columns
-- are silently pinned (UPDATE keeps OLD; INSERT takes the column defaults) and
-- every other column stays editable, so the sign-up insert, which names no
-- commercial columns, and profile edits work exactly as before.
--
-- Deliberately SECURITY INVOKER: current_user is how it tells a direct client
-- write ('authenticated' / 'anon') from one made by the service role (Stripe
-- webhook, check-clinician-subscription, create-clinician-checkout, seeding),
-- a migration, or a SECURITY DEFINER function, which all run as another role.
-- A client cannot become any of those. A platform admin is trusted too.

CREATE OR REPLACE FUNCTION public.guard_clinician_commercial_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.subscription_tier := 'trial';
    NEW.subscription_status := 'active';
    NEW.subscription_ends_at := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.patient_limit := 5;
    NEW.trial_ends_at := now() + interval '14 days';
  ELSE
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_status := OLD.subscription_status;
    NEW.subscription_ends_at := OLD.subscription_ends_at;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.patient_limit := OLD.patient_limit;
    NEW.trial_ends_at := OLD.trial_ends_at;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.guard_clinician_commercial_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_clinician_commercial ON public.clinician_profiles;
CREATE TRIGGER trg_guard_clinician_commercial
  BEFORE INSERT OR UPDATE ON public.clinician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_clinician_commercial_columns();

COMMENT ON FUNCTION public.guard_clinician_commercial_columns() IS
  'Pins a clinician''s tier, status, trial, patient limit and Stripe ids against client writes. RLS grants the whole own row, so without this any clinician could grant themselves enterprise.';
