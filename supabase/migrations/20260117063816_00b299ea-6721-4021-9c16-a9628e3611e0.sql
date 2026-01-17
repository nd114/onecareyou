
-- Family members table (sub-profiles under one account)
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT, -- 'spouse', 'child', 'parent', 'sibling', 'other'
  date_of_birth DATE,
  gender TEXT,
  blood_type TEXT,
  height INTEGER,
  allergies JSONB DEFAULT '[]',
  health_conditions JSONB DEFAULT '[]',
  avatar_color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for family_members
CREATE POLICY "Users can view their own family members"
  ON public.family_members FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can create their own family members"
  ON public.family_members FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update their own family members"
  ON public.family_members FOR UPDATE
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete their own family members"
  ON public.family_members FOR DELETE
  USING (auth.uid() = owner_user_id);

-- Trigger for updated_at
CREATE TRIGGER update_family_members_updated_at
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Caregiver access table (who can manage family members)
CREATE TABLE public.caregiver_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  caregiver_user_id UUID NOT NULL,
  permissions JSONB DEFAULT '{"view": true, "edit": false, "manage_meds": false}' NOT NULL,
  granted_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(family_member_id, caregiver_user_id)
);

-- Enable RLS
ALTER TABLE public.caregiver_access ENABLE ROW LEVEL SECURITY;

-- RLS policies for caregiver_access
CREATE POLICY "Users can view caregiver access they granted or received"
  ON public.caregiver_access FOR SELECT
  USING (auth.uid() = granted_by OR auth.uid() = caregiver_user_id);

CREATE POLICY "Users can grant caregiver access for their family members"
  ON public.caregiver_access FOR INSERT
  WITH CHECK (auth.uid() = granted_by);

CREATE POLICY "Users can update caregiver access they granted"
  ON public.caregiver_access FOR UPDATE
  USING (auth.uid() = granted_by);

CREATE POLICY "Users can revoke caregiver access they granted"
  ON public.caregiver_access FOR DELETE
  USING (auth.uid() = granted_by);

-- Clinician accounts table
CREATE TABLE public.clinician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  practice_name TEXT,
  specialty TEXT,
  license_number TEXT,
  country TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.clinician_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for clinician_profiles
CREATE POLICY "Users can view their own clinician profile"
  ON public.clinician_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clinician profile"
  ON public.clinician_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clinician profile"
  ON public.clinician_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_clinician_profiles_updated_at
  BEFORE UPDATE ON public.clinician_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Clinician guidance/instructions to patients
CREATE TABLE public.clinician_guidance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_user_id UUID NOT NULL,
  patient_user_id UUID NOT NULL,
  share_id UUID REFERENCES public.provider_shares(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- 'medication', 'lifestyle', 'monitoring', 'appointment', 'general'
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- 'pending', 'acknowledged', 'completed', 'dismissed'
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  auto_resend_enabled BOOLEAN DEFAULT false,
  resend_interval_hours INTEGER DEFAULT 24,
  last_resent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.clinician_guidance ENABLE ROW LEVEL SECURITY;

-- RLS policies for clinician_guidance
CREATE POLICY "Clinicians can view guidance they created"
  ON public.clinician_guidance FOR SELECT
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Patients can view guidance for them"
  ON public.clinician_guidance FOR SELECT
  USING (auth.uid() = patient_user_id);

CREATE POLICY "Clinicians can create guidance"
  ON public.clinician_guidance FOR INSERT
  WITH CHECK (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can update their guidance"
  ON public.clinician_guidance FOR UPDATE
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Patients can update their own guidance status"
  ON public.clinician_guidance FOR UPDATE
  USING (auth.uid() = patient_user_id);

CREATE POLICY "Clinicians can delete their guidance"
  ON public.clinician_guidance FOR DELETE
  USING (auth.uid() = clinician_user_id);

-- Trigger for updated_at
CREATE TRIGGER update_clinician_guidance_updated_at
  BEFORE UPDATE ON public.clinician_guidance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Alert rules set by clinicians
CREATE TABLE public.clinician_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_user_id UUID NOT NULL,
  patient_user_id UUID NOT NULL,
  share_id UUID REFERENCES public.provider_shares(id) ON DELETE CASCADE,
  vital_type TEXT NOT NULL, -- 'blood_pressure', 'blood_glucose', etc.
  condition TEXT NOT NULL, -- 'above', 'below', 'outside_range'
  threshold_value NUMERIC NOT NULL,
  threshold_secondary NUMERIC, -- For BP diastolic, etc.
  alert_method TEXT DEFAULT 'email', -- 'email', 'sms', 'push'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.clinician_alert_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies for clinician_alert_rules
CREATE POLICY "Clinicians can view their alert rules"
  ON public.clinician_alert_rules FOR SELECT
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Patients can view alert rules for them"
  ON public.clinician_alert_rules FOR SELECT
  USING (auth.uid() = patient_user_id);

CREATE POLICY "Clinicians can create alert rules"
  ON public.clinician_alert_rules FOR INSERT
  WITH CHECK (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can update their alert rules"
  ON public.clinician_alert_rules FOR UPDATE
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Clinicians can delete their alert rules"
  ON public.clinician_alert_rules FOR DELETE
  USING (auth.uid() = clinician_user_id);

-- Trigger for updated_at
CREATE TRIGGER update_clinician_alert_rules_updated_at
  BEFORE UPDATE ON public.clinician_alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Alert history
CREATE TABLE public.alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.clinician_alert_rules(id) ON DELETE SET NULL,
  vital_id UUID REFERENCES public.vitals(id) ON DELETE SET NULL,
  patient_user_id UUID NOT NULL,
  clinician_user_id UUID NOT NULL,
  alert_type TEXT NOT NULL, -- 'threshold_breach', 'guidance_ignored', 'dangerous_reading', 'emergency'
  message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.alert_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for alert_logs
CREATE POLICY "Clinicians can view their alert logs"
  ON public.alert_logs FOR SELECT
  USING (auth.uid() = clinician_user_id);

CREATE POLICY "Patients can view alert logs about them"
  ON public.alert_logs FOR SELECT
  USING (auth.uid() = patient_user_id);

CREATE POLICY "System can create alert logs"
  ON public.alert_logs FOR INSERT
  WITH CHECK (auth.uid() = clinician_user_id OR auth.uid() = patient_user_id);

-- Add family_member_id to existing tables
ALTER TABLE public.medications ADD COLUMN family_member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE;
ALTER TABLE public.vitals ADD COLUMN family_member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE;
ALTER TABLE public.schedule_entries ADD COLUMN family_member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE;

-- Emergency numbers table
CREATE TABLE public.emergency_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  emergency_number TEXT NOT NULL,
  police_number TEXT,
  ambulance_number TEXT,
  fire_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS - public read access
ALTER TABLE public.emergency_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view emergency numbers"
  ON public.emergency_numbers FOR SELECT
  USING (true);

-- Insert common emergency numbers
INSERT INTO public.emergency_numbers (country_code, country_name, emergency_number, police_number, ambulance_number, fire_number) VALUES
('US', 'United States', '911', '911', '911', '911'),
('CA', 'Canada', '911', '911', '911', '911'),
('GB', 'United Kingdom', '999', '999', '999', '999'),
('AU', 'Australia', '000', '000', '000', '000'),
('DE', 'Germany', '112', '110', '112', '112'),
('FR', 'France', '112', '17', '15', '18'),
('IT', 'Italy', '112', '113', '118', '115'),
('ES', 'Spain', '112', '091', '061', '080'),
('NL', 'Netherlands', '112', '112', '112', '112'),
('BE', 'Belgium', '112', '101', '100', '100'),
('AT', 'Austria', '112', '133', '144', '122'),
('CH', 'Switzerland', '112', '117', '144', '118'),
('SE', 'Sweden', '112', '112', '112', '112'),
('NO', 'Norway', '112', '112', '113', '110'),
('DK', 'Denmark', '112', '112', '112', '112'),
('FI', 'Finland', '112', '112', '112', '112'),
('IE', 'Ireland', '112', '999', '999', '999'),
('PT', 'Portugal', '112', '112', '112', '112'),
('GR', 'Greece', '112', '100', '166', '199'),
('PL', 'Poland', '112', '997', '999', '998'),
('CZ', 'Czech Republic', '112', '158', '155', '150'),
('HU', 'Hungary', '112', '107', '104', '105'),
('RO', 'Romania', '112', '112', '112', '112'),
('BG', 'Bulgaria', '112', '166', '150', '160'),
('HR', 'Croatia', '112', '192', '194', '193'),
('SK', 'Slovakia', '112', '158', '155', '150'),
('SI', 'Slovenia', '112', '113', '112', '112'),
('LT', 'Lithuania', '112', '112', '112', '112'),
('LV', 'Latvia', '112', '110', '113', '112'),
('EE', 'Estonia', '112', '110', '112', '112'),
('JP', 'Japan', '119', '110', '119', '119'),
('KR', 'South Korea', '119', '112', '119', '119'),
('CN', 'China', '120', '110', '120', '119'),
('IN', 'India', '112', '100', '102', '101'),
('BR', 'Brazil', '190', '190', '192', '193'),
('MX', 'Mexico', '911', '911', '911', '911'),
('AR', 'Argentina', '911', '101', '107', '100'),
('CL', 'Chile', '131', '133', '131', '132'),
('CO', 'Colombia', '123', '123', '123', '119'),
('ZA', 'South Africa', '10111', '10111', '10177', '10177'),
('EG', 'Egypt', '123', '122', '123', '180'),
('NG', 'Nigeria', '112', '112', '112', '112'),
('KE', 'Kenya', '999', '999', '999', '999'),
('AE', 'United Arab Emirates', '999', '999', '998', '997'),
('SA', 'Saudi Arabia', '911', '999', '997', '998'),
('IL', 'Israel', '100', '100', '101', '102'),
('TR', 'Turkey', '112', '155', '112', '110'),
('RU', 'Russia', '112', '102', '103', '101'),
('NZ', 'New Zealand', '111', '111', '111', '111'),
('SG', 'Singapore', '999', '999', '995', '995'),
('MY', 'Malaysia', '999', '999', '999', '994'),
('TH', 'Thailand', '191', '191', '1669', '199'),
('PH', 'Philippines', '911', '117', '911', '911'),
('ID', 'Indonesia', '112', '110', '118', '113'),
('VN', 'Vietnam', '115', '113', '115', '114');
