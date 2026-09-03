import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtra } from '@/integrations/supabase/db';
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { CareGoalRow, CarePlanRow } from "@/lib/fhir/care-plan";

/**
 * Care plans, read under the reader's own row policies.
 *
 * A patient gets their active plans; a clinician gets those for patients they
 * can reach, drafts included. Neither is decided here — drafts stay out of a
 * patient's view because the policy excludes them, not because this filters.
 */
export function useCarePlans(patientUserId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["fhir-care-plans", patientUserId ?? "mine", user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async (): Promise<CarePlanRow[]> => {
      let q = supabaseExtra
        .from("fhir_care_plans")
        .select("*, goals:fhir_care_goals(*)")
        .order("created_at", { ascending: false });
      if (patientUserId) q = q.eq("patient_user_id", patientUserId);

      const { data, error } = await q;
      if (error) throw error;

      return ((data ?? []) as CarePlanRow[]).map((p) => ({
        ...p,
        goals: [...((p.goals ?? []) as CareGoalRow[])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        ),
      }));
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabaseExtra
        .from("fhir_care_plans")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Care plan updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update that plan"),
  });

  const setGoalAchievement = useMutation({
    mutationFn: async ({ id, achievement }: { id: string; achievement: string }) => {
      const { error } = await supabaseExtra
        .from("fhir_care_goals")
        .update({ achievement_status: achievement })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Goal updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update that goal"),
  });

  return {
    plans: query.data ?? [],
    isLoading: query.isLoading,
    setStatus,
    setGoalAchievement,
  };
}
