import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Records that a clinician opened a patient's record.
 *
 * Changes to a record are logged by database triggers and cannot be declined.
 * Reads cannot work that way — nothing in Postgres knows a page was rendered —
 * so this reports them. What it cannot do is lie: log_record_access() takes the
 * actor from auth.uid() and refuses to write an entry for a patient the caller
 * has no access to, so a client can neither forge an entry nor attribute one to
 * somebody else. The worst it can do is stay quiet.
 *
 * Fires once per patient per mount. A clinician scrolling a record should not
 * produce a hundred identical rows — that is how an audit log becomes unreadable
 * and stops being used.
 */
export function useRecordAccessLog(
  patientUserId: string | null | undefined,
  resourceType = 'patient_record',
  resourceId?: string | null,
) {
  const { user } = useAuth();
  const loggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !patientUserId) return;
    if (loggedFor.current === patientUserId) return;
    loggedFor.current = patientUserId;

    void (async () => {
      try {
        await supabase.rpc('log_record_access', {
          _patient_user_id: patientUserId,
          _resource_type: resourceType,
          _resource_id: resourceId ?? null,
        });
      } catch (error) {
        // Never let logging break the page the clinician came to read.
        console.error('Access log failed:', error);
      }
    })();
  }, [user?.id, patientUserId, resourceType, resourceId]);
}
