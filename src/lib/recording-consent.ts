/**
 * What someone must be told before they record a consultation.
 *
 * Recording a conversation with a clinician is useful — people forget most of
 * what they are told in an appointment, and a transcript they can re-read is
 * genuinely valuable. It is also the one patient-side feature with real legal
 * exposure, and the exposure is not ours to carry quietly on their behalf.
 *
 * Three facts shape this:
 *
 *   1. **Recording law varies by jurisdiction.** Some places need only one
 *      party to consent — the person doing the recording. Others need every
 *      party. We do not know where a given patient is, and guessing wrong
 *      turns a helpful feature into a criminal offence for the person using
 *      it. So the notice tells them to ask, every time, rather than telling
 *      them what the law is.
 *
 *   2. **Transcribing means sending the audio somewhere.** The recording
 *      itself never leaves the patient's Vault, but a transcript cannot be
 *      produced without shipping the audio to a service that can hear it. So
 *      transcription is a separate, per-recording decision, and the notice
 *      says so rather than letting "stays private" quietly stop being true.
 *
 *   3. **A transcript is not a record of what was said.** It is a machine's
 *      best attempt. A drug name misheard by one syllable is a different drug.
 *      Anyone relying on one needs to know that before they rely on it, not in
 *      a footnote afterwards.
 *
 * The acknowledgement is stored per recording rather than once per account,
 * because permission is given for a conversation, not for a lifetime.
 */

import { formatDayTime } from '@/lib/format-date';

/**
 * Bumped whenever the wording changes materially.
 *
 * Stored alongside each acknowledgement so it stays possible to say what a
 * person actually agreed to, rather than what the current text happens to say.
 *
 * v2: v1 said "nobody else sees them unless you choose to share them" while
 * the database let a whole-Vault share reach every recording. The policy was
 * fixed and the sentence made specific. Anyone who acknowledged v1 agreed to a
 * promise the system was not keeping, and their rows still say v1 — which is
 * the point of storing it.
 */
export const RECORDING_NOTICE_VERSION = "2026-09-v2";

export interface RecordingNoticePoint {
  /** Short label for the checkbox or bullet. */
  heading: string;
  body: string;
}

export const RECORDING_NOTICE: RecordingNoticePoint[] = [
  {
    heading: "Ask first, every time",
    body:
      "Tell whoever you are with that you want to record, and get their agreement before you start. In many places recording someone without their permission is against the law, and the rules differ from country to country. Asking is the only approach that works everywhere.",
  },
  {
    heading: "The transcript will contain mistakes",
    body:
      "It is produced automatically. Names, doses and numbers are the parts most often wrong, and a drug name misheard by one syllable is a different drug. Read it against your own memory before you act on it, and treat the audio as the record rather than the text.",
  },
  {
    heading: "This is yours, and stays private",
    body:
      "The recording and its transcript go into your Health Vault. Nobody else sees them unless you share that recording specifically — not the clinician you recorded, and not us. Sharing your whole Vault with somebody does not include your recordings; you have to hand over each one deliberately. Asking for a transcript is the one exception: to produce it the audio has to be sent to a transcription service, which is why it is a separate choice you make per recording rather than something that happens by default.",
  },
  {
    heading: "It is not a medical record",
    body:
      "What your clinician writes in their notes is the clinical record. This is your own copy of a conversation, which is a different thing and does not replace it.",
  },
];

/**
 * The default name for a recording: the day and time it was made.
 *
 * Editable afterwards — most people will want "Cardiology follow-up" rather
 * than a timestamp — but a timestamp is the one name that is always correct
 * and never needs thinking about at the moment of saving.
 */
export function defaultRecordingTitle(when: Date = new Date()): string {
  const date = when.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

/** Trimmed, bounded, and never empty — an untitled recording is unfindable. */
export function normaliseRecordingTitle(value: string, when: Date = new Date()): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return defaultRecordingTitle(when);
  return trimmed.slice(0, 120);
}

/** A filename for the download, from a title that may contain anything. */
export function recordingFileName(title: string, extension: string): string {
  const safe = title
    .trim()
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const stem = safe || "recording";
  return `${stem}.${extension.replace(/^\./, "")}`;
}

export interface RecordingConsent {
  acknowledgedAt: string;
  noticeVersion: string;
}

/** Recorded at the moment they confirm, not when the recording is saved. */
export function acknowledgeRecordingNotice(now: Date = new Date()): RecordingConsent {
  return { acknowledgedAt: now.toISOString(), noticeVersion: RECORDING_NOTICE_VERSION };
}

/**
 * The text file a patient ends up with.
 *
 * The warning travels inside the file, not only on the screen where they asked
 * for it. A transcript that leaves the app — mailed to a relative, printed,
 * dropped in a folder — is exactly the copy most likely to be read by somebody
 * who never saw the caveat, and a document that looks like a record of a
 * medical conversation should carry its own health warning.
 */
export function transcriptFileBody(recording: {
  title: string;
  recorded_at: string;
  transcript: string | null;
}): string {
  const when = formatDayTime(recording.recorded_at);
  return [
    recording.title,
    `Recorded ${when}`,
    "",
    "This transcript was produced automatically and will contain mistakes.",
    "Names, doses and numbers are the parts most often wrong. Check it against",
    "the audio and your own memory before acting on anything in it. It is not a",
    "medical record — what your clinician wrote in their notes is.",
    "",
    "---",
    "",
    recording.transcript?.trim() ?? "",
    "",
  ].join("\n");
}

/** How long a recording ran, for a human rather than a stopwatch. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "Length unknown";
  if (seconds < 60) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m} min ${s} sec` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} hr ${m % 60} min`;
}
