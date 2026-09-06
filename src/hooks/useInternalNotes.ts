// Phase 2.4 — Internal practice notes per patient.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type NoteVisibility = 'team' | 'private';

export interface InternalNote {
  id: string;
  patient_user_id: string;
  author_user_id: string;
  body: string;
  pinned: boolean;
  visibility: NoteVisibility;
  created_at: string;
  updated_at: string;
  /** Resolved for team notes; null when the author has no clinician profile. */
  author_name?: string | null;
}

/**
 * Who wrote it, for the notes a team shares.
 *
 * A shared note with no name on it is half a note — you cannot weigh an
 * observation without knowing whose it is. Read from the restricted public view
 * rather than clinician_profiles, which carries licence numbers.
 */
async function resolveAuthors(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = (await supabase
    .from("clinician_profiles_public")
    .select("user_id, first_name, last_name, title")
    .in("user_id", ids)) as unknown as {
    data: { user_id: string; first_name: string | null; last_name: string | null; title: string | null }[] | null;
  };
  return new Map(
    (data ?? []).flatMap((p) => {
      const name = [p.title, p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      return name ? [[p.user_id, name] as [string, string]] : [];
    }),
  );
}

/**
 * Notes on a patient, of both kinds.
 *
 * `visibility` is the whole difference: a team note is readable by anyone with
 * access to the patient, a private note only by whoever wrote it. Enforced in
 * RLS rather than by this filter — the filter is what the clinician asked to
 * see, not what keeps the two apart.
 */
export function useInternalNotes(patientUserId?: string, visibility?: NoteVisibility) {
  const qc = useQueryClient();
  const key = ["internal-notes", patientUserId, visibility ?? "all"];

  const query = useQuery({
    queryKey: key,
    enabled: !!patientUserId,
    queryFn: async () => {
      // Typed loosely on purpose: adding a conditional filter to the builder
      // pushes Supabase's generated generics past their instantiation depth,
      // and the row shape is asserted below where it is actually used.
      let q: any = supabase
        .from("internal_notes")
        .select("*")
        .eq("patient_user_id", patientUserId!);
      if (visibility) q = q.eq("visibility", visibility);
      const { data, error } = await q
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as InternalNote[];

      // Private notes are all your own, so there is nobody to look up.
      if (visibility === "private") return rows;
      const authors = await resolveAuthors([...new Set(rows.map((r) => r.author_user_id))]);
      return rows.map((r) => ({ ...r, author_name: authors.get(r.author_user_id) ?? null }));
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
        visibility: visibility ?? "team",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add note"),
  });

  /**
   * Amending an entry, which neither notes surface had. The private one was a
   * single blob you rewrote wholesale; the team one could only be added to or
   * deleted, so correcting a typo meant destroying the note and its date.
   */
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase
        .from("internal_notes")
        // updated_at is stamped by trg_internal_notes_updated, not here.
        .update({ body })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Note updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update note"),
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("internal_notes").update({ pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
      onError: (error: Error) => {
      toast.error(error.message || 'Could not pin that note');
    },
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
      onError: (error: Error) => {
      toast.error(error.message || 'Could not remove that note');
    },
});

  return { ...query, create, update, togglePin, remove };
}
