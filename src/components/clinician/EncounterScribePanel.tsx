// Ambient clinical scribe — record/upload visit audio, review the AI draft
// side-by-side with the transcript, then apply it to the encounter note.
// Nothing reaches the encounter's clinical fields until the clinician applies.
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Loader2, Wand2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Encounter } from "@/hooks/useEncounters";
import { toast } from "sonner";

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

function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) ?? "";
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function EncounterScribePanel({ encounter, onApply }: Props) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<null | "uploading" | "processing">(null);
  const [transcript, setTranscript] = useState(encounter.scribe_transcript ?? "");
  const [draft, setDraft] = useState<ScribeDraft>((encounter.scribe_draft as ScribeDraft) ?? {});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const process = async (blob: Blob, ext: string) => {
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
        body: { encounterId: encounter.id, audioPath: path },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);
      setTranscript(data.transcript ?? "");
      setDraft((data.draft ?? {}) as ScribeDraft);
      toast.success("Draft ready — review before applying");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scribe failed");
    } finally {
      setBusy(null);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, pickMime() ? { mimeType: pickMime() } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((t) => t.stop());
        if (tickRef.current) window.clearInterval(tickRef.current);
        setRecording(false);
        setElapsed(0);
        if (blob.size > 0) process(blob, type.includes("mp4") ? "mp4" : "webm");
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      const startedAt = Date.now();
      tickRef.current = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    } catch {
      toast.error("Microphone unavailable — check browser permissions");
    }
  };

  const applyDraft = () => {
    onApply({
      chief_complaint: draft.chief_complaint ?? "",
      subjective: draft.subjective ?? "",
      objective: draft.objective ?? "",
      assessment: draft.assessment ?? "",
      plan: draft.plan ?? "",
      follow_up_in_days: draft.follow_up_in_days != null ? String(draft.follow_up_in_days) : "",
    });
    toast.success("Draft copied into the note — edit and sign when ready");
  };

  const hasDraft = Boolean(
    draft.subjective || draft.objective || draft.assessment || draft.plan || draft.chief_complaint,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <Button size="sm" variant="destructive" className="gap-2" onClick={() => recorderRef.current?.stop()}>
              <Square className="h-3.5 w-3.5" /> Stop · {fmt(elapsed)}
            </Button>
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
            disabled={recording || !!busy}
          >
            <Upload className="h-3.5 w-3.5" /> Upload audio
          </Button>
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

      {(transcript || hasDraft) && (
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
            <div>
              <Label className="text-xs">Chief complaint</Label>
              <Input
                value={draft.chief_complaint ?? ""}
                onChange={(e) => setDraft({ ...draft, chief_complaint: e.target.value })}
              />
            </div>
            {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
              <div key={k}>
                <Label className="text-xs capitalize">{k}</Label>
                <Textarea
                  rows={3}
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </div>
            ))}
            {(draft.mentioned_vitals?.length || draft.mentioned_medications?.length) ? (
              <div className="rounded-md border p-2 space-y-1 text-xs">
                <div className="font-medium">Mentioned in the visit</div>
                {draft.mentioned_vitals?.map((v, i) => (
                  <div key={`v${i}`} className="text-muted-foreground">
                    Vital · {[v.type, v.value, v.note].filter(Boolean).join(" — ")}
                  </div>
                ))}
                {draft.mentioned_medications?.map((m, i) => (
                  <div key={`m${i}`} className="text-muted-foreground">
                    Medication · {[m.name, m.dose, m.change].filter(Boolean).join(" — ")}
                  </div>
                ))}
                <div className="text-[10px] text-muted-foreground/80">
                  Not saved anywhere — add them yourself if clinically appropriate.
                </div>
              </div>
            ) : null}
            <Button size="sm" className="gap-2 w-full" onClick={applyDraft} disabled={!hasDraft}>
              <Check className="h-3.5 w-3.5" /> Apply to note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
