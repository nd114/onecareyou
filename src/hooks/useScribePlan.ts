import { useEntitlements, type Entitlements } from '@/hooks/useEntitlements';
import { hasFeatureAccess } from '@/hooks/useClinicianSubscription';

import { SCRIBE_NOT_IN_PLAN_REASON } from '@/lib/destinations';
export { SCRIBE_NOT_IN_PLAN_REASON };

/**
 * Does the plan include the scribe? true / false, or null when it cannot be
 * told (entitlements not loaded or failed to load). null is not a refusal:
 * the server decides, and an unreadable plan must not lock a paying clinician
 * out of their own tool.
 *
 * Two readings agree on purpose. The database's `scribe_included` is what the
 * edge functions enforce; the tier map is the same decision by tier name, and
 * covers a clinician seated in a Practice whose personal profile is lower
 * (entitlements.tier is the plan they work under).
 */
export function scribePlanIncluded(
  entitlements: Pick<Entitlements, 'tier' | 'scribeIncluded'> | null | undefined,
): boolean | null {
  if (!entitlements) return null;
  return entitlements.scribeIncluded || hasFeatureAccess(entitlements.tier, 'ambient_scribe');
}

export function useScribePlan(): { loading: boolean; included: boolean | null; blocked: boolean; reason: string } {
  const { entitlements, isLoading } = useEntitlements();
  const included = scribePlanIncluded(entitlements);
  return { loading: isLoading, included, blocked: included === false, reason: SCRIBE_NOT_IN_PLAN_REASON };
}
