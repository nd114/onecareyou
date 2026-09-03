// Phase 1.4 — Encounter editor dialog + tab content.
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileSignature, Loader2, ChevronRight, FileText, Mic, Eye, EyeOff, FileAudio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { EncounterAddenda } from "./EncounterAddenda";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useEncounters, type Encounter } from "@/hooks/useEncounters";
import { EncounterScribePanel } from "@/components/clinician/EncounterScribePanel";
import { usePatientActionLog } from "@/hooks/usePatientActionLog";
import { useClinicalTemplates } from "@/hooks/useClinicalTemplates";
import { format } from "date-fns";
import { useAppointments } from "@/hooks/useAppointments";
import { toast } from "sonner";

interface Props {
  patientUserId: string;
  patientName: string;
}

const VISIT_TYPES = [
  { value: "follow_up", label: "Follow-up" },
  { value: "new_patient", label: "New patient" },
  { value: "annual", label: "Annual" },
  { value: "acute", label: "Acute / sick visit" },
  { value: "telehealth", label: "Telehealth" },
  { value: "procedure", label: "Procedure" },
];

export function EncountersTab({ patientUserId, patientName }: Props) {
  const { encounters, isLoading, create, update, sign, setShared } = useEncounters(patientUserId);
  const { log } = usePatientActionLog(patientUserId);
  const { templates } = useClinicalTemplates("visit");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Encounter | null>(null);
  const [scribeFor, setScribeFor] = useState<Encounter | null>(null);
  const [signing, setSigning] = useState<Encounter | null>(null);
  const [shareOnSign, setShareOnSign] = useState(true);
  const [bookFollowUp, setBookFollowUp] = useState(true);
  const { schedule } = useAppointments(patientUserId);

  // Which of these encounters began as a dictation. A dictation row is
  // readable only by the clinician who recorded it, so a colleague simply gets
  // no rows back and sees no marker — which is the right answer, not a bug.
  const encounterIds = useMemo(() => encounters.map((e) => e.id), [encounters]);
  const { data: fromDictation } = useQuery({
    queryKey: ["encounter-dictations", patientUserId, encounterIds.length],
    enabled: encounterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinician_dictations")
        .select("encounter_id")
        .in("encounter_id", encounterIds);
      if (error) return new Set<string>();
      return new Set<string>((data ?? []).map((r: any) => r.encounter_id));
    },
  });
  const [draft, setDraft] = useState({
    visit_type: "follow_up",
    chief_complaint: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    follow_up_in_days: "",
  });

  const resetDraft = () =>
    setDraft({
      visit_type: "follow_up",
      chief_complaint: "",
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      follow_up_in_days: "",
    });

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const b = (t.body || {}) as any;
    setDraft((d) => ({
      ...d,
      subjective: b.subjective ?? d.subjective,
      objective: b.objective ?? d.objective,
      assessment: b.assessment ?? d.assessment,
      plan: b.plan ?? d.plan,
    }));
  };

  const handleSave = async () => {
    const payload: any = {
      patient_user_id: patientUserId,
      visit_type: draft.visit_type,
      chief_complaint: draft.chief_complaint || null,
      subjective: draft.subjective || null,
      objective: draft.objective || null,
      assessment: draft.assessment || null,
      plan: draft.plan || null,
      follow_up_in_days: draft.follow_up_in_days ? Number(draft.follow_up_in_days) : null,
    };
    if (active) {
      await update.mutateAsync({ id: active.id, ...payload });
    } else {
      const created = await create.mutateAsync(payload);
      await log.mutateAsync({
        patient_user_id: patientUserId,
        action: "encounter_started",
        summary: `Started ${payload.visit_type.replace("_", " ")} encounter`,
        ref_table: "encounters",
        ref_id: created.id,
      });
    }
    setOpen(false);
    setActive(null);
    resetDraft();
  };

  // Signing releases the summary to the patient, so it asks rather than
  // assumes — and says which way it is about to go before it goes.
  const handleSign = async () => {
    if (!signing) return;
    const enc = signing;
    await sign.mutateAsync({ id: enc.id, sharedWithPatient: shareOnSign });

    // "Review in six months" was being collected and going nowhere: nothing read
    // follow_up_in_days and nothing ever wrote follow_up_task_id. Now that
    // appointments exist, the follow-up is raised here — as `proposed`, because
    // a time nobody has agreed is not a booking. The patient cannot confirm it
    // themselves (they read appointments, they do not write them), so the card
    // on their side says the clinic will confirm rather than implying they can.
    if (bookFollowUp && enc.follow_up_in_days) {
      const when = new Date();
      when.setDate(when.getDate() + enc.follow_up_in_days);
      try {
        await schedule.mutateAsync({
          patientUserId,
          clinicianUserId: enc.clinician_user_id,
          practiceId: enc.practice_id,
          status: "proposed",
          description: `Follow-up after ${enc.visit_type.replace(/_/g, " ")} on ${format(new Date(enc.occurred_at), "d MMM yyyy")}`,
          visitType: "Follow-up",
          start: when.toISOString(),
          end: new Date(when.getTime() + 30 * 60000).toISOString(),
        });
      } catch {
        // Signing already succeeded; a failed booking must not undo it or look
        // like the note did not sign.
        toast.error("The note was signed, but the follow-up could not be booked.");
      }
    }
    await log.mutateAsync({
      patient_user_id: patientUserId,
      action: "encounter_signed",
      summary: `Signed encounter from ${format(new Date(enc.occurred_at), "PP")}${
        shareOnSign ? " and shared it with the patient" : " without sharing it with the patient"
      }`,
      ref_table: "encounters",
      ref_id: enc.id,
    });
    setSigning(null);
    setShareOnSign(true);
    setBookFollowUp(true);
  };

  const openEditor = (enc?: Encounter) => {
    if (enc) {
      setActive(enc);
      setDraft({
        visit_type: enc.visit_type,
        chief_complaint: enc.chief_complaint ?? "",
        subjective: enc.subjective ?? "",
        objective: enc.objective ?? "",
        assessment: enc.assessment ?? "",
        plan: enc.plan ?? "",
        follow_up_in_days: enc.follow_up_in_days?.toString() ?? "",
      });
    } else {
      setActive(null);
      resetDraft();
    }
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Encounters
          </CardTitle>
          <CardDescription>Visit notes for {patientName}</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openEditor()} className="gap-2">
              <Plus className="h-4 w-4" /> New encounter
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{active ? "Edit encounter" : "New encounter"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Visit type</Label>
                  <Select value={draft.visit_type} onValueChange={(v) => setDraft({ ...draft, visit_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISIT_TYPES.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {templates.length > 0 && (
                  <div>
                    <Label>Apply template</Label>
                    <Select onValueChange={applyTemplate}>
                      <SelectTrigger><SelectValue placeholder="Optional…" /></SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div>
                <Label>Chief complaint</Label>
                <Input value={draft.chief_complaint} onChange={(e) => setDraft({ ...draft, chief_complaint: e.target.value })} />
              </div>
              {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
                <div key={k}>
                  <Label className="capitalize">{k}</Label>
                  <Textarea
                    rows={3}
                    value={(draft as any)[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <Label>Follow-up in (days)</Label>
                <Input
                  type="number" min={0}
                  value={draft.follow_up_in_days}
                  onChange={(e) => setDraft({ ...draft, follow_up_in_days: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {active ? "Save changes" : "Start encounter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : encounters.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No encounters recorded yet. Start one to capture today's visit.
          </div>
        ) : (
          <ul className="divide-y">
            {encounters.map((enc) => (
              <li key={enc.id} className="p-4">
                <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm capitalize">
                      {enc.visit_type.replace("_", " ")}
                    </span>
                    <Badge variant={enc.status === "signed" ? "default" : "outline"} className="text-[10px]">
                      {enc.status}
                    </Badge>
                    {fromDictation?.has(enc.id) && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <FileAudio className="h-2.5 w-2.5" />
                        From a dictation
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(enc.occurred_at), "PP")}
                    </span>
                  </div>
                  {enc.chief_complaint && (
                    <div className="text-sm mt-1">{enc.chief_complaint}</div>
                  )}
                  {enc.assessment && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      A: {enc.assessment}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {enc.status === "in_progress" && (
                    <>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => setScribeFor(enc)}>
                        <Mic className="h-3.5 w-3.5" /> Scribe
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditor(enc)}>Edit</Button>
                      <Button size="sm" onClick={() => { setSigning(enc); setShareOnSign(true); }} className="gap-1">
                        <FileSignature className="h-3.5 w-3.5" /> Sign
                      </Button>
                    </>
                  )}
                  {enc.status === "signed" && (
                    <>
                      {/* Whether the patient can read this is part of the
                          record's state, so it is shown, not buried. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => setShared.mutate({ id: enc.id, shared: !enc.shared_with_patient })}
                        title={
                          enc.shared_with_patient
                            ? "Shared with the patient — click to stop sharing"
                            : "Not shared with the patient — click to share"
                        }
                      >
                        {enc.shared_with_patient ? (
                          <><Eye className="h-3.5 w-3.5" /> Shared</>
                        ) : (
                          <><EyeOff className="h-3.5 w-3.5" /> Not shared</>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditor(enc)}>
                        View <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </>
                  )}
                </div>
                </div>

                {/* Once signed, the database refuses edits to the note itself.
                    Corrections append here, attributed and dated. */}
                <EncounterAddenda encounterId={enc.id} signedAt={enc.signed_at} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={!!signing} onOpenChange={(o) => !o && setSigning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign this encounter?</AlertDialogTitle>
            <AlertDialogDescription>
              Signing is final: the note cannot be edited afterwards, and corrections go in an
              addendum that is dated and attributed. {patientName} will be able to read the
              summary — the reason for the visit, what you found, your assessment and the plan.
              The ambient transcript, the codes and anything still in draft are never shared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
            <Checkbox
              checked={shareOnSign}
              onCheckedChange={(v) => setShareOnSign(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              Share this summary with {patientName}
              <span className="block text-xs text-muted-foreground mt-0.5">
                Leave this on unless the note needs discussing in person first. You can change
                it later either way.
              </span>
            </span>
          </label>
          {signing?.follow_up_in_days ? (
            <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
              <Checkbox
                checked={bookFollowUp}
                onCheckedChange={(v) => setBookFollowUp(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                Book the follow-up in {signing.follow_up_in_days} days
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Proposed for{" "}
                  {format(
                    new Date(Date.now() + signing.follow_up_in_days * 86400000),
                    "EEEE d MMMM",
                  )}
                  . {patientName} sees it as a suggested time; confirm it from the
                  Appointments tab once a slot is agreed.
                </span>
              </span>
            </label>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSign} disabled={sign.isPending}>
              {sign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!scribeFor} onOpenChange={(o) => !o && setScribeFor(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ambient scribe — {patientName}</DialogTitle>
          </DialogHeader>
          {scribeFor && (
            <EncounterScribePanel
              encounter={scribeFor}
              onApply={(fields) => {
                setScribeFor(null);
                setActive(scribeFor);
                setDraft({
                  visit_type: scribeFor.visit_type,
                  chief_complaint: fields.chief_complaint,
                  subjective: fields.subjective,
                  objective: fields.objective,
                  assessment: fields.assessment,
                  plan: fields.plan,
                  follow_up_in_days: fields.follow_up_in_days,
                });
                setOpen(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
