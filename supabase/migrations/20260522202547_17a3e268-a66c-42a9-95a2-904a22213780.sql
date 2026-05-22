
-- Drop the previously created view (caused linter error)
DROP VIEW IF EXISTS public.practices_safe;

-- Restore broad member SELECT (column-level revokes will hide sensitive fields)
DROP POLICY IF EXISTS "Practice members can view their practice" ON public.practices;
CREATE POLICY "Practice members can view their practice"
  ON public.practices FOR SELECT TO authenticated
  USING (public.is_practice_member(id));

-- Keep the owner/admin full-access policy alongside (owners/admins satisfy both)
-- (already created in previous migration: "Practice owners and admins view full practice")

-- Revoke sensitive column access from authenticated; only service-role can read
REVOKE SELECT (tax_id, npi, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier, subscription_ends_at)
  ON public.practices FROM authenticated;
