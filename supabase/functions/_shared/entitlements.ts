/**
 * Plan limits for edge functions.
 *
 * The numbers live in one place, the `tier_limits` table, and are enforced by
 * the database (entitlements_for and the patient and seat cap triggers). This
 * file reads them; it holds no figures of its own. Changing a limit is an edit
 * to a tier_limits row, not a change here.
 *
 * Imports nothing, so it runs in Deno and in the browser (the unit tests load
 * it under Node). The clients are typed structurally for that reason.
 */

/**
 * Older code and the clinician_profiles.patient_limit column store "unlimited"
 * as this number. tier_limits stores it as NULL; the two are translated here and
 * nowhere else.
 */
export const STORED_UNLIMITED = 999999;

export interface TierLimitRow {
  tier: string;
  patient_limit: number | null;
  seat_limit: number | null;
  storage_mb: number | null;
  scribe_included: boolean;
  scribe_minutes_monthly: number | null;
}

// deno-lint-ignore no-explicit-any
type Client = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

/** Every plan's limits, keyed by tier. Throws if the table cannot be read. */
export async function loadTierLimits(client: Client): Promise<Record<string, TierLimitRow>> {
  const { data, error } = await client
    .from('tier_limits')
    .select('tier, patient_limit, seat_limit, storage_mb, scribe_included, scribe_minutes_monthly');
  if (error) throw new Error(`Could not read tier_limits: ${error.message}`);
  const out: Record<string, TierLimitRow> = {};
  for (const row of (data ?? []) as TierLimitRow[]) out[row.tier] = row;
  return out;
}

/**
 * The value written to clinician_profiles.patient_limit for a tier. NULL
 * (unlimited) is stored as the legacy sentinel; a tier with no row stores 0, so
 * an unrecognised plan never grants anything.
 */
export function storedPatientLimit(limits: Record<string, TierLimitRow>, tier: string): number {
  const row = limits[tier];
  if (!row) return 0;
  return row.patient_limit === null ? STORED_UNLIMITED : row.patient_limit;
}

export interface Entitlements {
  tier: string;
  patient_limit: number | null;
  patient_count: number;
  seat_limit: number | null;
  seat_count: number;
  scribe_included: boolean;
  scribe_minutes_monthly: number | null;
  storage_mb: number | null;
  practice_id: string | null;
  practice_patient_limit: number | null;
  practice_patient_count: number | null;
  at_patient_limit: boolean;
  over_patient_limit: boolean;
  at_seat_limit: boolean;
  over_seat_limit: boolean;
}

/** entitlements_for(user), asked with a service-role client (any user) or the caller's own client (themselves). */
export async function entitlementsFor(client: Client, userId?: string): Promise<Entitlements | null> {
  const { data, error } = await client.rpc('entitlements_for', userId ? { _user: userId } : {});
  if (error) throw new Error(`entitlements_for failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Entitlements | undefined) ?? null;
}

export interface PatientCapacity {
  scope: 'clinician' | 'practice';
  /** null means unlimited. */
  limit: number | null;
  /** Distinct active patients already counted against the limit. */
  used: number;
}

/**
 * How many patients this clinician (or the practice, when the records are being
 * filed into one) already has against the allowance. Service-role client only:
 * the helpers it calls are not exposed to signed-in users.
 */
export async function patientCapacity(
  admin: Client,
  clinicianId: string,
  practiceId?: string | null,
): Promise<PatientCapacity> {
  const limitFn = practiceId ? '_practice_limits' : '_personal_patient_limit';
  const countFn = practiceId ? '_practice_patient_count' : '_personal_patient_count';
  const arg = practiceId ? { _pid: practiceId } : { _uid: clinicianId };

  const [limitRes, countRes] = await Promise.all([admin.rpc(limitFn, arg), admin.rpc(countFn, arg)]);
  if (limitRes.error) throw new Error(`${limitFn} failed: ${limitRes.error.message}`);
  if (countRes.error) throw new Error(`${countFn} failed: ${countRes.error.message}`);

  const limit = practiceId
    ? ((Array.isArray(limitRes.data) ? limitRes.data[0] : limitRes.data)?.patient_limit ?? null)
    : (limitRes.data ?? null);
  return {
    scope: practiceId ? 'practice' : 'clinician',
    limit: limit === null || limit === undefined ? null : Number(limit),
    used: Number(countRes.data ?? 0),
  };
}

/**
 * How many new patients may be added now. Existing patients are never touched:
 * an account already over its limit has none left, not a negative number.
 * Infinity means unlimited.
 */
export function remainingPatientSlots(cap: Pick<PatientCapacity, 'limit' | 'used'>): number {
  if (cap.limit === null) return Infinity;
  return Math.max(0, cap.limit - cap.used);
}
