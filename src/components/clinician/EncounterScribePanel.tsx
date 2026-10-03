// Ambient clinical scribe — record/upload visit audio, review the AI draft
// side-by-side with the transcript, then apply it to the encounter note.
// Nothing reaches the encounter's clinical fields until the clinician applies.
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Loader2, Wand2, Check, AlertTriangle, Activity, Pause, Play, Download, RotateCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { uploadAndDraft } from "@/lib/scribe-pipeline";
import {
  savePending,
  listPending,
  deletePending,
  downloadBlob,
  type PendingRecording,
} from "@/lib/scribe-local-store";

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
  /** Lets the host dialog refuse to close while audio is being captured. */
  onRecordingChange?: (recording: boolean) => void;
  onApply: (fields: {
    chief_complaint: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    follow_up_in_days: string;
  }) => void;
}

function extFor(blob: Blob) {
  const t = blob.type.toLowerCase();
  if (t.includes("wav")) return "wav";
  if (t.includes("mp4") || t.includes("m4a")) return "mp4";
  return "webm";
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function EncounterScribePanel({ encounter, onApply, onRecordingChange }: Props) {
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
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  // Confirmed once per encounter, not once per recording within it: it is the
  // same conversation. Read from the row first so a page reload mid-visit
  // does not ask again for a visit already disclosed.
  const [consentConfirmedLocally, setConsentConfirmedLocally] = useState(false);
  const hasRecordingConsent =
    consentConfirmedLocally || Boolean(encounter.metadata?.recording_consent_confirmed_at);

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

  /** Recordings kept on this device because upload or drafting did not finish. */
  const [unsent, setUnsent] = useState<PendingRecording[]>([]);
  const refreshUnsent = async () => {
    if (!user?.id) return;
    const all = await listPending(user.id);
    setUnsent(all.filter((r) => r.encounterId === encounter.id));
  };
  useEffect(() => {
    void refreshUnsent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, encounter.id]);

  useEffect(() => {
    onRecordingChange?.(live.recording);
  }, [live.recording, onRecordingChange]);
  useBeforeUnloadGuard(live.recording);

  /**
   * The audio is already on this device (see persistThenProcess); it is only
   * removed once the server has confirmed a draft, so any failure here leaves
   * a copy to retry or download.
   */
  const runPending = async (rec: PendingRecording) => {
    if (!user?.id) return;
    try {
      const res = await uploadAndDraft({
        userId: user.id,
        encounterId: rec.encounterId,
        recordingId: rec.id,
        blob: rec.blob,
        ext: extFor(rec.blob),
        noteStyle: rec.noteStyle,
        liveTranscript: rec.transcript,
        durationSeconds: rec.durationSeconds,
        onStage: setBusy,
      });
      setTranscript(res.transcript);
      setDraft(res.draft as ScribeDraft);
      setAccepted(new Set(ALL_SECTIONS));
      await deletePending(rec.id);
      toast.success("Draft ready — review before applying");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scribe failed", {
        description: "Your recording is saved on this device. You can retry or download it.",
      });
    } finally {
      setBusy(null);
      await refreshUnsent();
    }
  };

  const persistThenProcess = async (blob: Blob, liveTranscript: string, durationSeconds?: number) => {
    if (!user?.id) return;
    const rec: PendingRecording = {
      id: crypto.randomUUID(),
      userId: user.id,
      encounterId: encounter.id,
      blob,
      transcript: liveTranscript,
      noteStyle,
      createdAt: Date.now(),
      durationSeconds,
    };
    const saved = await savePending(rec);
    if (!saved) toast.warning("Could not keep a copy on this device. Do not close this page until the draft is ready.");
    await runPending(rec);
  };

  const startRecording = async () => {
    if (!hasRecordingConsent) {
      setConsentDialogOpen(true);
      return;
    }
    liveTextRef.current = "";
    setLiveText("");
    await live.start();
  };

  /**
   * Records that the patient was told the visit is being recorded and
   * agreed, before the microphone is enabled — not just copy suggesting a
   * clinician do this themselves. Written to the encounter itself, the
   * clinical record of the visit, rather than only a client-side flag: a
   * button that merely hides itself after being clicked is not evidence
   * anyone was actually told.
   */
  const confirmConsentAndRecord = async () => {
    setConsentConfirmedLocally(true);
    setConsentDialogOpen(false);
    if (user?.id) {
      const { error } = await supabase
        .from("encounters")
        .update({
          metadata: {
            ...(encounter.metadata ?? {}),
            recording_consent_confirmed_at: new Date().toISOString(),
            recording_consent_confirmed_by: user.id,
          },
        })
        .eq("id", encounter.id);
      if (error) {
        // The recording still proceeds — the clinician just confirmed consent
        // out loud to the patient, and losing the write should not undo that
        // or block the visit. It does mean the record of it did not land.
        console.error("Could not record scribe consent confirmation", error);
      }
    }
    liveTextRef.current = "";
    setLiveText("");
    await live.start();
  };

  const stopRecording = () => {
    const elapsedMs = live.elapsed;
    const wav = live.stop();
    if (!wav) {
      toast.error("That recording was empty — try again");
      return;
    }
    void persistThenProcess(wav, liveTextRef.current, Math.round(elapsedMs / 1000));
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
    <>
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
              if (f) void persistThenProcess(f, "");
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

      {unsent.length > 0 && !busy && (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 space-y-2 text-xs">
          <div className="font-medium">
            {unsent.length === 1 ? "A recording" : `${unsent.length} recordings`} for this visit{" "}
            {unsent.length === 1 ? "is" : "are"} saved on this device and not yet drafted.
          </div>
          {unsent.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="gap-2" onClick={() => void runPending(r)}>
                <RotateCw className="h-3.5 w-3.5" /> Retry
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  downloadBlob(r.blob, `visit-recording-${new Date(r.createdAt).toISOString().slice(0, 10)}.${extFor(r.blob)}`)
                }
              >
                <Download className="h-3.5 w-3.5" /> Download audio
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await deletePending(r.id);
                  await refreshUnsent();
                }}
              >
                Discard
              </Button>
            </div>
          ))}
        </div>
      )}

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

    <AlertDialog open={consentDialogOpen} onOpenChange={setConsentDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tell the patient first</AlertDialogTitle>
          <AlertDialogDescription>
            Confirm you have told the patient this visit is being recorded and they have agreed,
            before the microphone starts. This is recorded against the encounter.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={confirmConsentAndRecord}>
            They've agreed — start recording
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
