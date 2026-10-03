import { useClinicianCapabilities } from '@/hooks/useClinicianCapabilities';
import { SCRIBE_LOCKED_REASON } from '@/lib/destinations';

/**
 * Whether this member may use the scribe, as three states instead of two:
 * still working it out (show nothing, so a clinician never sees a locked
 * flash), allowed, or locked with a reason to show. The server still decides
 * what any request may touch; this only decides what is drawn.
 */
export function useScribeAccess(): { loading: boolean; allowed: boolean; locked: boolean; reason: string } {
  const { can, loading } = useClinicianCapabilities();
  const allowed = !loading && can('edit_clinical');
  return { loading, allowed, locked: !loading && !allowed, reason: SCRIBE_LOCKED_REASON };
}
