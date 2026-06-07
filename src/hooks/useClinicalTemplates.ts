// Phase 2.1 — Per-practice clinical templates (visit, assessment, guidance).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePractice } from "@/hooks/usePractice";
import { toast } from "sonner";

export type TemplateKind = "visit" | "assessment" | "guidance" | "plan";

export interface ClinicalTemplate {
  id: string;
  practice_id: string | null;
  owner_user_id: string | null;
  kind: TemplateKind;
  specialty: string | null;
  name: string;
  description: string | null;
  body: Record<string, any>;
  is_system: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export function useClinicalTemplates(kind?: TemplateKind) {
  const { user } = useAuth();
  const { currentPractice: practice } = usePractice();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["clinical-templates", kind ?? "all", practice?.id ?? null],
    queryFn: async () => {
      let q = (supabase as any)
        .from("clinical_templates")
        .select("*")
        .eq("is_archived", false)
        .order("name");
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClinicalTemplate[];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (
      input: Pick<ClinicalTemplate, "name" | "kind"> &
        Partial<Pick<ClinicalTemplate, "description" | "body" | "specialty">>,
    ) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await (supabase as any)
        .from("clinical_templates")
        .insert({
          owner_user_id: user.id,
          practice_id: practice?.id ?? null,
          body: {},
          ...input,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ClinicalTemplate;
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["clinical-templates"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not save template"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("clinical_templates")
        .update({ is_archived: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clinical-templates"] }),
  });

  return { templates: list.data ?? [], isLoading: list.isLoading, create, remove };
}
