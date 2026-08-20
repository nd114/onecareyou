// Alert rules, managed as rules — not as an undifferentiated list of thresholds.
//
// The old list showed nine rows reading "Blood Pressure · Active · > 150 - 95"
// with no patient attached and no way to change anything: a clinician could not
// tell at a glance who any of them were for, and the only action was a
// destructive delete. This surface names the patient on every row, lets a rule
// be renamed and edited, and archives instead of erasing.
import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Users,
  MoreHorizontal,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Bell,
  User as UserIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreateAlertRuleDialog } from "@/components/clinician/CreateAlertRuleDialog";
import { BulkAlertRuleDialog } from "@/components/clinician/BulkAlertRuleDialog";
import { useAlertRules, type AlertRule } from "@/hooks/useAlertRules";

interface PatientOption {
  id: string;
  user_id: string;
  patient_name: string;
  patient_email?: string;
}

const VITAL_LABELS: Record<string, string> = {
  blood_pressure: "Blood pressure",
  systolic: "Systolic",
  diastolic: "Diastolic",
  heart_rate: "Heart rate",
  blood_glucose: "Blood glucose",
  glucose: "Blood glucose",
  weight: "Weight",
  temperature: "Temperature",
  oxygen_saturation: "Oxygen saturation",
};

const METHOD_LABELS: Record<string, string> = { push: "Push", email: "Email", sms: "SMS" };

function vitalLabel(vital: string) {
  return VITAL_LABELS[vital] ?? vital.replace(/_/g, " ");
}

function describeThreshold(rule: AlertRule) {
  const vital = vitalLabel(rule.vital_type);
  if (rule.condition === "outside_range" && rule.threshold_secondary !== null) {
    return `${vital} outside ${rule.threshold_value}–${rule.threshold_secondary}`;
  }
  return `${vital} ${rule.condition === "below" ? "below" : "above"} ${rule.threshold_value}`;
}

type StatusFilter = "active" | "paused" | "archived" | "all";

export function AlertRulesManager({ patients }: { patients: PatientOption[] }) {
  const { allAlertRules, deleteAlertRule, toggleAlertRule, archiveAlertRule } = useAlertRules();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [vital, setVital] = useState<string>("all");
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AlertRule | null>(null);

  const nameFor = useMemo(() => {
    const map = new Map<string, string>();
    patients.forEach((p) => map.set(p.user_id, p.patient_name || "Unnamed patient"));
    return (userId: string) => map.get(userId) ?? "Patient no longer connected";
  }, [patients]);

  const vitalOptions = useMemo(
    () => Array.from(new Set(allAlertRules.map((r) => r.vital_type))).sort(),
    [allAlertRules],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allAlertRules
      .filter((r) => {
        if (status === "active") return r.is_active && !r.archived_at;
        if (status === "paused") return !r.is_active && !r.archived_at;
        if (status === "archived") return !!r.archived_at;
        return true;
      })
      .filter((r) => vital === "all" || r.vital_type === vital)
      .filter((r) => {
        if (!q) return true;
        return [r.label ?? "", nameFor(r.patient_user_id), vitalLabel(r.vital_type), r.condition]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => nameFor(a.patient_user_id).localeCompare(nameFor(b.patient_user_id)));
  }, [allAlertRules, status, vital, query, nameFor]);

  const counts = useMemo(
    () => ({
      active: allAlertRules.filter((r) => r.is_active && !r.archived_at).length,
      paused: allAlertRules.filter((r) => !r.is_active && !r.archived_at).length,
      archived: allAlertRules.filter((r) => !!r.archived_at).length,
    }),
    [allAlertRules],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base sm:text-lg">Alert rules</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {counts.active} active · {counts.paused} paused · {counts.archived} archived
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <BulkAlertRuleDialog
            trigger={
              <Button variant="outline" size="sm" disabled={patients.length === 0}>
                <Users className="h-4 w-4 mr-2" />
                Set for several
              </Button>
            }
            patients={patients}
          />
          <CreateAlertRuleDialog
            trigger={
              <Button size="sm" className="gradient-primary border-0" disabled={patients.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                New rule
              </Button>
            }
            patients={patients}
          />
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient, rule name or vital…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vital} onValueChange={setVital}>
            <SelectTrigger className="sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vitals</SelectItem>
              {vitalOptions.map((v) => (
                <SelectItem key={v} value={v}>
                  {vitalLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {allAlertRules.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No alert rules yet</h3>
            <p className="text-sm text-muted-foreground">
              Create rules to be told when a patient's readings cross a threshold.
            </p>
            {patients.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                You need connected patients to create alert rules.
              </p>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No rules match this search or filter.
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((rule) => (
              <li key={rule.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 text-sm font-medium truncate">
                        <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {nameFor(rule.patient_user_id)}
                      </span>
                      {rule.archived_at ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : (
                        <Badge variant={rule.is_active ? "default" : "secondary"}>
                          {rule.is_active ? "Active" : "Paused"}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {METHOD_LABELS[rule.alert_method] ?? rule.alert_method}
                      </Badge>
                    </div>
                    {rule.label && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{rule.label}</p>
                    )}
                    <p
                      className={`text-sm mt-1 ${rule.archived_at ? "text-muted-foreground line-through" : ""}`}
                    >
                      {describeThreshold(rule)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!rule.archived_at && (
                      <Switch
                        checked={rule.is_active ?? false}
                        onCheckedChange={(checked) =>
                          toggleAlertRule.mutate({ id: rule.id, is_active: checked })
                        }
                        aria-label={rule.is_active ? "Pause rule" : "Activate rule"}
                      />
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Rule actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-background border">
                        {!rule.archived_at && (
                          <DropdownMenuItem onSelect={() => setEditing(rule)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() =>
                            archiveAlertRule.mutate({ id: rule.id, archived: !rule.archived_at })
                          }
                        >
                          {rule.archived_at ? (
                            <>
                              <ArchiveRestore className="h-4 w-4 mr-2" />
                              Restore
                            </>
                          ) : (
                            <>
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setPendingDelete(rule)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Edit */}
      {editing && (
        <CreateAlertRuleDialog
          patients={patients}
          rule={editing}
          selectedPatientId={editing.patient_user_id}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      )}

      {/* Delete is destructive and unrecoverable — archive is the default path. */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${describeThreshold(pendingDelete)}" for ${nameFor(pendingDelete.patient_user_id)} will be removed for good. Archive it instead if you may want it back.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteAlertRule.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
