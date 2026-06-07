// Phase 1.5 — Practice tasks CRUD hook.
//
// Surfaces tasks assigned to the current clinician (or, for managers,
// the whole practice). RLS in the database is the source of truth — this
// hook just shapes the query and exposes mutations.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type TaskStatus = "open" | "in_progress" | "done" | "snoozed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskSource = "manual" | "alert" | "guidance" | "message" | "system";

export interface PracticeTask {
  id: string;
  practice_id: string;
  assignee_user_id: string;
  created_by: string;
  patient_user_id: string | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  snoozed_until: string | null;
  source: TaskSource;
  source_alert_id: string | null;
  source_guidance_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePracticeTaskInput {
  practice_id: string;
  assignee_user_id?: string; // defaults to current user
  patient_user_id?: string | null;
  title: string;
  notes?: string | null;
  due_at?: string | null;
  priority?: TaskPriority;
  source?: TaskSource;
  source_alert_id?: string | null;
  source_guidance_id?: string | null;
}

interface UsePracticeTasksOptions {
  scope?: "mine" | "practice"; // mine = assigned to me, practice = all visible
  includeDone?: boolean;
}

export function usePracticeTasks(opts: UsePracticeTasksOptions = {}) {
  const { scope = "mine", includeDone = false } = opts;
  const { user } = useAuth();
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ["practice-tasks", user?.id, scope, includeDone],
    queryFn: async () => {
      if (!user) return [] as PracticeTask[];
      let q = supabase
        .from("practice_tasks")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (scope === "mine") q = q.eq("assignee_user_id", user.id);
      if (!includeDone) q = q.in("status", ["open", "in_progress", "snoozed"]);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PracticeTask[];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const create = useMutation({
    mutationFn: async (input: CreatePracticeTaskInput) => {
      if (!user) throw new Error("Not authenticated");
      const payload = {
        practice_id: input.practice_id,
        assignee_user_id: input.assignee_user_id ?? user.id,
        created_by: user.id,
        patient_user_id: input.patient_user_id ?? null,
        title: input.title,
        notes: input.notes ?? null,
        due_at: input.due_at ?? null,
        priority: input.priority ?? "normal",
        source: input.source ?? "manual",
        source_alert_id: input.source_alert_id ?? null,
        source_guidance_id: input.source_guidance_id ?? null,
      };
      const { data, error } = await supabase
        .from("practice_tasks")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as PracticeTask;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["practice-tasks"] });
      toast.success("Task created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create task"),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...changes }: Partial<PracticeTask> & { id: string }) => {
      const patch: Record<string, any> = { ...changes };
      if (changes.status === "done" && !changes.completed_at) {
        patch.completed_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from("practice_tasks")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as PracticeTask;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["practice-tasks"] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not update task"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("practice_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["practice-tasks"] }),
  });

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    refetch: tasksQuery.refetch,
    create,
    update,
    remove,
  };
}
