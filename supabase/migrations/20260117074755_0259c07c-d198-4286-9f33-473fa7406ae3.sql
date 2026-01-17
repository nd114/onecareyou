-- The profiles table already has subscription_tier as TEXT, which accepts any value
-- Just add a comment documenting the valid values for reference

COMMENT ON COLUMN public.profiles.subscription_tier IS 'Valid values: free, family, premium, enterprise. Default is null (treated as free)';