// Storage allowances per plan. Kept alongside pricing-constants as the source of truth
// for anything storage-related (allowances, overage pricing, retention copy).

export const GB = 1024 * 1024 * 1024;

/** Patient plan allowances (documents, images, transcripts). */
export const PATIENT_STORAGE_GB = {
  free: 0.5,
  premium: 10,
} as const;

/** Clinician / practice plan allowances. Enterprise is a pooled tenant allowance. */
export const CLINICIAN_STORAGE_GB: Record<string, number> = {
  trial: 2,
  solo: 25,
  pro: 100,
  enterprise: 1000,
  expired: 2,
};

/** Extra storage packs, billed on top of the plan (bundled, not per-GB metered). */
export const STORAGE_PACKS = [
  { gb: 50, price: 9, label: '50 GB pack' },
  { gb: 250, price: 39, label: '250 GB pack' },
  { gb: 1000, price: 129, label: '1 TB pack' },
] as const;

/** Durability commitments that hold for everyone. */
export const DURABILITY_POINTS = [
  'Multi-zone replicated storage with automatic failover',
  'Point-in-time recovery for the database',
  'Weekly independent export to separate storage',
  'Restore drills documented in the compliance pack',
] as const;

/**
 * What happens to audio, which is not the same on both sides.
 *
 * Clinician dictation is a means to a note: the audio is transcribed and
 * discarded, and keeping it would mean holding a recording of a patient the
 * patient never agreed to. A patient recording their own appointment is the
 * opposite — the audio *is* the thing they wanted, and the transcript is the
 * convenience — so it stays until they remove it.
 *
 * These read as one line each in the storage card. Stating the wrong one is
 * how a durability promise quietly becomes untrue, so they are separate
 * constants rather than one sentence hedged to cover both.
 */
export const PATIENT_AUDIO_POINT =
  'Recordings you make are kept until you remove them — the audio and its transcript are both yours';

export const CLINICIAN_AUDIO_POINT =
  'Dictation audio is transcribed then discarded — the note is kept, the recording is not';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < GB) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

export function storagePercent(bytes: number, allowanceGb: number): number {
  if (!allowanceGb) return 0;
  return Math.min(100, Math.round((bytes / (allowanceGb * GB)) * 100));
}
