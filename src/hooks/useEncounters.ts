// Phase 1.4 — Encounters / visit records.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type EncounterStatus = "in_progress" | "signed" | "amended" | "cancelled";

export interface Encounter {
  id: string;
  patient_user_id: string;
  clinician_user_id: string;
  practice_id: string | null;
  visit_type: string;
  status: EncounterStatus;
  occurred_at: string;
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  cpt_codes: string[];
  icd_codes: string[];
  follow_up_in_days: number | null;
  follow_up_task_id: string | null;
  signed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useEncounters(patientUserId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["encounters", patientUserId],
    queryFn: async () => {
      if (!patientUserId) return [];
      const { data, error } = await (supabase as any)
        .from("encounters")
        .select("*")
        .eq("patient_user_id", patientUserId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Encounter[];
    },
    enabled: !!patientUserId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Encounter> & { patient_user_id: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await (supabase as any)
        .from("encounters")
        .insert({
          clinician_user_id: user.id,
          status: "in_progress",
          visit_type: "follow_up",
          ...input,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Encounter;
    },
    onSuccess: (enc) => {
      toast.success("Encounter started");
      qc.invalidateQueries({ queryKey: ["encounters", enc.patient_user_id] });
      qc.invalidateQueries({ queryKey: ["patient-action-log", enc.patient_user_id] });
    },
    onError: (e: any) => toast.error(e.message || "Could not start encounter"),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Encounter> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("encounters")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Encounter;
    },
    onSuccess: (enc) => {
      qc.invalidateQueries({ queryKey: ["encounters", enc.patient_user_id] });
    },
  });

  const sign = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any)
        .from("encounters")
        .update({ status: "signed", signed_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Encounter;
    },
    onSuccess: (enc) => {
      toast.success("Encounter signed");
      qc.invalidateQueries({ queryKey: ["encounters", enc.patient_user_id] });
    },
  });

  return {
    encounters: list.data ?? [],
    isLoading: list.isLoading,
    create,
    update,
    sign,
  };
}
