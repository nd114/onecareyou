import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtra } from '@/integrations/supabase/db';
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface EncounterAddendum {
  id: string;
  encounter_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

/**
 * Corrections and additions to a signed note.
 *
 * A signed note is frozen by the database, so this is the only way to change
 * what a record says after the fact — and it changes it by appending rather
 * than overwriting, so both the original and the correction stay readable and
 * attributed. An addendum that was itself wrong is corrected by another; there
 * is deliberately no edit and no delete, at either layer.
 */
export function useEncounterAddenda(encounterId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["encounter-addenda", encounterId];

  const query = useQuery({
    queryKey: key,
    enabled: !!encounterId,
    queryFn: async (): Promise<EncounterAddendum[]> => {
      const { data, error } = await supabaseExtra
        .from("encounter_addenda")
        .select("*")
        .eq("encounter_id", encounterId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EncounterAddendum[];
    },
  });

  const add = useMutation({
    mutationFn: async (body: string) => {
      if (!user) throw new Error("Not authenticated");
      const text = body.trim();
      if (!text) throw new Error("An addendum needs something in it");

      const { error } = await supabaseExtra.from("encounter_addenda").insert({
        encounter_id: encounterId,
        // The insert policy checks this against auth.uid(), so an addendum
        // cannot be filed under anyone else's name.
        author_user_id: user.id,
        body: text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Addendum added to the record");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add that addendum"),
  });

  return { addenda: query.data ?? [], isLoading: query.isLoading, add };
}
