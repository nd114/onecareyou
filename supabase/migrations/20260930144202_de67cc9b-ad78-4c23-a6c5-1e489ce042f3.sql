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
    NEW.member_limit := 5;
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
DROP TRIGGER IF EXISTS guard_practice_commercial_fields ON public.practices;
CREATE TRIGGER guard_practice_commercial_fields
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_commercial_fields();