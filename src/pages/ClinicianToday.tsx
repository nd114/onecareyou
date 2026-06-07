// Phase 1.3 — Today / Triage Inbox.
//
// Single ranked queue combining unread messages, unacknowledged alerts,
// and tasks that are due/overdue. One-tap actions per row so the
// clinician's workday surface is a list of "do this next" rather than
// a generic dashboard.

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Inbox,
  MessageSquare,
  AlertTriangle,
  CheckSquare,
  Clock,
  Plus,
  User,
  ChevronRight,
  Loader2,
  CheckCircle2,
  CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { useTriageInbox, type TriageItem } from "@/hooks/useTriageInbox";
import { usePracticeTasks } from "@/hooks/usePracticeTasks";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { CreateTaskDialog } from "@/components/clinician/CreateTaskDialog";
import { SEOHead } from "@/components/seo/SEOHead";

function kindIcon(kind: TriageItem["kind"]) {
  if (kind === "message") return MessageSquare;
  if (kind === "alert") return AlertTriangle;
  return CheckSquare;
}

function kindLabel(kind: TriageItem["kind"]) {
  if (kind === "message") return "Message";
  if (kind === "alert") return "Alert";
  return "Task";
}

function priorityBadge(p: TriageItem["priority"]) {
  if (p === 3) return { label: "Urgent", className: "bg-destructive text-destructive-foreground" };
  if (p === 2) return { label: "High", className: "bg-orange-500 text-white" };
  if (p === 1) return { label: "Normal", className: "bg-muted text-muted-foreground" };
  return { label: "Info", className: "bg-muted text-muted-foreground" };
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

const ClinicianToday = () => {
  const navigate = useNavigate();
  const { isClinician, isLoading: loadingProfile } = useClinicianProfile();
  const { items, isLoading, counts } = useTriageInbox();
  const { tasks, update, isLoading: loadingTasks } = usePracticeTasks({ scope: "mine" });
  const [filter, setFilter] = useState<"all" | "message" | "alert" | "task">("all");
  const [createOpen, setCreateOpen] = useState(false);

  useSessionTimeout();

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "open" || t.status === "in_progress"),
    [tasks],
  );

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-muted/30">
        <ClinicianHeader />
        <main className="container py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!isClinician) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead title="Today · OneCare" noIndex />
      <ClinicianHeader />
      <SectionTabs section="today" variant="clinician" />

      <main className="container py-4 sm:py-8 px-4 sm:px-6 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Inbox className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">
                  Today
                </h1>
                <p className="text-muted-foreground text-sm">
                  Everything that needs you, in one queue.
                </p>
              </div>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New task
            </Button>
          </div>

          {/* Summary chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { key: "all", label: "Total", value: counts.total, icon: Inbox },
              { key: "alert", label: "Alerts", value: counts.alerts, icon: AlertTriangle },
              { key: "message", label: "Messages", value: counts.messages, icon: MessageSquare },
              { key: "task", label: "Tasks", value: counts.tasks, icon: CheckSquare },
            ].map((c) => {
              const Icon = c.icon;
              const active = filter === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key as any)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {c.label}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{c.value}</div>
                </button>
              );
            })}
          </div>

          {/* Triage list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <CheckCircle2 className="h-8 w-8 text-primary/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    You're caught up. Nothing waiting on you.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((item) => {
                    const Icon = kindIcon(item.kind);
                    const pb = priorityBadge(item.priority);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => navigate(item.actionRoute)}
                          className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex items-start gap-3"
                        >
                          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                {kindLabel(item.kind)}
                              </span>
                              <Badge className={pb.className + " text-[10px] px-1.5 py-0"}>
                                {pb.label}
                              </Badge>
                              {item.patientName && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {item.patientName}
                                </span>
                              )}
                            </div>
                            <div className="font-medium text-sm truncate">
                              {item.title}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {item.subtitle}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatWhen(item.occurredAt)}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground self-center flex-shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Open tasks panel */}
          <Card className="mt-6">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">My tasks</CardTitle>
              <Badge variant="outline">{openTasks.length} open</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {loadingTasks ? (
                <div className="p-6 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : openTasks.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No open tasks. Click "New task" to add one.
                </div>
              ) : (
                <ul className="divide-y">
                  {openTasks.map((t) => (
                    <li key={t.id} className="p-4 flex items-start gap-3">
                      <button
                        onClick={() => update.mutate({ id: t.id, status: "done" })}
                        className="mt-0.5 h-5 w-5 rounded border border-muted-foreground/40 hover:border-primary hover:bg-primary/10 flex items-center justify-center transition-colors flex-shrink-0"
                        aria-label="Mark done"
                      >
                        <CheckCircle2 className="h-4 w-4 text-transparent hover:text-primary" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{t.title}</div>
                        {t.notes && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {t.notes}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          {t.due_at && (
                            <span className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />
                              {new Date(t.due_at).toLocaleString()}
                            </span>
                          )}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {t.priority}
                          </Badge>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

export default ClinicianToday;
