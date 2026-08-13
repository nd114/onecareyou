/**
 * Duplicate detection for clinician-managed patient records.
 *
 * Prevents duplicate charts when a clinician adds a patient manually who was
 * already imported from a CSV/EHR export (or added earlier by hand).
 */

export interface DedupCandidateInput {
  patient_name: string;
  patient_email?: string | null;
  patient_phone?: string | null;
  date_of_birth?: string | null;
}

export interface DedupRecord extends DedupCandidateInput {
  id: string;
}

export type DedupReason = 'email' | 'phone' | 'name_dob' | 'name';

export interface DedupMatch<T extends DedupRecord = DedupRecord> {
  record: T;
  reason: DedupReason;
  /** 1 = certain, 0 = unrelated */
  confidence: number;
}

const REASON_LABELS: Record<DedupReason, string> = {
  email: 'Same email address',
  phone: 'Same phone number',
  name_dob: 'Same name and date of birth',
  name: 'Same name',
};

export function dedupReasonLabel(reason: DedupReason): string {
  return REASON_LABELS[reason];
}

export function normaliseEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

/** Keeps digits only, then compares the last 9 digits so country prefixes don't break matching. */
export function normalisePhone(value?: string | null): string {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function normaliseName(value?: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Returns possible duplicates, strongest match first.
 * Never throws — safe to call on every keystroke.
 */
export function findDuplicateCandidates<T extends DedupRecord>(
  input: DedupCandidateInput,
  existing: T[],
): DedupMatch<T>[] {
  const email = normaliseEmail(input.patient_email);
  const phone = normalisePhone(input.patient_phone);
  const name = normaliseName(input.patient_name);
  const dob = (input.date_of_birth || '').trim();

  if (!email && !phone && !name) return [];

  const matches: DedupMatch<T>[] = [];

  for (const record of existing) {
    let reason: DedupReason | null = null;
    let confidence = 0;

    if (email && normaliseEmail(record.patient_email) === email) {
      reason = 'email';
      confidence = 1;
    } else if (phone && phone.length >= 7 && normalisePhone(record.patient_phone) === phone) {
      reason = 'phone';
      confidence = 0.95;
    } else if (name && normaliseName(record.patient_name) === name) {
      const recordDob = (record.date_of_birth || '').trim();
      if (dob && recordDob && dob === recordDob) {
        reason = 'name_dob';
        confidence = 0.9;
      } else if (!dob || !recordDob) {
        reason = 'name';
        confidence = 0.6;
      }
    }

    if (reason) matches.push({ record, reason, confidence });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}
