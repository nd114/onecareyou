import { useMemo, useState } from "react";
import { Loader2, FileCheck2, Search, Quote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicianPatients } from "@/hooks/useClinicianPatients";
import { resolveVitalConfig, resolveVitalType } from "@/types/health";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export interface ExtractedVital {
  type: string;
  value: number;
  secondary_value: number | null;
  unit: string;
  source_phrase: string;
}
export interface ExtractedGuidance {
  title: string;
  instruction: string;
  source_phrase: string;
}
export interface DictationExtract {
  vitals?: ExtractedVital[];
  guidance?: ExtractedGuidance[];
  note?: string | null;
  soap?: {
    chief_complaint?: string | null;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
    follow_up_in_days?: number | null;
  } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dictationId: string;
  summary: string | null;
  extracted: DictationExtract | null;
  onFiled: () => void;
}

/**
 * Turn a dictation into a record.
 *
 * The dictation surface stopped at a transcript: a clinician dictated the
 * visit, got a good summary back, and then typed the whole thing again into the
 * encounter. Nothing carried across, and clinician_dictations.patient_user_id
 * — a column present since the table was created — was never set by anything.
 *
 * The model proposes; the clinician disposes. Every extracted item is shown
 * next to the words it came from and nothing is written without a tick, because
 * a misheard "one twenty over eighty" reaching a chart is a different kind of
 * mistake from a misheard word in a transcript.
 */
export function FileDictationDialog({
  open, onOpenChange, dictationId, summary, extracted, onFiled,
}: Props) {
  const { user } = useAuth();
  const { patients } = useClinicianPatients();
  const [search, setSearch] = useState("");
  const [patientUserId, setPatientUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const vitals = extracted?.vitals ?? [];
  const guidance = extracted?.guidance ?? [];
  const note = extracted?.note?.trim() || null;

  // Vitals stay unticked until the clinician looks at them. Guidance and the
  // note are prose the clinician already approved as a summary, so they start on.
  const [pickedVitals, setPickedVitals] = useState<Set<number>>(new Set());
  const [pickedGuidance, setPickedGuidance] = useState<Set<number>>(
    () => new Set(guidance.map((_, i) => i)),
  );
  const [writeNote, setWriteNote] = useState(true);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? patients.filter(
          (p) =>
            p.patient_name?.toLowerCase().includes(q) ||
            p.patient_email?.toLowerCase().includes(q),
        )
      : patients;
    return list.slice(0, 30);
  }, [patients, search]);

  const selected = patients.find((p) => p.user_id === patientUserId);
  const canWriteVitals = selected?.permissions?.vitals === true;

  const toggle = (set: Set<number>, i: number, apply: (s: Set<number>) => void) => {
    const next = new Set(set);
    next.has(i) ? next.delete(i) : next.add(i);
    apply(next);
  };

  const handleFile = async () => {
    if (!patientUserId || !user) return;
    setBusy(true);
    const failures: string[] = [];
    try {
      const soap = extracted?.soap ?? {};
      const { data: encounter, error: encErr } = await (supabase as any)
        .from("encounters")
        .insert({
          patient_user_id: patientUserId,
          clinician_user_id: user.id,
          visit_type: "follow_up",
          status: "in_progress",
          chief_complaint: soap.chief_complaint ?? null,
          subjective: soap.subjective ?? null,
          objective: soap.objective ?? null,
          assessment: soap.assessment ?? null,
          plan: soap.plan ?? summary ?? null,
          follow_up_in_days: soap.follow_up_in_days ?? null,
        })
        .select()
        .single();
      if (encErr) throw encErr;

      // Each write is independent: one refusal must not silently drop the rest,
      // and the clinician needs to know exactly which parts did not land.
      for (const i of pickedVitals) {
        const v = vitals[i];
        const { error } = await supabase.from("vitals").insert({
          user_id: patientUserId,
          recorded_by_user_id: user.id,
          source: "clinician",
          type: resolveVitalType(v.type),
          value: v.value,
          secondary_value: v.secondary_value,
          unit: v.unit || resolveVitalConfig(v.type).unit,
          notes: `Dictated: "${v.source_phrase}"`,
        });
        if (error) failures.push(`${resolveVitalConfig(v.type).label}: ${error.message}`);
      }

      for (const i of pickedGuidance) {
        const g = guidance[i];
        const { error } = await supabase.from("clinician_guidance").insert({
          clinician_user_id: user.id,
          patient_user_id: patientUserId,
          title: g.title,
          instruction: g.instruction,
          category: "general",
          priority: "normal",
        });
        if (error) failures.push(`Guidance "${g.title}": ${error.message}`);
      }

      if (writeNote && note) {
        const { error } = await supabase.from("internal_notes").insert({
          patient_user_id: patientUserId,
          author_user_id: user.id,
          body: note,
          visibility: "team",
        });
        if (error) failures.push(`Team note: ${error.message}`);
      }

      const { error: linkErr } = await (supabase as any)
        .from("clinician_dictations")
        .update({
          patient_user_id: patientUserId,
          encounter_id: encounter.id,
          filed_at: new Date().toISOString(),
          status: "filed",
        })
        .eq("id", dictationId);
      if (linkErr) throw linkErr;

      if (failures.length) {
        toast.warning(
          `Filed as a draft encounter, but ${failures.length} item${failures.length === 1 ? "" : "s"} did not save`,
          { description: failures.slice(0, 3).join(" · ") },
        );
      } else {
        toast.success("Filed as a draft encounter — review and sign it on the patient");
      }
      onFiled();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Could not file this dictation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>File this dictation</DialogTitle>
          <DialogDescription>
            It becomes an unsigned encounter on the patient you choose. Tick what should also be
            written into the record — nothing is written that you have not ticked.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Patient</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your patients…"
                  className="pl-9"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
                {matches.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No patients match.</p>
                ) : (
                  matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPatientUserId(p.user_id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                        patientUserId === p.user_id ? "bg-muted font-medium" : ""
                      }`}
                    >
                      {p.patient_name || p.patient_email || "Patient"}
                      {p.source === "hospital" && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {p.hospital_name || "Hospital"}
                        </Badge>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {vitals.length > 0 && (
              <div className="space-y-2">
                <Label>Readings mentioned</Label>
                {!canWriteVitals && patientUserId && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This patient does not share vitals with you, so these cannot be recorded.
                    Everything else will still file.
                  </p>
                )}
                {vitals.map((v, i) => {
                  const cfg = resolveVitalConfig(v.type);
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-2 rounded-md border p-2.5 ${
                        canWriteVitals ? "cursor-pointer" : "opacity-60"
                      }`}
                    >
                      <Checkbox
                        checked={pickedVitals.has(i)}
                        disabled={!canWriteVitals}
                        onCheckedChange={() => toggle(pickedVitals, i, setPickedVitals)}
                        className="mt-0.5"
                      />
                      <span className="text-sm min-w-0">
                        <span className="font-medium">{cfg.label}</span>{" "}
                        {v.value}
                        {v.secondary_value != null && `/${v.secondary_value}`}{" "}
                        <span className="text-muted-foreground">{v.unit || cfg.unit}</span>
                        {/* The words it came from, so this is a check rather
                            than an act of faith in the transcription. */}
                        <span className="flex items-start gap-1 text-xs text-muted-foreground mt-0.5">
                          <Quote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {v.source_phrase}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {guidance.length > 0 && (
              <div className="space-y-2">
                <Label>Instructions for the patient</Label>
                {guidance.map((g, i) => (
                  <label key={i} className="flex items-start gap-2 rounded-md border p-2.5 cursor-pointer">
                    <Checkbox
                      checked={pickedGuidance.has(i)}
                      onCheckedChange={() => toggle(pickedGuidance, i, setPickedGuidance)}
                      className="mt-0.5"
                    />
                    <span className="text-sm min-w-0">
                      <span className="font-medium">{g.title}</span>
                      <span className="block text-muted-foreground">{g.instruction}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {note && (
              <div className="space-y-2">
                <Label>Note for the care team</Label>
                <label className="flex items-start gap-2 rounded-md border p-2.5 cursor-pointer">
                  <Checkbox
                    checked={writeNote}
                    onCheckedChange={(v) => setWriteNote(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm whitespace-pre-wrap">{note}</span>
                </label>
              </div>
            )}

            {vitals.length === 0 && guidance.length === 0 && !note && (
              <p className="text-sm text-muted-foreground">
                Nothing structured came out of this dictation. Filing it still creates the
                encounter with the summary as the plan.
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleFile} disabled={!patientUserId || busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
            File to record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
