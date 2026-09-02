import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface VisitSummary {
  id: string;
  occurred_at: string;
  visit_type: string;
  status: string;
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  follow_up_in_days: number | null;
  signed_at: string | null;
  clinician_name: string | null;
  practice_name: string | null;
}

/**
 * The patient's own visit summaries.
 *
 * Read through my_visit_summaries() rather than the encounters table. RLS is
 * row-level, so a policy granting "your own encounters" would also hand over
 * the ambient-scribe transcript, the billing codes and every note still being
 * written. The function returns finished notes and the summary columns only —
 * see 20260820100000.
 */
export interface VisitSummaryAddendum {
  id: string;
  encounter_id: string;
  body: string;
  created_at: string;
}

export function useVisitSummaries() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["visit-summaries", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_visit_summaries");
      if (error) throw error;
      return (data ?? []) as VisitSummary[];
    },
  });

  /**
   * Corrections to those summaries.
   *
   * Through its own function for the same reason as the summaries themselves:
   * the patient holds no direct read on encounter_addenda, whose policy defers
   * to the encounter policies they also do not hold. Without this they saw a
   * summary and none of its corrections — reading "all well" on a note that had
   * since been amended.
   */
  const addenda = useQuery({
    queryKey: ["visit-summary-addenda", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_visit_summary_addenda");
      if (error) throw error;
      return (data ?? []) as VisitSummaryAddendum[];
    },
  });

  const byEncounter = (addenda.data ?? []).reduce<Record<string, VisitSummaryAddendum[]>>(
    (acc, a) => {
      (acc[a.encounter_id] ??= []).push(a);
      return acc;
    },
    {},
  );

  return {
    visits: query.data ?? [],
    addendaByVisit: byEncounter,
    isLoading: query.isLoading,
    error: query.error,
  };
}
