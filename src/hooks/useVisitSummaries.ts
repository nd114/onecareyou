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

  return { visits: query.data ?? [], isLoading: query.isLoading, error: query.error };
}
