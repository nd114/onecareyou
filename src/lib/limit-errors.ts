/**
 * The database refuses a new patient connection or team seat over the plan's
 * limit with a named error (see the tier_limits migration):
 *
 *   patient_limit_reached  SQLSTATE OC001  DETAIL "scope=...; limit=...; active=..."
 *   seat_limit_reached     SQLSTATE OC002  DETAIL "limit=...; in_use=..."
 *
 * PostgREST hands these back as { code, message, details, hint }. This turns
 * them into something a person can act on, worded for who is reading: a
 * clinician adding a patient is told about their plan, a patient accepting an
 * invitation is not handed the clinician's billing.
 *
 * Every message says that what already exists is untouched. A limit only ever
 * pauses new additions.
 */

export type LimitKind = 'patients' | 'seats';

export const EXISTING_UNAFFECTED = 'Existing patients and records are unaffected.';

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function asErrorLike(error: unknown): ErrorLike {
  return error && typeof error === 'object' ? (error as ErrorLike) : {};
}

/** Which limit an error is about, or null when it is some other error. */
export function limitErrorKind(error: unknown): LimitKind | null {
  const e = asErrorLike(error);
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : error instanceof Error ? error.message : '';
  if (code === 'OC001' || message.includes('patient_limit_reached')) return 'patients';
  if (code === 'OC002' || message.includes('seat_limit_reached')) return 'seats';
  return null;
}

export function isLimitError(error: unknown): boolean {
  return limitErrorKind(error) !== null;
}

export interface LimitDetail {
  scope?: string;
  limit?: number;
  used?: number;
}

/** Reads the numbers out of the error DETAIL, when present. */
export function limitErrorDetail(error: unknown): LimitDetail {
  const details = asErrorLike(error).details;
  if (typeof details !== 'string') return {};
  const pick = (key: string) => {
    const m = details.match(new RegExp(`${key}=([^;]+)`));
    return m ? m[1].trim() : undefined;
  };
  const num = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    scope: pick('scope'),
    limit: num(pick('limit')),
    used: num(pick('active') ?? pick('in_use')),
  };
}

/**
 * Who is looking at the message.
 *  - `clinician`: a clinician or practice adding a patient to their own list.
 *  - `patient`: a patient connecting to a provider (accepting an invitation,
 *    sharing with a clinician).
 *  - `owner`: someone inviting or adding a team member.
 *  - `invitee`: someone accepting an invitation to join a practice.
 */
export type LimitAudience = 'clinician' | 'patient' | 'owner' | 'invitee';

/**
 * A friendly message for a limit error, or null if the error is not one (so a
 * caller can fall through to its own handling).
 */
export function limitErrorMessage(error: unknown, audience: LimitAudience = 'clinician'): string | null {
  const kind = limitErrorKind(error);
  if (!kind) return null;
  const { limit, scope } = limitErrorDetail(error);

  if (kind === 'patients') {
    if (audience === 'patient') {
      return 'This provider cannot add new patients right now. Nothing has changed for you, and your records are unaffected. You can ask them to get in touch with OneCare, or try again later.';
    }
    const who = scope === 'practice' ? 'Your practice has' : 'You have';
    const of = limit !== undefined ? ` of ${limit.toLocaleString('en-US')} patient${limit === 1 ? '' : 's'}` : '';
    return `${who} reached the patient limit${of} on the current plan, so no new patients can be added. ${EXISTING_UNAFFECTED} A slot frees up when a patient disconnects, or you can upgrade.`;
  }

  if (audience === 'invitee') {
    return 'This practice has no free team seat right now, so you cannot join yet. Ask the practice owner to free a seat or upgrade, then accept the invitation again.';
  }
  const of = limit !== undefined ? ` of ${limit.toLocaleString('en-US')} seat${limit === 1 ? '' : 's'}` : '';
  return `Your practice has used all the team seats${of} on its plan, so no new members can be added or invited. Existing members and their access are unaffected. A seat frees up when someone leaves, or you can upgrade.`;
}
