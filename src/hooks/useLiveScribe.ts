import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav, peakLevel } from "@/lib/wav-encoder";

/**
 * Recording engine for the ambient scribe.
 *
 * It does two jobs at once: it keeps every sample of the consultation so the
 * whole visit can be drafted at the end, and it hands over a complete WAV of
 * the last few seconds while the visit is still running so the transcript
 * appears as people speak. A clinician who can see the words arriving trusts
 * the note; a clinician staring at a timer does not.
 *
 * Pausing keeps the recording — a patient stepping behind a curtain should not
 * cost the note so far.
 */
const WINDOW_MS = 7000;

export interface LiveScribeOptions {
  /** Called with a complete WAV of each window while recording. */
  onWindow: (wav: Blob) => void;
  onError?: (message: string) => void;
}

export function useLiveScribe({ onWindow, onError }: LiveScribeOptions) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const allRef = useRef<Float32Array[]>([]);
  const windowRef = useRef<Float32Array[]>([]);
  const pausedRef = useRef(false);
  const lastFlushRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const accruedRef = useRef(0);
  const startedAtRef = useRef(0);
  const onWindowRef = useRef(onWindow);
  onWindowRef.current = onWindow;

  const teardown = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const flushWindow = useCallback(() => {
    const chunks = windowRef.current;
    windowRef.current = [];
    lastFlushRef.current = Date.now();
    if (chunks.length === 0) return;
    // Silence has nothing to transcribe, so sending it only costs credits.
    if (peakLevel(chunks) < 0.01) return;
    const rate = ctxRef.current?.sampleRate ?? 48000;
    onWindowRef.current(encodeWav(chunks, rate));
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      allRef.current = [];
      windowRef.current = [];
      pausedRef.current = false;
      lastFlushRef.current = Date.now();
      accruedRef.current = 0;
      startedAtRef.current = Date.now();

      node.onaudioprocess = (e) => {
        if (pausedRef.current) return;
        const copy = new Float32Array(e.inputBuffer.getChannelData(0));
        allRef.current.push(copy);
        windowRef.current.push(copy);
        setLevel(Math.min(1, peakLevel([copy]) * 3));
        if (Date.now() - lastFlushRef.current >= WINDOW_MS) flushWindow();
      };
      source.connect(node);
      node.connect(ctx.destination);

      ctxRef.current = ctx;
      streamRef.current = stream;
      nodeRef.current = node;
      sourceRef.current = source;
      setRecording(true);
      setPaused(false);
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        if (!pausedRef.current) setElapsed(accruedRef.current + (Date.now() - startedAtRef.current));
      }, 500);
    } catch {
      onError?.("Microphone unavailable — check browser permissions");
    }
  }, [flushWindow, onError]);

  const pause = useCallback(() => {
    if (!recording || pausedRef.current) return;
    flushWindow();
    accruedRef.current += Date.now() - startedAtRef.current;
    pausedRef.current = true;
    setPaused(true);
    setLevel(0);
  }, [flushWindow, recording]);

  const resume = useCallback(() => {
    if (!recording || !pausedRef.current) return;
    startedAtRef.current = Date.now();
    lastFlushRef.current = Date.now();
    pausedRef.current = false;
    setPaused(false);
  }, [recording]);

  /** Stop and hand back the whole visit as one WAV file. */
  const stop = useCallback((): Blob | null => {
    if (!recording) return null;
    flushWindow();
    const rate = ctxRef.current?.sampleRate ?? 48000;
    const chunks = allRef.current;
    teardown();
    setRecording(false);
    setPaused(false);
    setLevel(0);
    if (chunks.length === 0) return null;
    const wav = encodeWav(chunks, rate);
    return wav.size > 2048 ? wav : null;
  }, [flushWindow, recording, teardown]);

  return { recording, paused, elapsed, level, start, pause, resume, stop };
}
