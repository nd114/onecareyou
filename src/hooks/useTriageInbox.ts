// Phase 1.3 — Triage Inbox aggregator.
//
// Combines the clinician's most important "something needs you" signals
// into a single ranked queue:
//   - Unread patient messages
//   - Unacknowledged vital/care alerts
//   - Open practice tasks that are due/overdue
//
// Each item has a normalized shape so the Today page renders one list.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMessageThreads } from "@/hooks/useMessages";
import { usePracticeTasks } from "@/hooks/usePracticeTasks";
import { useClinicianPatients } from "@/hooks/useClinicianPatients";

export type TriageKind = "message" | "alert" | "task";

export interface TriageItem {
  id: string;
  kind: TriageKind;
  title: string;
  subtitle: string;
  patientUserId: string | null;
  patientName: string | null;
  occurredAt: string; // ISO
  priority: 0 | 1 | 2 | 3; // 3 = urgent, 0 = informational
  actionRoute: string;
  raw?: unknown;
}

export function useTriageInbox() {
  const { user } = useAuth();
  const { patients } = useClinicianPatients();
  const { data: threads = [] } = useMessageThreads("clinician");
  const { tasks } = usePracticeTasks({ scope: "mine" });

  // Patient name lookup (user_id -> display name)
  const patientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) {
      const display =
        (p as any).profile?.name ||
        (p as any).name ||
        (p as any).email ||
        "Patient";
      m.set(p.user_id, display);
    }
    return m;
  }, [patients]);

  // Unacknowledged alert logs for this clinician
  const alertsQuery = useQuery({
    queryKey: ["triage-alerts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("alert_logs")
        .select("id, patient_user_id, alert_type, message, sent_at, acknowledged_at")
        .eq("clinician_user_id", user.id)
        .is("acknowledged_at", null)
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const items: TriageItem[] = useMemo(() => {
    const out: TriageItem[] = [];

    // Messages
    for (const t of threads) {
      if (!t.unread) continue;
      out.push({
        id: `msg-${t.counterpartyId}`,
        kind: "message",
        title: `${t.unread} new message${t.unread > 1 ? "s" : ""}`,
        subtitle: t.latest?.body?.slice(0, 120) ?? "Patient sent a message",
        patientUserId: t.counterpartyId,
        patientName: patientNameById.get(t.counterpartyId) ?? "Patient",
        occurredAt: t.latest?.created_at ?? new Date().toISOString(),
        priority: 2,
        actionRoute: "/clinician/messages",
        raw: t,
      });
    }

    // Alerts
    for (const a of alertsQuery.data ?? []) {
      const priority: TriageItem["priority"] =
        a.alert_type?.includes("critical") || a.alert_type?.includes("urgent") ? 3 : 2;
      out.push({
        id: `alert-${a.id}`,
        kind: "alert",
        title: a.alert_type?.replace(/_/g, " ") || "Patient alert",
        subtitle: a.message ?? "Threshold crossed",
        patientUserId: a.patient_user_id,
        patientName: patientNameById.get(a.patient_user_id) ?? "Patient",
        occurredAt: a.sent_at,
        priority,
        actionRoute: "/clinician/alerts",
        raw: a,
      });
    }

    // Tasks — only those due today or overdue, or with no due date but high priority
    const now = Date.now();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    for (const t of tasks) {
      if (t.status === "done" || t.status === "cancelled") continue;
      if (t.status === "snoozed" && t.snoozed_until && new Date(t.snoozed_until).getTime() > now) {
        continue;
      }
      const due = t.due_at ? new Date(t.due_at).getTime() : null;
      const isUrgent = t.priority === "urgent" || t.priority === "high";
      const isDueSoon = due !== null && due <= endOfToday.getTime();
      if (!isUrgent && !isDueSoon) continue;

      const priority: TriageItem["priority"] =
        t.priority === "urgent" ? 3 : t.priority === "high" ? 2 : 1;
      out.push({
        id: `task-${t.id}`,
        kind: "task",
        title: t.title,
        subtitle:
          due && due < now
            ? `Overdue · ${new Date(due).toLocaleDateString()}`
            : due
            ? `Due ${new Date(due).toLocaleDateString()}`
            : "No due date",
        patientUserId: t.patient_user_id,
        patientName: t.patient_user_id
          ? patientNameById.get(t.patient_user_id) ?? null
          : null,
        occurredAt: t.created_at,
        priority,
        actionRoute: "/clinician/today",
        raw: t,
      });
    }

    // Sort: priority desc, then occurredAt desc
    out.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    });

    return out;
  }, [threads, alertsQuery.data, tasks, patientNameById]);

  return {
    items,
    isLoading: alertsQuery.isLoading,
    counts: {
      total: items.length,
      messages: items.filter((i) => i.kind === "message").length,
      alerts: items.filter((i) => i.kind === "alert").length,
      tasks: items.filter((i) => i.kind === "task").length,
      urgent: items.filter((i) => i.priority === 3).length,
    },
  };
}
