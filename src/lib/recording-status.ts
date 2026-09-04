/**
 * What state a recording's transcript is in, and what to offer about it.
 *
 * Kept out of the component because the interesting case is not a happy path:
 * transcription runs in an edge function that can time out, be interrupted by
 * a closed tab, or fail after the row has already been marked 'pending'. A
 * status column has no way of knowing that happened, so a row can sit at
 * 'pending' forever and the button that would fix it stays disabled — the
 * patient is locked out of their own transcript by a spinner.
 *
 * So "is it still working" is a question about elapsed time, not just about
 * the stored status.
 */

import type { TranscriptStatus } from '@/hooks/usePatientRecordings';

/**
 * How long a transcript may claim to be in progress before we stop believing
 * it. Generous: a long consultation genuinely takes a while, and offering a
 * retry too early invites people to queue the same work twice.
 */
export const TRANSCRIPT_STALE_AFTER_MS = 15 * 60 * 1000;

export interface TranscriptSubject {
  transcript_status: TranscriptStatus;
  /** When the row was last touched — the pending mark is a write. */
  updated_at: string;
}

/** True while we still expect the transcription that is running to finish. */
export function isTranscriptInFlight(recording: TranscriptSubject, now: Date = new Date()): boolean {
  if (recording.transcript_status !== 'pending') return false;
  const startedAt = Date.parse(recording.updated_at);
  if (Number.isNaN(startedAt)) return false;
  return now.getTime() - startedAt < TRANSCRIPT_STALE_AFTER_MS;
}

/**
 * The words on the menu item, which have to carry the state on their own —
 * there is no room for a status line inside a dropdown.
 */
export function transcriptActionLabel(
  recording: TranscriptSubject,
  now: Date = new Date(),
): string {
  if (isTranscriptInFlight(recording, now)) return 'Writing a transcript…';
  switch (recording.transcript_status) {
    case 'failed':
      return 'Try the transcript again';
    case 'pending':
      // In flight is already ruled out, so this one has been sitting long
      // enough that something went wrong without saying so.
      return 'Transcript stalled — try again';
    default:
      return 'Write a transcript';
  }
}
