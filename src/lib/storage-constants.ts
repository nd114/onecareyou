// Storage allowances per plan. Kept alongside pricing-constants as the source of truth
// for anything storage-related (allowances, overage pricing, retention copy).

export const GB = 1024 * 1024 * 1024;

/** Patient plan allowances (documents, images, transcripts). */
export const PATIENT_STORAGE_GB = {
  free: 0.5,
  premium: 10,
} as const;

/** Clinician / practice plan allowances. Enterprise is a pooled tenant allowance. */
export const CLINICIAN_STORAGE_GB = {
  starter: 5,
  pro: 50,
  practice: 250,
  enterprise: 1000,
} as const;

/** Extra storage packs, billed on top of the plan (bundled, not per-GB metered). */
export const STORAGE_PACKS = [
  { gb: 50, price: 9, label: '50 GB pack' },
  { gb: 250, price: 39, label: '250 GB pack' },
  { gb: 1000, price: 129, label: '1 TB pack' },
] as const;

/** Durability commitments we publish to clinicians and patients. */
export const DURABILITY_POINTS = [
  'Multi-zone replicated storage with automatic failover',
  'Point-in-time recovery for the database',
  'Weekly independent export to separate storage',
  'Restore drills documented in the compliance pack',
  'Audio is transcribed then discarded by default — transcripts are kept, not recordings',
] as const;

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
