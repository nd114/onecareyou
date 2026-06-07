// Phase 1.4 — Encounter editor dialog + tab content.
import { useState, useMemo } from "react";
import { Plus, FileSignature, Loader2, ChevronRight, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useEncounters, type Encounter } from "@/hooks/useEncounters";
import { usePatientActionLog } from "@/hooks/usePatientActionLog";
import { useClinicalTemplates } from "@/hooks/useClinicalTemplates";
import { format } from "date-fns";

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
  const { encounters, isLoading, create, update, sign } = useEncounters(patientUserId);
  const { log } = usePatientActionLog(patientUserId);
  const { templates } = useClinicalTemplates("visit");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Encounter | null>(null);
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

  const handleSign = async (enc: Encounter) => {
    await sign.mutateAsync(enc.id);
    await log.mutateAsync({
      patient_user_id: patientUserId,
      action: "encounter_signed",
      summary: `Signed encounter from ${format(new Date(enc.occurred_at), "PP")}`,
      ref_table: "encounters",
      ref_id: enc.id,
    });
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
              <li key={enc.id} className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm capitalize">
                      {enc.visit_type.replace("_", " ")}
                    </span>
                    <Badge variant={enc.status === "signed" ? "default" : "outline"} className="text-[10px]">
                      {enc.status}
                    </Badge>
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
                      <Button variant="outline" size="sm" onClick={() => openEditor(enc)}>Edit</Button>
                      <Button size="sm" onClick={() => handleSign(enc)} className="gap-1">
                        <FileSignature className="h-3.5 w-3.5" /> Sign
                      </Button>
                    </>
                  )}
                  {enc.status === "signed" && (
                    <Button variant="ghost" size="sm" onClick={() => openEditor(enc)}>
                      View <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
