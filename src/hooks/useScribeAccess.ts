import { useClinicianCapabilities } from '@/hooks/useClinicianCapabilities';
import { useScribePlan } from '@/hooks/useScribePlan';
import { SCRIBE_LOCKED_REASON } from '@/lib/destinations';

/**
 * Whether this member may use the scribe, as three states instead of two:
 * still working it out (show nothing, so a clinician never sees a locked
 * flash), allowed, or locked with a reason to show. The server still decides
 * what any request may touch; this only decides what is drawn.
 *
 * Two things can lock it: the member's role in the practice (clinical access)
 * and the plan (Individual and Community do not include the scribe).
 * `planBlocked` says which, so a screen can offer plans rather than ask for
 * a role change.
 */
export function useScribeAccess(): {
  loading: boolean;
  allowed: boolean;
  locked: boolean;
  planBlocked: boolean;
  reason: string;
} {
  const { can, loading: capsLoading } = useClinicianCapabilities();
  const plan = useScribePlan();
  const loading = capsLoading || plan.loading;
  const hasRole = !capsLoading && can('edit_clinical');
  const planBlocked = !plan.loading && plan.blocked;
  const allowed = !loading && hasRole && !planBlocked;
  return {
    loading,
    allowed,
    locked: !loading && !allowed,
    planBlocked: !loading && hasRole && planBlocked,
    reason: !hasRole ? SCRIBE_LOCKED_REASON : plan.reason,
  };
}
