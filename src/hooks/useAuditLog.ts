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
