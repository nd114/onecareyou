// Phase 1.4 — Encounters / visit records.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
  /** Whether the patient may read this summary once it is signed. */
  shared_with_patient: boolean;
  metadata: Record<string, Json>;
  scribe_transcript: string | null;
  scribe_audio_path: string | null;
  scribe_draft: Record<string, Json> | null;
  scribe_generated_at: string | null;
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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

  /**
   * Signing is what releases the summary to the patient, so the decision to
   * withhold one is taken here rather than left implicit.
   */
  const sign = useMutation({
    mutationFn: async ({ id, sharedWithPatient = true }: { id: string; sharedWithPatient?: boolean }) => {
      const { data, error } = await supabase
        .from("encounters")
        .update({
          status: "signed",
          signed_at: new Date().toISOString(),
          shared_with_patient: sharedWithPatient,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Encounter;
    },
    onSuccess: (enc) => {
      toast.success(
        enc.shared_with_patient
          ? "Signed and shared with the patient"
          : "Signed — not shared with the patient",
      );
      qc.invalidateQueries({ queryKey: ["encounters", enc.patient_user_id] });
    },
    onError: (e: any) => toast.error(e.message || "Could not sign the encounter"),
  });

  /** Changing your mind after signing, in either direction. */
  const setShared = useMutation({
    mutationFn: async ({ id, shared }: { id: string; shared: boolean }) => {
      const { data, error } = await supabase
        .from("encounters")
        .update({ shared_with_patient: shared })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Encounter;
    },
    onSuccess: (enc) => {
      toast.success(
        enc.shared_with_patient ? "Shared with the patient" : "No longer shared with the patient",
      );
      qc.invalidateQueries({ queryKey: ["encounters", enc.patient_user_id] });
    },
    onError: (e: any) => toast.error(e.message || "Could not change sharing"),
  });

  return {
    encounters: list.data ?? [],
    isLoading: list.isLoading,
    create,
    update,
    sign,
    setShared,
  };
}
