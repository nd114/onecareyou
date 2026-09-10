// Ambient clinical scribe — record/upload visit audio, review the AI draft
// side-by-side with the transcript, then apply it to the encounter note.
// Nothing reaches the encounter's clinical fields until the clinician applies.
import { useRef, useState } from "react";
import { Mic, Square, Upload, Loader2, Wand2, Check, AlertTriangle, Activity, Pause, Play } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLiveScribe } from "@/hooks/useLiveScribe";
import { Checkbox } from "@/components/ui/checkbox";
import { parseMentionedVital } from "@/lib/mentioned-vitals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Encounter } from "@/hooks/useEncounters";
import { toast } from "sonner";
import { edgeFunctionError } from '@/lib/edge-function-error';

export interface ScribeDraft {
  chief_complaint?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  mentioned_vitals?: { type?: string; value?: string; note?: string }[];
  mentioned_medications?: { name?: string; dose?: string; change?: string }[];
  follow_up_in_days?: number | null;
}

export type NoteStyle = "soap" | "narrative" | "referral" | "discharge";

/** The five parts of a note the clinician approves one at a time. */
export const ALL_SECTIONS = ["chief_complaint", "subjective", "objective", "assessment", "plan"] as const;
export type SectionKey = (typeof ALL_SECTIONS)[number];

interface Props {
  encounter: Encounter;
  onApply: (fields: {
    chief_complaint: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    follow_up_in_days: string;
  }) => void;
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function EncounterScribePanel({ encounter, onApply }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<null | "uploading" | "processing">(null);
  const [transcript, setTranscript] = useState(encounter.scribe_transcript ?? "");
  const [draft, setDraft] = useState<ScribeDraft>((encounter.scribe_draft as ScribeDraft) ?? {});
  const [noteStyle, setNoteStyle] = useState<NoteStyle>("soap");
  const [liveText, setLiveText] = useState("");
  const [accepted, setAccepted] = useState<Set<SectionKey>>(new Set(ALL_SECTIONS));
  const liveTextRef = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickedVitals, setPickedVitals] = useState<Set<number>>(new Set());
  const [recordingVitals, setRecordingVitals] = useState(false);

  /**
   * Live transcription: each window of audio comes back as words while the
   * consultation is still happening, so the clinician can see the scribe is
   * listening instead of trusting a timer.
   */
  const appendLive = async (wav: Blob) => {
    try {
      const form = new FormData();
      form.append("file", wav, "segment.wav");
      const { data, error } = await supabase.functions.invoke("transcribe-segment", { body: form });
      if (error || data?.error) return; // a lost window is not worth interrupting a visit for
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (!text) return;
      liveTextRef.current = `${liveTextRef.current} ${text}`.trim();
      setLiveText(liveTextRef.current);
    } catch {
      /* ignore — the full recording is still drafted at the end */
    }
  };

  const live = useLiveScribe({
    onWindow: appendLive,
    onError: (m) => toast.error(m),
  });

  const process = async (blob: Blob, ext: string, liveTranscript?: string) => {
    if (!user?.id) return;
    try {
      setBusy("uploading");
      const path = `${user.id}/encounters/${encounter.id}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("clinician-dictations")
        .upload(path, blob, { contentType: blob.type || "audio/webm" });
      if (upErr) throw new Error(upErr.message);

      setBusy("processing");
      const { data, error } = await supabase.functions.invoke("encounter-scribe", {
        body: {
          encounterId: encounter.id,
          audioPath: path,
          noteStyle,
          liveTranscript: liveTranscript ?? "",
        },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error((await edgeFunctionError(error)).message);
      setTranscript(data.transcript ?? "");
      setDraft((data.draft ?? {}) as ScribeDraft);
      setAccepted(new Set(ALL_SECTIONS));
      toast.success("Draft ready — review before applying");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scribe failed");
    } finally {
      setBusy(null);
    }
  };

  const startRecording = async () => {
    liveTextRef.current = "";
    setLiveText("");
    await live.start();
  };

  const stopRecording = () => {
    const wav = live.stop();
    if (!wav) {
      toast.error("That recording was empty — try again");
      return;
    }
    process(wav, "wav", liveTextRef.current);
  };

  /**
   * Write the ticked readings into the patient's chart.
   *
   * Each is its own insert so one refusal — a patient who does not share
   * vitals, say — does not swallow the rest, and the clinician is told which
   * ones did not land rather than being left to guess.
   */
  const recordPickedVitals = async () => {
    if (!user?.id || pickedVitals.size === 0) return;
    setRecordingVitals(true);
    const failures: string[] = [];
    let written = 0;
    try {
      for (const i of pickedVitals) {
        const mentioned = draft.mentioned_vitals?.[i];
        const parsed = mentioned && parseMentionedVital(mentioned);
        if (!parsed) continue;
        const { error } = await supabase.from("vitals").insert({
          user_id: encounter.patient_user_id,
          recorded_by_user_id: user.id,
          source: "clinician",
          type: parsed.type,
          value: parsed.value,
          secondary_value: parsed.secondaryValue,
          unit: parsed.unit,
          recorded_at: encounter.occurred_at,
          notes: `Heard during the visit: "${mentioned?.value ?? ""}"`.trim(),
        });
        if (error) failures.push(`${parsed.label}: ${error.message}`);
        else written += 1;
      }

      if (written > 0) {
        toast.success(`Recorded ${written} reading${written === 1 ? "" : "s"}`);
        setPickedVitals(new Set());
      }
      if (failures.length) {
        toast.error(`${failures.length} could not be recorded`, {
          description: failures.slice(0, 3).join(" · "),
        });
      }
    } finally {
      setRecordingVitals(false);
    }
  };

  const keep = (k: SectionKey) => (accepted.has(k) ? (draft[k] ?? "") : "");

  const applyDraft = () => {
    onApply({
      chief_complaint: keep("chief_complaint"),
      subjective: keep("subjective"),
      objective: keep("objective"),
      assessment: keep("assessment"),
      plan: keep("plan"),
      follow_up_in_days: draft.follow_up_in_days != null ? String(draft.follow_up_in_days) : "",
    });
    toast.success("Draft copied into the note — edit and sign when ready");
  };

  const toggleSection = (k: SectionKey) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const hasDraft = Boolean(
    draft.subjective || draft.objective || draft.assessment || draft.plan || draft.chief_complaint,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {live.recording ? (
            <>
              <Button size="sm" variant="destructive" className="gap-2" onClick={stopRecording}>
                <Square className="h-3.5 w-3.5" /> Stop · {fmt(live.elapsed)}
              </Button>
              {live.paused ? (
                <Button size="sm" variant="outline" className="gap-2" onClick={live.resume}>
                  <Play className="h-3.5 w-3.5" /> Resume
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-2" onClick={live.pause}>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
              )}
              <span className="flex items-center gap-1" aria-hidden>
                {[0.15, 0.35, 0.6].map((t) => (
                  <span
                    key={t}
                    className={`h-3 w-1 rounded-full transition-colors ${
                      !live.paused && live.level > t ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {live.paused ? "Paused — nothing is being heard" : "Listening…"}
              </span>
            </>
          ) : (
            <Button size="sm" className="gap-2" onClick={startRecording} disabled={!!busy}>
              <Mic className="h-3.5 w-3.5" /> Record visit
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) process(f, f.name.split(".").pop()?.toLowerCase() === "mp4" ? "mp4" : "webm");
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => fileRef.current?.click()}
            disabled={live.recording || !!busy}
          >
            <Upload className="h-3.5 w-3.5" /> Upload audio
          </Button>
          <Select value={noteStyle} onValueChange={(v) => setNoteStyle(v as NoteStyle)}>
            <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Note style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="soap">SOAP note</SelectItem>
              <SelectItem value="narrative">Narrative note</SelectItem>
              <SelectItem value="referral">Referral letter</SelectItem>
              <SelectItem value="discharge">Discharge summary</SelectItem>
            </SelectContent>
          </Select>
          {busy && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy === "uploading" ? "Uploading recording…" : "Transcribing and drafting…"}
            </span>
          )}
          {encounter.scribe_generated_at && !busy && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Wand2 className="h-3 w-3" /> Draft on file
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          Tell the patient the visit is being recorded and get their consent first. The draft is
          AI-generated and enters the record only when you apply and sign it.
        </p>
      </div>

      {live.recording && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Live transcript
          </Label>
          <Textarea
            value={liveText}
            readOnly
            rows={8}
            className="text-xs font-mono bg-muted/40"
            placeholder="Words will appear here a few seconds behind the conversation…"
          />
        </div>
      )}

      {!live.recording && (transcript || hasDraft) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Transcript</Label>
            <Textarea
              value={transcript}
              readOnly
              rows={14}
              className="text-xs font-mono bg-muted/40"
              placeholder="No transcript yet"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Suggested note</Label>
            <p className="text-[11px] text-muted-foreground">
              Untick anything you do not want. Only ticked parts are copied into the note.
            </p>
            <div className={accepted.has("chief_complaint") ? "" : "opacity-50"}>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="scribe-chief_complaint"
                  checked={accepted.has("chief_complaint")}
                  onCheckedChange={() => toggleSection("chief_complaint")}
                />
                <Label htmlFor="scribe-chief_complaint" className="text-xs">Chief complaint</Label>
              </div>
              <Input
                value={draft.chief_complaint ?? ""}
                onChange={(e) => setDraft({ ...draft, chief_complaint: e.target.value })}
              />
            </div>
            {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
              <div key={k} className={accepted.has(k) ? "" : "opacity-50"}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`scribe-${k}`}
                    checked={accepted.has(k)}
                    onCheckedChange={() => toggleSection(k)}
                  />
                  <Label htmlFor={`scribe-${k}`} className="text-xs capitalize">{k}</Label>
                </div>
                <Textarea
                  rows={3}
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </div>
            ))}
            {(draft.mentioned_vitals?.length || draft.mentioned_medications?.length) ? (
              <div className="rounded-md border p-2 space-y-1.5 text-xs">
                <div className="font-medium">Mentioned in the visit</div>
                {/* These used to end with "Not saved anywhere — add them
                    yourself", because vitals accepted writes only from the
                    patient's own account. They can be recorded now, one tick
                    at a time and never by default. */}
                {draft.mentioned_vitals?.map((v, i) => {
                  const parsed = parseMentionedVital(v);
                  return (
                    <label
                      key={`v${i}`}
                      className={`flex items-start gap-2 ${parsed ? "cursor-pointer" : ""}`}
                    >
                      <Checkbox
                        checked={pickedVitals.has(i)}
                        disabled={!parsed}
                        onCheckedChange={() =>
                          setPickedVitals((prev) => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="text-muted-foreground">
                        Vital · {[v.type, v.value, v.note].filter(Boolean).join(" — ")}
                        {!parsed && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                            No clear number heard — record this one yourself.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                {draft.mentioned_medications?.map((m, i) => (
                  <div key={`m${i}`} className="text-muted-foreground pl-6">
                    Medication · {[m.name, m.dose, m.change].filter(Boolean).join(" — ")}
                  </div>
                ))}
                {pickedVitals.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 w-full"
                    onClick={recordPickedVitals}
                    disabled={recordingVitals}
                  >
                    {recordingVitals ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Activity className="h-3.5 w-3.5" />
                    )}
                    Record {pickedVitals.size} reading{pickedVitals.size === 1 ? "" : "s"}
                  </Button>
                )}
                {draft.mentioned_medications?.length ? (
                  <div className="text-[11px] text-muted-foreground pl-6">
                    Medications are not written from here — change them on the patient's list.
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button
              size="sm"
              className="gap-2 w-full"
              onClick={applyDraft}
              disabled={!hasDraft || accepted.size === 0}
            >
              <Check className="h-3.5 w-3.5" /> Apply {accepted.size} of {ALL_SECTIONS.length} to note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
