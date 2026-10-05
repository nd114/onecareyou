// Global ambient-scribe recorder.
//
// The recorder used to live inside the encounter dialog, so any route change
// (bottom nav, back, a notification link) unmounted it and the visit was lost.
// It now lives here, above the router, so a recording survives navigation, and
// the persistent pill (ScribeRecordingPill) brings the clinician back to it.
//
// Audio is also written to IndexedDB in slices while recording, so a reload or
// a discarded mobile tab leaves something to recover. Nothing in this file
// logs or sends transcript text, patient names or audio anywhere except the
// existing upload + encounter-scribe path.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useScribePlan, SCRIBE_NOT_IN_PLAN_REASON } from "@/hooks/useScribePlan";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveScribe } from "@/hooks/useLiveScribe";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { supabase } from "@/integrations/supabase/client";
import { encodeWav } from "@/lib/wav-encoder";
import { uploadAndDraft } from "@/lib/scribe-pipeline";
import { notifyVoiceMemosChanged, uploadMemo } from "@/lib/voice-memo-pipeline";
import {
  appendChunk,
  deletePending,
  deleteSession,
  downloadBlob,
  listChunks,
  listPending,
  listSessions,
  savePending,
  saveSession,
  type PendingRecording,
} from "@/lib/scribe-local-store";

export interface ScribeTarget {
  encounterId: string;
  /** A voice memo (the clinician's own notes). encounterId is empty and live words are off. */
  kind?: "memo";
  /** App path to return to (kept on this device only). */
  returnTo: string;
}

export interface ScribeResult {
  encounterId: string;
  transcript: string;
  draft: Record<string, unknown>;
  returnTo?: string;
}

export interface ScribeRecorderValue {
  recording: boolean;
  paused: boolean;
  elapsed: number;
  level: number;
  liveText: string;
  target: ScribeTarget | null;
  /** "uploading" | "processing" while a finished recording is being sent. */
  busy: null | "uploading" | "processing";
  busyEncounterId: string | null;
  result: ScribeResult | null;
  /** Recordings kept on this device that have not produced a confirmed draft. */
  unsent: PendingRecording[];
  start: (target: ScribeTarget, noteStyle: string) => Promise<boolean>;
  /** Start a voice memo: the clinician's own dictation, never a patient conversation. */
  startMemo: (returnTo: string) => Promise<boolean>;
  /** True while a memo is being uploaded. */
  memoBusy: boolean;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setNoteStyle: (style: string) => void;
  /** Send an uploaded file through the same safe pipeline. */
  submitFile: (file: Blob, target: ScribeTarget, noteStyle: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  download: (id: string) => void;
  discard: (id: string) => Promise<void>;
  clearResult: () => void;
}

const Ctx = createContext<ScribeRecorderValue | null>(null);

const CHUNK_FLUSH_MS = 2000;
const HEARTBEAT_STALE_MS = 15_000;
const RECOVERY_POLL_MS = 30_000;

export function extFor(blob: Blob) {
  const t = blob.type.toLowerCase();
  if (t.includes("wav")) return "wav";
  if (t.includes("mp4") || t.includes("m4a")) return "mp4";
  return "webm";
}

function concat(parts: Float32Array[]) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float32Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

interface ActiveSession {
  id: string;
  target: ScribeTarget;
  seq: number;
  buffer: Float32Array[];
  lastFlush: number;
  rate: number;
  noteStyle: string;
}

export function ScribeRecorderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [liveText, setLiveText] = useState("");
  const liveTextRef = useRef("");
  const [target, setTarget] = useState<ScribeTarget | null>(null);
  const [busy, setBusy] = useState<null | "uploading" | "processing">(null);
  const [busyEncounterId, setBusyEncounterId] = useState<string | null>(null);
  const [result, setResult] = useState<ScribeResult | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);
  const memoInFlight = useRef<Set<string>>(new Set());
  const [unsent, setUnsent] = useState<PendingRecording[]>([]);
  const sessionRef = useRef<ActiveSession | null>(null);
  const plan = useScribePlan();
  const planBlockedRef = useRef(false);
  planBlockedRef.current = plan.blocked;
  const noteStyleRef = useRef("soap");

  const refreshUnsent = useCallback(async () => {
    if (!userId) {
      setUnsent([]);
      return;
    }
    setUnsent(await listPending(userId));
  }, [userId]);

  // Live words: each window of audio comes back as text while the visit runs.
  const appendLive = useCallback(async (wav: Blob) => {
    // A memo is never sent anywhere until it is finished.
    if (sessionRef.current?.target.kind === "memo") return;
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
      /* the full recording is still drafted at the end */
    }
  }, []);

  const flushChunks = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.buffer.length === 0 || !userId) return;
    const samples = concat(s.buffer);
    s.buffer = [];
    s.lastFlush = Date.now();
    const seq = s.seq;
    s.seq += 1;
    await appendChunk(s.id, seq, samples);
    await saveSession({
      id: s.id,
      userId,
      encounterId: s.target.encounterId,
      ...(s.target.kind ? { kind: s.target.kind } : {}),
      sampleRate: s.rate,
      startedAt: 0,
      transcript: liveTextRef.current,
      noteStyle: s.noteStyle,
      returnTo: s.target.returnTo,
      heartbeatAt: Date.now(),
    });
  }, [userId]);

  const onChunk = useCallback(
    (samples: Float32Array, rate: number) => {
      const s = sessionRef.current;
      if (!s) return;
      s.rate = rate;
      s.buffer.push(samples);
      if (Date.now() - s.lastFlush >= CHUNK_FLUSH_MS) void flushChunks();
    },
    [flushChunks],
  );

  const live = useLiveScribe({
    onWindow: appendLive,
    onChunk,
    onError: (m) => toast.error(m),
  });

  // While recording, leaving or reloading the page asks first.
  useBeforeUnloadGuard(live.recording);

  /**
   * Send a finished voice memo. The audio leaves this device copy only once it
   * is safely uploaded and the memo row exists; from then on the inbox owns
   * the memo and any processing failure is retried from there. Until then the
   * local copy stays, so a failed upload can be retried (with backoff) or
   * recovered after a reload.
   */
  const runMemo = useCallback(
    async (rec: PendingRecording) => {
      if (!userId || memoInFlight.current.has(rec.id)) return;
      memoInFlight.current.add(rec.id);
      setMemoBusy(true);
      try {
        await uploadMemo({ userId, memoId: rec.id, blob: rec.blob, durationMs: (rec.durationSeconds ?? 0) * 1000 });
        await deletePending(rec.id);
        toast.success("Memo saved. Transcribing now.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the memo", {
          description: "Your memo is saved on this device. It will retry when you are back online.",
        });
      } finally {
        memoInFlight.current.delete(rec.id);
        setMemoBusy(memoInFlight.current.size > 0);
        notifyVoiceMemosChanged();
        await refreshUnsent();
      }
    },
    [userId, refreshUnsent],
  );

  /**
   * Send a finished recording. The audio is already on this device; it is only
   * removed once the server has confirmed a draft, so every failure leaves a
   * copy to retry or download.
   */
  const run = useCallback(
    async (rec: PendingRecording) => {
      if (!userId) return;
      if (rec.kind === "memo") {
        await runMemo(rec);
        return;
      }
      setBusyEncounterId(rec.encounterId);
      try {
        const res = await uploadAndDraft({
          userId,
          encounterId: rec.encounterId,
          recordingId: rec.id, // also the server's requestId: stable across retries
          blob: rec.blob,
          ext: extFor(rec.blob),
          noteStyle: rec.noteStyle,
          liveTranscript: rec.transcript,
          durationSeconds: rec.durationSeconds,
          onStage: setBusy,
        });
        setResult({ encounterId: rec.encounterId, transcript: res.transcript, draft: res.draft, returnTo: rec.returnTo });
        await deletePending(rec.id);
        toast.success("Draft ready — review before applying");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Scribe failed", {
          description: "Your recording is saved on this device. You can retry or download it.",
        });
      } finally {
        setBusy(null);
        setBusyEncounterId(null);
        await refreshUnsent();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, refreshUnsent, runMemo],
  );

  const submit = useCallback(
    async (blob: Blob, t: ScribeTarget, noteStyle: string, transcript: string, durationSeconds: number | undefined, id: string) => {
      if (!userId) return;
      const rec: PendingRecording = {
        id,
        userId,
        encounterId: t.encounterId,
        blob,
        transcript,
        noteStyle,
        createdAt: Date.now(),
        durationSeconds,
        returnTo: t.returnTo,
        ...(t.kind ? { kind: t.kind } : {}),
      };
      const saved = await savePending(rec);
      if (!saved) toast.warning("Could not keep a copy on this device. Do not close this page until the draft is ready.");
      else await deleteSession(id); // the finished WAV now holds the audio
      await refreshUnsent();
      await run(rec);
    },
    [userId, run, refreshUnsent],
  );

  const start = useCallback(
    async (t: ScribeTarget, noteStyle: string) => {
      if (live.recording || !userId) return false;
      // Not part of Individual or Community. Refused before the microphone
      // opens, not after a recording has been made and the server says no.
      if (planBlockedRef.current) {
        toast.error(SCRIBE_NOT_IN_PLAN_REASON);
        return false;
      }
      liveTextRef.current = "";
      setLiveText("");
      setResult(null);
      noteStyleRef.current = noteStyle;
      const id = crypto.randomUUID();
      sessionRef.current = { id, target: t, seq: 0, buffer: [], lastFlush: Date.now(), rate: 48000, noteStyle };
      const ok = (await live.start()) !== false;
      if (!ok) {
        sessionRef.current = null;
        return false;
      }
      setTarget(t);
      await saveSession({
        id,
        userId,
        encounterId: t.encounterId,
        ...(t.kind ? { kind: t.kind } : {}),
        sampleRate: 48000,
        startedAt: Date.now(),
        transcript: "",
        noteStyle,
        returnTo: t.returnTo,
        heartbeatAt: Date.now(),
      });
      return true;
    },
    [live, userId],
  );

  const startMemo = useCallback((returnTo: string) => start({ encounterId: "", kind: "memo", returnTo }, "soap"), [start]);

  const stop = useCallback(() => {
    const s = sessionRef.current;
    const t = target;
    const elapsedMs = live.elapsed;
    const wav = live.stop();
    sessionRef.current = null;
    setTarget(null);
    if (!s || !t) return;
    if (!wav) {
      toast.error("That recording was empty — try again");
      void deleteSession(s.id);
      return;
    }
    // Flush is unnecessary: the whole WAV is saved below, then chunks dropped.
    void submit(wav, t, noteStyleRef.current, liveTextRef.current, Math.round(elapsedMs / 1000), s.id);
  }, [live, target, submit]);

  const submitFile = useCallback(
    (file: Blob, t: ScribeTarget, noteStyle: string) => submit(file, t, noteStyle, "", undefined, crypto.randomUUID()),
    [submit],
  );

  // Recovery: rebuild interrupted sessions (reload, tab discard, crash) into
  // finished recordings so they show up as "unsaved recording" to retry.
  // A session still beating belongs to a live tab and is left alone.
  const recoverInterrupted = useCallback(async () => {
    if (!userId || live.recording) return;
    const sessions = await listSessions(userId);
    let changed = false;
    for (const s of sessions) {
      if (sessionRef.current?.id === s.id) continue;
      if (s.heartbeatAt && Date.now() - s.heartbeatAt < HEARTBEAT_STALE_MS) continue;
      const chunks = await listChunks(s.id);
      if (chunks.length === 0) {
        await deleteSession(s.id);
        continue;
      }
      const wav = encodeWav(chunks.map((c) => c.samples), s.sampleRate);
      if (wav.size <= 2048) {
        await deleteSession(s.id);
        continue;
      }
      const ok = await savePending({
        id: s.id,
        userId,
        encounterId: s.encounterId,
        blob: wav,
        transcript: s.transcript,
        noteStyle: s.noteStyle,
        createdAt: s.startedAt || Date.now(),
        recovered: true,
        returnTo: s.returnTo,
        ...(s.kind ? { kind: s.kind } : {}),
      });
      if (ok) await deleteSession(s.id);
      changed = true;
    }
    if (changed) await refreshUnsent();
  }, [userId, live.recording, refreshUnsent]);

  useEffect(() => {
    void refreshUnsent();
  }, [refreshUnsent]);

  useEffect(() => {
    void recoverInterrupted();
    const t = window.setInterval(() => void recoverInterrupted(), RECOVERY_POLL_MS);
    return () => window.clearInterval(t);
  }, [recoverInterrupted]);

  // A memo that could not upload is tried again whenever the browser says the
  // network is back.
  const unsentRef = useRef(unsent);
  unsentRef.current = unsent;
  useEffect(() => {
    const onOnline = () => {
      for (const r of unsentRef.current) if (r.kind === "memo") void runMemo(r);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [runMemo]);

  const retry = useCallback(
    async (id: string) => {
      const rec = unsent.find((r) => r.id === id);
      if (rec) await run(rec);
    },
    [unsent, run],
  );

  const download = useCallback(
    (id: string) => {
      const rec = unsent.find((r) => r.id === id);
      if (!rec) return;
      downloadBlob(rec.blob, `${rec.kind === "memo" ? "voice-memo" : "visit-recording"}-${new Date(rec.createdAt).toISOString().slice(0, 10)}.${extFor(rec.blob)}`);
    },
    [unsent],
  );

  const discard = useCallback(
    async (id: string) => {
      await deletePending(id);
      await refreshUnsent();
    },
    [refreshUnsent],
  );

  const value = useMemo<ScribeRecorderValue>(
    () => ({
      recording: live.recording,
      paused: live.paused,
      elapsed: live.elapsed,
      level: live.level,
      liveText,
      target,
      busy,
      busyEncounterId,
      result,
      unsent,
      start,
      startMemo,
      memoBusy,
      stop,
      pause: live.pause,
      resume: live.resume,
      setNoteStyle: (s: string) => {
        noteStyleRef.current = s;
      },
      submitFile,
      retry,
      download,
      discard,
      clearResult: () => setResult(null),
    }),
    [live, liveText, target, busy, busyEncounterId, result, unsent, start, startMemo, memoBusy, stop, submitFile, retry, download, discard],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScribeRecorder(): ScribeRecorderValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScribeRecorder must be used inside ScribeRecorderProvider");
  return v;
}

/** For places that may render outside the provider (tests, public pages). */
export function useOptionalScribeRecorder(): ScribeRecorderValue | null {
  return useContext(Ctx);
}
