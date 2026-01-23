-- Add subscription tracking to clinician_profiles
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'trial';
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days');
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS patient_limit INTEGER DEFAULT 5;
ALTER TABLE clinician_profiles ADD COLUMN IF NOT EXISTS team_id UUID;

-- Create BAA agreements table for enterprise clinicians
CREATE TABLE IF NOT EXISTS public.baa_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinician_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  practice_name TEXT NOT NULL,
  practice_address TEXT,
  practice_npi TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  agreement_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on BAA table
ALTER TABLE public.baa_agreements ENABLE ROW LEVEL SECURITY;

-- BAA policies - clinicians can only see their own agreements
CREATE POLICY "Clinicians can view their own BAA agreements"
  ON public.baa_agreements
  FOR SELECT
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can create their own BAA agreements"
  ON public.baa_agreements
  FOR INSERT
  WITH CHECK (auth.uid() = clinician_user_id);

-- Create enterprise inquiry table for contact form submissions
CREATE TABLE IF NOT EXISTS public.enterprise_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinician_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  practice_name TEXT NOT NULL,
  practice_size TEXT,
  specialty TEXT,
  country TEXT,
  ehr_system TEXT,
  requirements TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'demo_scheduled', 'negotiating', 'closed_won', 'closed_lost')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on enterprise inquiries
ALTER TABLE public.enterprise_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to create inquiries
CREATE POLICY "Users can create enterprise inquiries"
  ON public.enterprise_inquiries
  FOR INSERT
  WITH CHECK (auth.uid() = clinician_user_id OR clinician_user_id IS NULL);

CREATE POLICY "Users can view their own inquiries"
  ON public.enterprise_inquiries
  FOR SELECT
  USING (auth.uid() = clinician_user_id);

-- Add timestamp trigger to new tables
CREATE TRIGGER update_baa_agreements_updated_at
  BEFORE UPDATE ON public.baa_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_enterprise_inquiries_updated_at
  BEFORE UPDATE ON public.enterprise_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();