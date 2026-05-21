import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal MediaRecorder wrapper for Simple Mode voice capture.
 *
 * v1 cap: 60 seconds — keeps payloads small and transcription latency
 * acceptable. For longer dictation (clinician visit notes, multi-minute
 * patient reflections) we plan an Otter.ai-style integration that streams
 * audio chunks server-side; this hook is the local-recording primitive both
 * flows will reuse.
 */
const MAX_DURATION_MS = 60_000;

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  const cleanup = () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const stream = mediaRecorderRef.current?.stream;
    stream?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  useEffect(() => () => cleanup(), []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported on this device');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: pickMime() });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        cleanup();
        setIsRecording(false);
        setElapsedMs(0);
        stopResolverRef.current?.(blob);
        stopResolverRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
      tickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_DURATION_MS) {
          stopInternal();
        }
      }, 200);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not access microphone');
      return false;
    }
  }, []);

  const stopInternal = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }
      stopResolverRef.current = resolve;
      stopInternal();
    });
  }, []);

  const cancel = useCallback(() => {
    stopResolverRef.current?.(null);
    stopResolverRef.current = null;
    stopInternal();
    cleanup();
    setIsRecording(false);
    setElapsedMs(0);
  }, []);

  return { isRecording, elapsedMs, maxDurationMs: MAX_DURATION_MS, error, start, stop, cancel };
}

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}
