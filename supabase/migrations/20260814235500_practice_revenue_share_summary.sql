-- Revenue share was estimated from every connected patient, on the assumption
-- that all of them hold a paid plan. For a hospital reading it as "what we are
-- owed", that overstates the figure by however many connected patients are on
-- the free tier.
--
-- This returns the counts the tenant admin view actually needs. Money is still
-- computed in the app, where src/lib/pricing-constants.ts is the source of
-- truth for prices.
--
-- Only institution shares count. A private Care Circle share with a doctor who
-- happens to work at this hospital is a separate relationship and must never
-- be counted for revenue share (sharing model §6).

CREATE OR REPLACE FUNCTION public.practice_revenue_share_summary(_practice_id uuid)
RETURNS TABLE(
  connected_patients bigint,
  paying_patients bigint,
  revenue_share_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE ps.is_active),
    count(*) FILTER (
      WHERE ps.is_active
        AND COALESCE(pr.subscription_tier, 'free') <> 'free'
    ),
    (SELECT p.revenue_share_pct FROM public.practices p WHERE p.id = _practice_id)
  FROM public.practice_shares ps
  LEFT JOIN public.profiles pr ON pr.user_id = ps.user_id
  WHERE ps.practice_id = _practice_id
    AND public.can_manage_practice(_practice_id);
$$;

REVOKE ALL ON FUNCTION public.practice_revenue_share_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_revenue_share_summary(uuid) TO authenticated;
