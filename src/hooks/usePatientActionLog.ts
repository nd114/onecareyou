// Phase 4.1 — Patient activity timeline (action-rail audit log).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PatientActionLogEntry {
  id: string;
  patient_user_id: string;
  actor_user_id: string;
  practice_id: string | null;
  action: string;
  ref_table: string | null;
  ref_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function usePatientActionLog(patientUserId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["patient-action-log", patientUserId],
    queryFn: async () => {
      if (!patientUserId) return [];
      const { data, error } = await (supabase as any)
        .from("patient_action_log")
        .select("*")
        .eq("patient_user_id", patientUserId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PatientActionLogEntry[];
    },
    enabled: !!patientUserId,
  });

  const log = useMutation({
    mutationFn: async (input: {
      patient_user_id: string;
      action: string;
      summary?: string;
      ref_table?: string;
      ref_id?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!user) return;
      const { error } = await (supabase as any).from("patient_action_log").insert({
        actor_user_id: user.id,
        ...input,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["patient-action-log", vars.patient_user_id] });
    },
  });

  return { entries: list.data ?? [], isLoading: list.isLoading, log };
}
