import { format } from "date-fns";
import { Target, CheckCircle2, CircleDashed, MinusCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCarePlans } from "@/hooks/useCarePlans";
import { useVitals } from "@/hooks/useVitals";
import { describeGoal, isMeasurable, scoreGoal } from "@/lib/fhir/care-plan";
import { cn } from "@/lib/utils";

/**
 * What the patient and their clinician are working towards.
 *
 * The rest of the dashboard shows fragments — readings, medications,
 * appointments. This is the sentence that says what they are for, and the only
 * place a patient can see whether it is working without asking someone.
 *
 * Goals with a measure are scored against the patient's own readings. Goals
 * without one are shown plainly, with no invented number: "walk more on most
 * days" is a real thing a clinician says and a fake percentage next to it would
 * be worse than nothing.
 */
export function CarePlanCard() {
  const { plans, isLoading } = useCarePlans();
  const { vitals } = useVitals();

  const active = plans.filter((p) => p.status === "active");
  if (isLoading || active.length === 0) return null;

  return (
    <>
      {active.map((plan) => {
        const goals = plan.goals ?? [];
        const scored = goals.map((g) => ({ goal: g, progress: scoreGoal(g, vitals as never) }));
        const measurable = scored.filter((s) => s.progress.reason === "scored");
        const met = measurable.filter((s) => s.progress.met).length;

        return (
          <Card key={plan.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                {plan.title}
              </CardTitle>
              {plan.description && (
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              )}
              {plan.period_end && (
                <p className="text-xs text-muted-foreground">
                  Through {format(new Date(plan.period_end), "MMMM yyyy")}
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-3">
              {measurable.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {met} of {measurable.length} on track
                    </span>
                  </div>
                  <Progress value={(met / measurable.length) * 100} className="h-1.5" />
                </div>
              )}

              <ul className="space-y-2">
                {scored.map(({ goal, progress }) => (
                  <li key={goal.id} className="flex items-start gap-2.5">
                    {progress.met === true ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                    ) : progress.met === false ? (
                      <MinusCircle className="h-4 w-4 text-severity-high mt-0.5 shrink-0" />
                    ) : (
                      <CircleDashed className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}

                    <div className="min-w-0">
                      <p className="text-sm">{goal.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {isMeasurable(goal) && <>Target: {describeGoal(goal)}. </>}
                        {progress.reason === "scored" && (
                          <span className={cn(progress.met ? "text-status-success" : "text-severity-high")}>
                            Latest {progress.latest}
                            {progress.unit}
                            {progress.measuredAt &&
                              ` on ${format(new Date(progress.measuredAt), "d MMM")}`}
                          </span>
                        )}
                        {progress.reason === "no-readings" && "No readings yet to check this against."}
                        {progress.reason === "no-measure" && goal.due_date &&
                          `By ${format(new Date(goal.due_date), "d MMM yyyy")}.`}
                      </p>
                    </div>

                    {goal.achievement_status === "achieved" && (
                      <Badge className="ml-auto text-[10px] bg-status-success/10 text-status-success border-status-success/20">
                        Achieved
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
