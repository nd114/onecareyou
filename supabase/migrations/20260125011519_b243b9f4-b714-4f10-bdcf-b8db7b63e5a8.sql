-- =====================================================
-- PHASE 2: PRACTICE MANAGEMENT INFRASTRUCTURE
-- =====================================================

-- Create enum for practice member roles
CREATE TYPE public.practice_role AS ENUM ('owner', 'admin', 'provider', 'staff');

-- =====================================================
-- PRACTICES TABLE - Container for multi-clinician teams
-- =====================================================
CREATE TABLE public.practices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  npi TEXT,
  tax_id TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  
  -- Subscription info (practice-level billing)
  subscription_tier TEXT DEFAULT 'trial',
  subscription_status TEXT DEFAULT 'active',
  subscription_ends_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  patient_limit INTEGER DEFAULT 25,
  member_limit INTEGER DEFAULT 5,
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.practices ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PRACTICE MEMBERS TABLE - Link clinicians to practices
-- =====================================================
CREATE TABLE public.practice_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id UUID NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role practice_role NOT NULL DEFAULT 'provider',
  
  -- Permissions (granular access control)
  can_invite_patients BOOLEAN DEFAULT true,
  can_invite_members BOOLEAN DEFAULT false,
  can_manage_billing BOOLEAN DEFAULT false,
  can_view_all_patients BOOLEAN DEFAULT true,
  can_manage_settings BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'active',
  invited_by UUID,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(practice_id, user_id)
);

-- Enable RLS
ALTER TABLE public.practice_members ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PRACTICE PATIENT ACCESS - Shared patient pools
-- =====================================================
CREATE TABLE public.practice_patient_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id UUID NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  patient_user_id UUID NOT NULL,
  
  -- Which clinician originally invited/owns this patient
  primary_clinician_id UUID NOT NULL,
  
  -- Permissions for practice-wide access
  permissions JSONB NOT NULL DEFAULT '{"meds": true, "vitals": true, "profile": false, "adherence": true}'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(practice_id, patient_user_id)
);

-- Enable RLS
ALTER TABLE public.practice_patient_access ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PRACTICE INVITATIONS - Invite clinicians to join
-- =====================================================
CREATE TABLE public.practice_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id UUID NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role practice_role NOT NULL DEFAULT 'provider',
  
  invite_code TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  invited_by UUID NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(practice_id, email)
);

-- Enable RLS
ALTER TABLE public.practice_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER FUNCTIONS
-- =====================================================

-- Check if user is a member of a practice
CREATE OR REPLACE FUNCTION public.is_practice_member(practice_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members
    WHERE practice_id = practice_uuid
      AND user_id = auth.uid()
      AND status = 'active'
  )
$$;

-- Check if user has a specific role in a practice
CREATE OR REPLACE FUNCTION public.has_practice_role(practice_uuid UUID, required_role practice_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members
    WHERE practice_id = practice_uuid
      AND user_id = auth.uid()
      AND status = 'active'
      AND (
        role = required_role 
        OR role = 'owner' 
        OR (role = 'admin' AND required_role IN ('provider', 'staff'))
      )
  )
$$;

-- Check if user can manage a practice (owner or admin)
CREATE OR REPLACE FUNCTION public.can_manage_practice(practice_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members
    WHERE practice_id = practice_uuid
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
  )
$$;

-- Check if user has access to a patient through their practice
CREATE OR REPLACE FUNCTION public.practice_has_patient_access(patient_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_patient_access ppa
    JOIN public.practice_members pm ON pm.practice_id = ppa.practice_id
    WHERE ppa.patient_user_id = patient_uuid
      AND ppa.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND pm.can_view_all_patients = true
  )
$$;

-- =====================================================
-- RLS POLICIES - PRACTICES
-- =====================================================

-- Members can view their practice
CREATE POLICY "Practice members can view their practice"
ON public.practices FOR SELECT
USING (is_practice_member(id));

-- Only creators can create practices
CREATE POLICY "Users can create practices"
ON public.practices FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Only owners/admins can update practice
CREATE POLICY "Practice managers can update practice"
ON public.practices FOR UPDATE
USING (can_manage_practice(id));

-- Only owners can delete practice
CREATE POLICY "Practice owners can delete practice"
ON public.practices FOR DELETE
USING (has_practice_role(id, 'owner'));

-- =====================================================
-- RLS POLICIES - PRACTICE MEMBERS
-- =====================================================

-- Members can view other members in their practice
CREATE POLICY "Practice members can view members"
ON public.practice_members FOR SELECT
USING (is_practice_member(practice_id));

-- Owners/admins can add members
CREATE POLICY "Practice managers can add members"
ON public.practice_members FOR INSERT
WITH CHECK (can_manage_practice(practice_id));

-- Owners/admins can update members (except owner's own role)
CREATE POLICY "Practice managers can update members"
ON public.practice_members FOR UPDATE
USING (can_manage_practice(practice_id));

-- Owners can remove members
CREATE POLICY "Practice managers can remove members"
ON public.practice_members FOR DELETE
USING (can_manage_practice(practice_id) OR user_id = auth.uid());

-- =====================================================
-- RLS POLICIES - PRACTICE PATIENT ACCESS
-- =====================================================

-- Members can view patients in their practice
CREATE POLICY "Practice members can view patients"
ON public.practice_patient_access FOR SELECT
USING (is_practice_member(practice_id));

-- Members with invite permission can add patients
CREATE POLICY "Members can add patients"
ON public.practice_patient_access FOR INSERT
WITH CHECK (
  is_practice_member(practice_id) AND
  EXISTS (
    SELECT 1 FROM public.practice_members
    WHERE practice_id = practice_patient_access.practice_id
      AND user_id = auth.uid()
      AND can_invite_patients = true
  )
);

-- Managers can update patient access
CREATE POLICY "Managers can update patient access"
ON public.practice_patient_access FOR UPDATE
USING (can_manage_practice(practice_id) OR primary_clinician_id = auth.uid());

-- Managers or primary clinician can remove patient
CREATE POLICY "Managers can remove patients"
ON public.practice_patient_access FOR DELETE
USING (can_manage_practice(practice_id) OR primary_clinician_id = auth.uid());

-- =====================================================
-- RLS POLICIES - PRACTICE INVITATIONS
-- =====================================================

-- Members can view invitations for their practice
CREATE POLICY "Practice members can view invitations"
ON public.practice_invitations FOR SELECT
USING (is_practice_member(practice_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Managers can create invitations
CREATE POLICY "Practice managers can create invitations"
ON public.practice_invitations FOR INSERT
WITH CHECK (can_manage_practice(practice_id));

-- Managers can update invitations
CREATE POLICY "Practice managers can update invitations"
ON public.practice_invitations FOR UPDATE
USING (can_manage_practice(practice_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Managers can delete invitations
CREATE POLICY "Practice managers can delete invitations"
ON public.practice_invitations FOR DELETE
USING (can_manage_practice(practice_id));

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE TRIGGER update_practices_updated_at
  BEFORE UPDATE ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_practice_members_updated_at
  BEFORE UPDATE ON public.practice_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-add creator as owner when practice is created
CREATE OR REPLACE FUNCTION public.add_practice_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.practice_members (
    practice_id,
    user_id,
    role,
    can_invite_patients,
    can_invite_members,
    can_manage_billing,
    can_view_all_patients,
    can_manage_settings,
    status,
    accepted_at
  ) VALUES (
    NEW.id,
    NEW.created_by,
    'owner',
    true,
    true,
    true,
    true,
    true,
    'active',
    now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER add_practice_owner_trigger
  AFTER INSERT ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.add_practice_owner();

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_practices_created_by ON public.practices(created_by);
CREATE INDEX idx_practice_members_practice_id ON public.practice_members(practice_id);
CREATE INDEX idx_practice_members_user_id ON public.practice_members(user_id);
CREATE INDEX idx_practice_patient_access_practice_id ON public.practice_patient_access(practice_id);
CREATE INDEX idx_practice_patient_access_patient_id ON public.practice_patient_access(patient_user_id);
CREATE INDEX idx_practice_invitations_email ON public.practice_invitations(email);
CREATE INDEX idx_practice_invitations_code ON public.practice_invitations(invite_code);