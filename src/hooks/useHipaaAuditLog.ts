import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AuditLogEntry {
  action: string;
  resource_type: string;
  resource_id?: string;
  patient_user_id?: string;
  details?: Record<string, unknown>;
}

export function useHipaaAuditLog() {
  const { user } = useAuth();

  const logAccess = useCallback(async (entry: AuditLogEntry) => {
    if (!user) return;

    try {
      await (supabase.from('hipaa_audit_logs' as any).insert({
        user_id: user.id,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id || null,
        patient_user_id: entry.patient_user_id || null,
        details: entry.details || null,
        user_agent: navigator.userAgent,
      }) as any);
    } catch (err) {
      // Silent fail — audit logging should never break the app
      console.error('HIPAA audit log failed:', err);
    }
  }, [user]);

  return { logAccess };
}
