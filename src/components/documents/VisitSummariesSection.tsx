import { useState } from "react";
import { Stethoscope, ChevronDown, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useVisitSummaries, type VisitSummary } from "@/hooks/useVisitSummaries";

/** SOAP headings, in the words a patient uses rather than the clinician's. */
const SECTIONS: { key: keyof VisitSummary; label: string }[] = [
  { key: "subjective", label: "What you described" },
  { key: "objective", label: "What was found" },
  { key: "assessment", label: "What it means" },
  { key: "plan", label: "What happens next" },
];

/**
 * Visit summaries, on the patient's Vault.
 *
 * A clinician recorded the visit and the patient could not read a word of it:
 * the surface did not exist. It sits above the documents because it answers the
 * question people actually arrive with after an appointment — what did the
 * doctor say? — and because the Vault is the patient's records, of which a file
 * is only one kind.
 */
export function VisitSummariesSection() {
  const { visits, addendaByVisit, isLoading } = useVisitSummaries();
  const [openId, setOpenId] = useState<string | null>(null);

  // Nothing to say when there are none: an empty block here would push the
  // documents down for every patient who has never had a visit recorded.
  if (isLoading || visits.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Stethoscope className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Visit summaries</h2>
        <Badge variant="secondary" className="text-[10px]">{visits.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Written by your clinician after a visit and shared with you. Ask them if anything here is
        unclear or does not match what you remember.
      </p>
      <div className="space-y-2">
        {visits.map((v) => (
          <Collapsible
            key={v.id}
            open={openId === v.id}
            onOpenChange={(o) => setOpenId(o ? v.id : null)}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm capitalize">
                        {v.visit_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(v.occurred_at), "d MMM yyyy")}
                      </span>
                    </div>
                    {v.chief_complaint && (
                      <p className="text-sm mt-1 truncate">{v.chief_complaint}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {[v.clinician_name, v.practice_name].filter(Boolean).join(" · ") ||
                        "Your care team"}
                    </p>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1 flex-shrink-0">
                      {openId === v.id ? "Hide" : "Read"}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${openId === v.id ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-3 space-y-3 border-t pt-3">
                  {SECTIONS.map(({ key, label }) => {
                    const value = v[key] as string | null;
                    if (!value) return null;
                    return (
                      <div key={key}>
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <p className="text-sm whitespace-pre-wrap mt-0.5">{value}</p>
                      </div>
                    );
                  })}
                  {v.follow_up_in_days != null && (
                    <div className="flex items-center gap-1.5 text-sm text-primary">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Follow up in {v.follow_up_in_days} day{v.follow_up_in_days === 1 ? "" : "s"}
                    </div>
                  )}
                  {!SECTIONS.some(({ key }) => v[key]) && v.follow_up_in_days == null && (
                    <p className="text-sm text-muted-foreground">
                      Your clinician recorded this visit without written notes.
                    </p>
                  )}

                  {/* Corrections made after the note was signed. Shown here
                      rather than folded into the text above, so it is clear
                      what was said at the time and what was added later. */}
                  {(addendaByVisit[v.id] ?? []).length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Added after this visit
                      </p>
                      {(addendaByVisit[v.id] ?? []).map((a) => (
                        <div key={a.id} className="rounded-lg bg-muted/40 p-3">
                          <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(a.created_at), "d MMM yyyy")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </section>
  );
}
