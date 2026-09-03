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
import { Panel, PanelEmpty, PanelGlyph, PanelHeader, PanelRow, PanelRows } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { useTriageInbox, type TriageItem } from "@/hooks/useTriageInbox";
import { usePracticeTasks } from "@/hooks/usePracticeTasks";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { CreateTaskDialog } from "@/components/clinician/CreateTaskDialog";
import { SEOHead } from "@/components/seo/SEOHead";
import { ClinicianOnboardingCard } from "@/components/clinician/ClinicianOnboardingCard";
import { PatientLimitBanner } from "@/components/clinician/PatientLimitBanner";
import { useClinicianPatients } from "@/hooks/useClinicianPatients";


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
  const { patients } = useClinicianPatients();

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

          {/* Onboarding + plan limits (merged in from the old Overview tab) */}
          <ClinicianOnboardingCard />
          <PatientLimitBanner patientCount={patients.length} />



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
          <Panel>
            <PanelHeader eyebrow="Queue" />
            {isLoading ? (
              <PanelEmpty>
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              </PanelEmpty>
            ) : filtered.length === 0 ? (
              <PanelEmpty className="py-10">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary/50" />
                You're caught up. Nothing waiting on you.
              </PanelEmpty>
            ) : (
              <PanelRows>
                {filtered.map((item) => {
                  const Icon = kindIcon(item.kind);
                  const pb = priorityBadge(item.priority);
                  return (
                    <PanelRow
                      key={item.id}
                      onSelect={() => navigate(item.actionRoute)}
                      selectLabel={`${kindLabel(item.kind)}: ${item.title}`}
                      glyph={
                        <PanelGlyph
                          tone={item.priority === 3 ? "alert" : item.priority === 2 ? "attention" : "muted"}
                        >
                          <Icon />
                        </PanelGlyph>
                      }
                      overline={
                        <>
                          <span className="uppercase tracking-wide">{kindLabel(item.kind)}</span>
                          <Badge className={pb.className + " px-1.5 py-0 text-[10px]"}>
                            {pb.label}
                          </Badge>
                          {item.patientName && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {item.patientName}
                            </span>
                          )}
                        </>
                      }
                      label={item.title}
                      detail={item.subtitle}
                      trailing={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    >
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatWhen(item.occurredAt)}
                      </span>
                    </PanelRow>
                  );
                })}
              </PanelRows>
            )}
          </Panel>

          {/* Open tasks panel */}
          <Panel className="mt-6">
            <PanelHeader eyebrow="My tasks">
              <Badge variant="outline">{openTasks.length} open</Badge>
            </PanelHeader>
            {loadingTasks ? (
              <PanelEmpty>
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
              </PanelEmpty>
            ) : openTasks.length === 0 ? (
              <PanelEmpty>No open tasks. Click "New task" to add one.</PanelEmpty>
            ) : (
              <PanelRows>
                {openTasks.map((t) => (
                  <PanelRow
                    key={t.id}
                    className="items-start"
                    glyph={
                      <button
                        onClick={() => update.mutate({ id: t.id, status: "done" })}
                        className="group mt-0.5 grid h-7 w-7 place-items-center rounded-full border border-muted-foreground/30 transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Mark "${t.title}" done`}
                      >
                        <CheckCircle2 className="h-4 w-4 text-transparent transition-colors group-hover:text-primary" />
                      </button>
                    }
                    label={t.title}
                  >
                    {t.notes && (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {t.notes}
                      </span>
                    )}
                    <span className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      {t.due_at && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {new Date(t.due_at).toLocaleString()}
                        </span>
                      )}
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {t.priority}
                      </Badge>
                    </span>
                  </PanelRow>
                ))}
              </PanelRows>
            )}
          </Panel>
        </motion.div>
      </main>

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

export default ClinicianToday;
