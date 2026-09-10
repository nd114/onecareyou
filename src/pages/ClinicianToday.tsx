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
  MailOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Panel, PanelEmpty, PanelGlyph, PanelHeader, PanelRow, PanelRows } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { useTriageInbox, type TriageItem } from "@/hooks/useTriageInbox";
import { useTriageBulkActions } from "@/hooks/useTriageBulkActions";
import { usePracticeTasks } from "@/hooks/usePracticeTasks";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { CreateTaskDialog } from "@/components/clinician/CreateTaskDialog";
import { SEOHead } from "@/components/seo/SEOHead";
import { ClinicianOnboardingCard } from "@/components/clinician/ClinicianOnboardingCard";
import { PatientLimitBanner } from "@/components/clinician/PatientLimitBanner";
import { useClinicianPatients } from "@/hooks/useClinicianPatients";
import { formatDayTime, formatWhen } from '@/lib/format-date';


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

const ClinicianToday = () => {
  const navigate = useNavigate();
  const { isClinician, isLoading: loadingProfile } = useClinicianProfile();
  const { items, isLoading, counts } = useTriageInbox();
  const { markAllMessagesRead, acknowledgeAlerts } = useTriageBulkActions();
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

      <main className="container py-4 sm:py-8 px-4 sm:px-6 max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header: the day itself does the orienting, so the date sits under
              the title instead of an icon tile competing with it. */}
          <header className="mb-8 flex flex-col gap-4 border-b border-primary/10 pb-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-primary">
                Today
              </h1>
              <p className="text-sm font-medium text-muted-foreground">
                {todayLabel} · Everything that needs you, in one queue.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-2 self-start md:self-auto">
              <Plus className="h-4 w-4" /> New task
            </Button>
          </header>

          {/* Onboarding + plan limits (merged in from the old Overview tab) */}
          <ClinicianOnboardingCard />
          <PatientLimitBanner patientCount={patients.length} />

          {/* Counters count the queue — what needs you now — which is not the
              same number as "all my open tasks" beside it. Each one is also
              the filter for that kind. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { key: "all", label: "Needs you now", value: counts.total, icon: Inbox, urgent: false },
              { key: "alert", label: "Alerts", value: counts.alerts, icon: AlertTriangle, urgent: true },
              { key: "message", label: "Messages", value: counts.messages, icon: MessageSquare, urgent: false },
              { key: "task", label: "Tasks", value: counts.tasks, icon: CheckSquare, urgent: false },
            ].map((c) => {
              const Icon = c.icon;
              const active = filter === c.key;
              const flag = c.urgent && c.value > 0;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key as any)}
                  aria-pressed={active}
                  className={`rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    active ? "border-primary ring-1 ring-primary/30" : "border-primary/10"
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {c.label}
                  </p>
                  <span className="mt-1 flex items-baseline gap-2">
                    <span
                      className={`font-display text-3xl ${flag ? "text-destructive" : "text-primary"}`}
                    >
                      {String(c.value).padStart(2, "0")}
                    </span>
                    {flag && <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />}
                  </span>
                </button>
              );
            })}
          </div>


          {/* Triage list */}
          <Panel>
            <PanelHeader eyebrow="Queue">
              <div className="flex flex-wrap gap-2">
                {counts.messages > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => markAllMessagesRead.mutate()}
                    disabled={markAllMessagesRead.isPending}
                  >
                    <MailOpen className="h-3.5 w-3.5" /> Mark all read
                  </Button>
                )}
                {counts.alerts > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => acknowledgeAlerts.mutate(undefined)}
                    disabled={acknowledgeAlerts.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge all alerts
                  </Button>
                )}
              </div>
            </PanelHeader>
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
                          {formatDayTime(t.due_at)}
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
