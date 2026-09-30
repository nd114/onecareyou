DROP POLICY IF EXISTS "Anyone can submit bug reports" ON public.beta_bug_reports;
CREATE POLICY "Signed-in users submit their own bug reports" ON public.beta_bug_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'new' AND length(description) <= 10000);

DROP POLICY IF EXISTS "Anyone can submit job applications" ON public.job_applications;
CREATE POLICY "Anyone can submit a new job application" ON public.job_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND admin_notes IS NULL
    AND archived_at IS NULL
    AND length(full_name) BETWEEN 1 AND 200
    AND length(email) BETWEEN 3 AND 320
    AND coalesce(length(cover_letter), 0) <= 20000
  );

CREATE OR REPLACE FUNCTION public.guard_practice_commercial_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.subscription_tier := 'free';
    NEW.subscription_status := 'inactive';
    NEW.subscription_ends_at := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.patient_limit := DEFAULT_VALUE_PLACEHOLDER;
  END IF;
  RETURN NEW;
END $$;