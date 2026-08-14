// Phase 3.2 — Audit log viewer (HIPAA + access logs).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AuditEntry {
  id: string;
  user_id: string;
  patient_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface PracticeAuditEntry {
  id: string;
  created_at: string;
  actor_user_id: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  patient_user_id: string | null;
  patient_name: string | null;
  ip_address: string | null;
}

/**
 * Tenant-wide access log for a hospital's own admins.
 *
 * The RLS policy on hipaa_audit_logs is auth.uid() = user_id, so reading the
 * table directly shows an admin only their own actions. This goes through a
 * security-definer function scoped to actors inside the given tenant — the
 * "who accessed what" view a compliance reviewer asks for, with no
 * cross-tenant visibility.
 */
export function usePracticeAuditLog(
  practiceId: string | null,
  opts?: { search?: string; limit?: number },
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['practice-audit-log', practiceId, opts?.search ?? '', opts?.limit ?? 500],
    enabled: !!user && !!practiceId,
    queryFn: async (): Promise<PracticeAuditEntry[]> => {
      const { data, error } = await supabase.rpc('practice_audit_log', {
        _practice_id: practiceId!,
        _search: opts?.search?.trim() || null,
        _limit: opts?.limit ?? 500,
      });
      if (error) throw error;
      return (data ?? []) as PracticeAuditEntry[];
    },
  });
}

export function useAuditLog(opts?: { patientId?: string; action?: string; limit?: number }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["audit-log", opts?.patientId ?? null, opts?.action ?? null, opts?.limit ?? 200],
    queryFn: async () => {
      let q = supabase
        .from("hipaa_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(opts?.limit ?? 200);
      if (opts?.patientId) q = q.eq("patient_user_id", opts.patientId);
      if (opts?.action) q = q.eq("action", opts.action);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
    enabled: !!user,
  });
}
