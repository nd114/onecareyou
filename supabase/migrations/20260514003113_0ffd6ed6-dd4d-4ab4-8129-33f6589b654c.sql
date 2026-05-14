UPDATE public.clinician_profiles
SET subscription_tier = 'enterprise',
    subscription_status = 'active',
    patient_limit = 1000,
    is_verified = true
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'demo-clinician-1@onecare.you'
);