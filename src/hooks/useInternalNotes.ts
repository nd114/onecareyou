// Phase 2.4 — Internal practice notes per patient.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface InternalNote {
  id: string;
  patient_user_id: string;
  author_user_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export function useInternalNotes(patientUserId?: string) {
  const qc = useQueryClient();
  const key = ["internal-notes", patientUserId];

  const query = useQuery({
    queryKey: key,
    enabled: !!patientUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_notes")
        .select("*")
        .eq("patient_user_id", patientUserId!)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InternalNote[];
    },
  });

  const create = useMutation({
    mutationFn: async (body: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !patientUserId) throw new Error("Not authenticated");
      const { error } = await supabase.from("internal_notes").insert({
        patient_user_id: patientUserId,
        author_user_id: u.user.id,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add note"),
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("internal_notes").update({ pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("internal_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Note deleted");
    },
  });

  return { ...query, create, togglePin, remove };
}
