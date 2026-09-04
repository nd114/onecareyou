import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Mic, Square, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAIConsent } from '@/hooks/useAIConsent';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import {
  RECORDING_NOTICE,
  acknowledgeRecordingNotice,
  defaultRecordingTitle,
  formatDuration,
  type RecordingConsent,
} from '@/lib/recording-consent';

/**
 * Recording an appointment, in three states: read, record, name.
 *
 * The notice comes first and cannot be skipped, but only one thing is
 * tick-boxed — that they asked and were told yes. The rest is information they
 * need, and turning information into four checkboxes teaches people to click
 * through checkboxes, which is the opposite of what a consent gate is for.
 *
 * The acknowledgement is stamped when they tick it, before any audio exists,
 * because that is when the permission was actually given.
 */

/** Two hours. Long enough for any appointment, short enough to be a stop. */
const MAX_RECORDING_MS = 2 * 60 * 60 * 1000;

type Stage = 'notice' | 'recording' | 'naming';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (args: {
    blob: Blob;
    title: string;
    durationSeconds: number;
    consent: RecordingConsent;
    recordedAt: Date;
    alsoTranscribe: boolean;
  }) => Promise<unknown>;
}

export function RecordVisitDialog({ open, onOpenChange, onSave }: Props) {
  const recorder = useVoiceRecorder({ maxDurationMs: MAX_RECORDING_MS });
  const { hasConsent: hasAIConsent } = useAIConsent();

  const [stage, setStage] = useState<Stage>('notice');
  const [asked, setAsked] = useState(false);
  const [consent, setConsent] = useState<RecordingConsent | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [title, setTitle] = useState('');
  const [alsoTranscribe, setAlsoTranscribe] = useState(false);
  const [saving, setSaving] = useState(false);

  // Recording is a live device; leaving it running because a dialog closed is
  // the one failure here that a patient would never see and never forgive.
  const cancelRef = useRef(recorder.cancel);
  cancelRef.current = recorder.cancel;
  useEffect(() => {
    if (!open) cancelRef.current();
  }, [open]);

  const reset = () => {
    setStage('notice');
    setAsked(false);
    setConsent(null);
    setBlob(null);
    setDurationSeconds(0);
    setStartedAt(null);
    setTitle('');
    setAlsoTranscribe(false);
    setSaving(false);
  };

  const close = () => {
    onOpenChange(false);
    // After the animation, so the dialog does not visibly rewind as it goes.
    window.setTimeout(reset, 200);
  };

  const beginRecording = async () => {
    const stamped = acknowledgeRecordingNotice();
    const ok = await recorder.start();
    if (!ok) return;
    setConsent(stamped);
    setStartedAt(new Date());
    setStage('recording');
  };

  const finishRecording = async () => {
    const seconds = Math.round(recorder.elapsedMs / 1000);
    const captured = await recorder.stop();
    if (!captured || captured.size === 0) {
      close();
      return;
    }
    setBlob(captured);
    setDurationSeconds(seconds);
    setTitle(defaultRecordingTitle(startedAt ?? new Date()));
    setStage('naming');
  };

  const discard = () => {
    recorder.cancel();
    close();
  };

  const save = async () => {
    if (!blob || !consent) return;
    setSaving(true);
    try {
      await onSave({
        blob,
        title,
        durationSeconds,
        consent,
        recordedAt: startedAt ?? new Date(),
        alsoTranscribe: alsoTranscribe && hasAIConsent,
      });
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Stop or discard, deliberately — not by pressing Escape.
        if (!next && stage !== 'notice') return;
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      {/* Flex column with a bounded height: the notice is long enough to run
          off a phone screen, and a consent gate whose checkbox is below the
          fold is a consent gate nobody uses. The reading scrolls; the thing
          they have to agree to, and the buttons, stay put. */}
      <DialogContent
        className="flex max-h-[92dvh] max-w-lg flex-col"
        // Once there is audio — running or captured — closing means throwing
        // something away, so the two outcomes are spelled out as buttons
        // rather than hidden behind a corner cross.
        hideClose={stage !== 'notice'}
      >
        {stage === 'notice' && (
          <>
            <DialogHeader className="shrink-0">
              <DialogTitle>Before you record</DialogTitle>
              <DialogDescription>
                Four things worth knowing. They take a moment and they matter.
              </DialogDescription>
            </DialogHeader>

            <ul className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">
              {RECORDING_NOTICE.map((point) => (
                <li key={point.heading} className="rounded-lg bg-secondary/50 p-3">
                  <p className="text-sm font-medium">{point.heading}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{point.body}</p>
                </li>
              ))}
            </ul>

            <label className="flex shrink-0 items-start gap-3 rounded-lg border border-primary/20 bg-card p-3">
              <Checkbox
                id="asked-permission"
                checked={asked}
                onCheckedChange={(v) => setAsked(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I have asked the person I am with, and they agreed to be recorded.
              </span>
            </label>

            {recorder.error && (
              <p className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {recorder.error}
              </p>
            )}

            <DialogFooter className="shrink-0">
              <Button variant="ghost" onClick={close}>
                Not now
              </Button>
              <Button onClick={beginRecording} disabled={!asked}>
                <Mic className="mr-2 h-4 w-4" />
                Start recording
              </Button>
            </DialogFooter>
          </>
        )}

        {stage === 'recording' && (
          <>
            <DialogHeader>
              <DialogTitle>Recording</DialogTitle>
              <DialogDescription>
                Keep this tab open. Stop when the appointment is over.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-6">
              <span className="relative grid h-20 w-20 place-items-center rounded-full bg-destructive/10">
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive/15 motion-reduce:animate-none" />
                <Mic className="relative h-8 w-8 text-destructive" />
              </span>
              <p className="font-mono text-3xl tabular-nums" aria-live="off">
                {formatElapsed(recorder.elapsedMs)}
              </p>
              <p className="text-xs text-muted-foreground">
                Stops on its own after {Math.round(recorder.maxDurationMs / 3_600_000)} hours.
              </p>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={discard}>
                <Trash2 className="mr-2 h-4 w-4" />
                Discard
              </Button>
              <Button onClick={finishRecording}>
                <Square className="mr-2 h-4 w-4" />
                Stop and save
              </Button>
            </DialogFooter>
          </>
        )}

        {stage === 'naming' && (
          <>
            <DialogHeader>
              <DialogTitle>Name this recording</DialogTitle>
              <DialogDescription>
                {formatDuration(durationSeconds)} — it goes into your Health Vault.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="recording-title">Name</Label>
              <Input
                id="recording-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                The date and time is filled in for you. Change it to whatever helps you find it —
                &ldquo;Cardiology follow-up&rdquo;, say.
              </p>
            </div>

            {hasAIConsent ? (
              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <Checkbox
                  id="also-transcribe"
                  checked={alsoTranscribe}
                  onCheckedChange={(v) => setAlsoTranscribe(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed">
                  Also write a transcript
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Sends the audio to a transcription service to produce the text. You can ask for
                    this later instead.
                  </span>
                </span>
              </label>
            ) : (
              <p className="rounded-lg border border-border p-3 text-xs leading-relaxed text-muted-foreground">
                Transcripts need AI processing turned on, because producing one means sending the
                audio to a transcription service. You can turn it on in{' '}
                <Link to="/settings" className="underline underline-offset-2">
                  Settings
                </Link>{' '}
                and transcribe this recording afterwards. The recording itself saves either way.
              </p>
            )}

            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={discard} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" />
                Discard
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save to my Vault
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
