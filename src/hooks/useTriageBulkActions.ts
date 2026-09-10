import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Clearing the queue in one move.
 *
 * The per-row actions stay exactly as they were; this is the "I have read all
 * of these" gesture an email list has. Both writes are scoped to the signed-in
 * clinician's own rows, so a bulk action can never touch someone else's inbox,
 * and both leave the underlying records intact — read and acknowledged are
 * timestamps, not deletions.
 */
export function useTriageBulkActions() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["alert-logs"] });
    qc.invalidateQueries({ queryKey: ["triage-alerts"] });
    qc.invalidateQueries({ queryKey: ["message-threads"] });
    qc.invalidateQueries({ queryKey: ["messages"] });
  };

  const markAllMessagesRead = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("clinician_user_id", user.id)
        .neq("sender_user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("All messages marked as read");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not mark those messages as read"),
  });

  /** Every outstanding alert, or just the ones ticked. */
  const acknowledgeAlerts = useMutation({
    mutationFn: async (ids?: string[]) => {
      if (!user) throw new Error("Not authenticated");
      let q = supabase
        .from("alert_logs")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("clinician_user_id", user.id)
        .is("acknowledged_at", null);
      if (ids && ids.length > 0) q = q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Alerts acknowledged");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not acknowledge those alerts"),
  });

  return { markAllMessagesRead, acknowledgeAlerts };
}
