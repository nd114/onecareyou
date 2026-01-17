-- Create provider_shares table for Care Circle functionality
CREATE TABLE public.provider_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_email TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  permissions JSONB NOT NULL DEFAULT '{"vitals": true, "meds": true, "adherence": true, "profile": false}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.provider_shares ENABLE ROW LEVEL SECURITY;

-- Users can view their own shares
CREATE POLICY "Users can view their own shares"
ON public.provider_shares
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own shares
CREATE POLICY "Users can create their own shares"
ON public.provider_shares
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own shares
CREATE POLICY "Users can update their own shares"
ON public.provider_shares
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own shares
CREATE POLICY "Users can delete their own shares"
ON public.provider_shares
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for fast invite code lookups
CREATE INDEX idx_provider_shares_invite_code ON public.provider_shares(invite_code);

-- Create index for user lookups
CREATE INDEX idx_provider_shares_user_id ON public.provider_shares(user_id);