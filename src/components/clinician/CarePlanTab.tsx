import { useState } from "react";
import { format } from "date-fns";
import { Target, Plus, Trash2, Loader2, CheckCircle2, CircleDashed, MinusCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCarePlans } from "@/hooks/useCarePlans";
import { describeGoal, isMeasurable, scoreGoal } from "@/lib/fhir/care-plan";
import { VITAL_CONFIG, type VitalType } from "@/types/health";
import { cn } from "@/lib/utils";

interface Props {
  patientUserId: string;
  patientName: string;
  practiceId?: string | null;
}

interface DraftGoal {
  description: string;
  measureType: string;
  comparator: string;
  targetValue: string;
  dueDate: string;
}

const MEASURABLE_TYPES = Object.keys(VITAL_CONFIG) as VitalType[];

const NO_MEASURE = "__none__";

/**
 * The plan for this patient, and whether it is working.
 *
 * A goal that names a vital, a comparator and a number is scored against the
 * patient's own readings, so the clinician does not have to look it up. A goal
 * without a measure is still a goal — plenty of good clinical advice is not a
 * number — and it is shown without a fake score.
 *
 * Whether a goal was *achieved* stays a clinician's call. One reading crossing a
 * threshold is not sustained control, and the platform does not pretend
 * otherwise.
 */
export function CarePlanTab({ patientUserId, patientName, practiceId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { plans, isLoading, setStatus, setGoalAchievement } = useCarePlans(patientUserId);
  // The patient's readings, for scoring goals. Queried directly rather than
  // through useVitals, which reads the signed-in user's own — row policies scope
  // this to patients the clinician may see, as everywhere else.
  const { data: vitals = [] } = useQuery({
    queryKey: ["care-plan-readings", patientUserId],
    enabled: !!patientUserId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vitals")
        .select("type, value, secondary_value, unit, recorded_at")
        .eq("user_id", patientUserId)
        .order("recorded_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [goals, setGoals] = useState<DraftGoal[]>([
    { description: "", measureType: NO_MEASURE, comparator: "<", targetValue: "", dueDate: "" },
  ]);

  const usable = goals.filter((g) => g.description.trim());

  const create = async (status: "draft" | "active") => {
    if (!user || !title.trim()) return;
    setSaving(true);
    try {
      const { data: plan, error } = await (supabase as any)
        .from("fhir_care_plans")
        .insert({
          patient_user_id: patientUserId,
          practice_id: practiceId ?? null,
          title: title.trim(),
          description: description.trim() || null,
          status,
          intent: "plan",
          period_start: new Date().toISOString().slice(0, 10),
          period_end: periodEnd || null,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      if (usable.length > 0) {
        const { error: goalError } = await (supabase as any).from("fhir_care_goals").insert(
          usable.map((g, i) => {
            // A measure is all three parts or none — the constraint refuses
            // half a target, because half a target renders as a number with no
            // meaning.
            const measured = g.measureType !== NO_MEASURE && g.targetValue.trim() !== "";
            return {
              care_plan_id: plan.id,
              description: g.description.trim(),
              measure_type: measured ? g.measureType : null,
              target_comparator: measured ? g.comparator : null,
              target_value: measured ? Number(g.targetValue) : null,
              target_unit: measured ? VITAL_CONFIG[g.measureType as VitalType]?.unit : null,
              due_date: g.dueDate || null,
              sort_order: i,
            };
          }),
        );
        if (goalError) throw goalError;
      }

      qc.invalidateQueries({ queryKey: ["fhir-care-plans"] });
      toast.success(
        status === "active"
          ? `Care plan shared with ${patientName}`
          : "Care plan saved as a draft",
      );
      setOpen(false);
      setTitle(""); setDescription(""); setPeriodEnd("");
      setGoals([{ description: "", measureType: NO_MEASURE, comparator: "<", targetValue: "", dueDate: "" }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save that plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Care plan
          </h3>
          <p className="text-sm text-muted-foreground">
            What you and {patientName} are working towards. An active plan shows on their
            dashboard, scored against their own readings.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New plan</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New care plan</DialogTitle>
              <DialogDescription>
                A goal with a measurement is checked against {patientName}'s readings
                automatically. One without is shown as written.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                       placeholder="Diabetes control" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">What this is for (optional)</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
                          placeholder="Bring the HbA1c down and keep it there." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Review by (optional)</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>

              <div className="space-y-3 border-t pt-3">
                <Label className="text-xs">Goals</Label>
                {goals.map((g, i) => (
                  <div key={i} className="space-y-2 rounded-lg border p-3">
                    <div className="flex gap-2">
                      <Input
                        value={g.description}
                        placeholder="Get the HbA1c under 7%"
                        onChange={(e) =>
                          setGoals((p) => p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                        }
                      />
                      {goals.length > 1 && (
                        <Button variant="ghost" size="icon" className="shrink-0"
                                onClick={() => setGoals((p) => p.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-6">
                        <Select
                          value={g.measureType}
                          onValueChange={(v) =>
                            setGoals((p) => p.map((x, j) => (j === i ? { ...x, measureType: v } : x)))
                          }
                        >
                          <SelectTrigger><SelectValue placeholder="Measure" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_MEASURE}>Not measured</SelectItem>
                            {MEASURABLE_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{VITAL_CONFIG[t].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Select
                          value={g.comparator}
                          disabled={g.measureType === NO_MEASURE}
                          onValueChange={(v) =>
                            setGoals((p) => p.map((x, j) => (j === i ? { ...x, comparator: v } : x)))
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="<">below</SelectItem>
                            <SelectItem value="<=">at or below</SelectItem>
                            <SelectItem value=">">above</SelectItem>
                            <SelectItem value=">=">at or above</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number" step="0.1"
                          disabled={g.measureType === NO_MEASURE}
                          value={g.targetValue}
                          placeholder={
                            g.measureType !== NO_MEASURE
                              ? VITAL_CONFIG[g.measureType as VitalType]?.unit
                              : ""
                          }
                          onChange={(e) =>
                            setGoals((p) => p.map((x, j) => (j === i ? { ...x, targetValue: e.target.value } : x)))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Button variant="outline" size="sm" className="gap-1.5"
                        onClick={() => setGoals((p) => [...p, {
                          description: "", measureType: NO_MEASURE, comparator: "<",
                          targetValue: "", dueDate: "",
                        }])}>
                  <Plus className="h-3 w-3" /> Add goal
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => create("draft")} disabled={!title.trim() || saving}>
                Save draft
              </Button>
              <Button onClick={() => create("active")} disabled={!title.trim() || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Share with {patientName.split(" ")[0]}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No care plan for {patientName} yet. The readings, medications and appointments are
            all here — a plan is what says what they are for.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      {plan.title}
                      <Badge variant={plan.status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {plan.status}
                      </Badge>
                    </CardTitle>
                    {plan.description && <CardDescription>{plan.description}</CardDescription>}
                  </div>
                  <div className="flex gap-2">
                    {plan.status === "draft" && (
                      <Button size="sm" onClick={() => setStatus.mutate({ id: plan.id, status: "active" })}>
                        Share with patient
                      </Button>
                    )}
                    {plan.status === "active" && (
                      <>
                        <Button variant="outline" size="sm"
                                onClick={() => setStatus.mutate({ id: plan.id, status: "completed" })}>
                          Complete
                        </Button>
                        <Button variant="ghost" size="sm"
                                onClick={() => setStatus.mutate({ id: plan.id, status: "revoked" })}>
                          Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                {(plan.goals ?? []).map((goal) => {
                  const progress = scoreGoal(goal, vitals as never);
                  return (
                    <div key={goal.id} className="flex items-start gap-2.5">
                      {progress.met === true ? (
                        <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                      ) : progress.met === false ? (
                        <MinusCircle className="h-4 w-4 text-severity-high mt-0.5 shrink-0" />
                      ) : (
                        <CircleDashed className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{goal.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {isMeasurable(goal) && <>{describeGoal(goal)}. </>}
                          {progress.reason === "scored" && (
                            <span className={cn(progress.met ? "text-status-success" : "text-severity-high")}>
                              Latest {progress.latest}{progress.unit}
                              {progress.measuredAt && ` on ${format(new Date(progress.measuredAt), "d MMM")}`}
                            </span>
                          )}
                          {progress.reason === "no-readings" && "No readings to score this against."}
                          {progress.reason === "no-measure" && "Not measured — your judgement."}
                        </p>
                      </div>
                      <Select
                        value={goal.achievement_status}
                        onValueChange={(v) => setGoalAchievement.mutate({ id: goal.id, achievement: v })}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["in-progress","improving","worsening","no-change","achieved",
                            "sustaining","not-achieved","no-progress","not-attainable"].map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s.replace(/-/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
