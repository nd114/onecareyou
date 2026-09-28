/**
 * Does a provider share open a patient's record to a given clinician?
 *
 * The database answers this for RLS in clinician_has_patient_permission(),
 * but every edge function that reads or writes with the service role bypasses
 * RLS and has to ask the same question itself. Several were asking it
 * differently: matching the caller's email as typed rather than as confirmed
 * (the hole 20261003000000_confirmed_email_for_every_share_claim.sql closed in
 * SQL), forgetting expiry, or never checking the permission at all. This is
 * the one answer, shaped like the SQL:
 *
 *   active AND not expired
 *   AND (claimed by this clinician OR addressed to their CONFIRMED email)
 *   AND share_grants(permissions, permission)
 *
 * Pure apart from `clinicianShareGrants`, so the browser test suite can run it.
 */
import { shareGrants } from "./share-permissions.ts";

export interface ShareAccessRow {
  user_id?: string | null;
  clinician_user_id: string | null;
  provider_email: string | null;
  is_active: boolean | null;
  expires_at: string | null;
  permissions: Record<string, unknown> | null;
}

export interface ShareCaller {
  id: string;
  /** Lower-cased, and only when the address has been confirmed. */
  confirmedEmail: string | null;
}

/**
 * The caller's email only when they have proved they can read it. An address
 * typed at sign-up and never confirmed is not an identity; matching on one is
 * how an unconfirmed "dr.smith@clinic.com" account inherits Dr Smith's shares.
 */
export function confirmedEmailOf(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined,
): string | null {
  if (!user?.email || !user.email_confirmed_at) return null;
  return user.email.trim().toLowerCase() || null;
}

/** Whether this share opens `permission` (or any access, when omitted) to the caller. */
export function shareOpensTo(
  share: ShareAccessRow | null | undefined,
  caller: ShareCaller,
  permission?: string,
  now: Date = new Date(),
): boolean {
  if (!share || share.is_active !== true) return false;
  if (share.expires_at && new Date(share.expires_at) <= now) return false;

  const byClaim = !!share.clinician_user_id && share.clinician_user_id === caller.id;
  const byEmail =
    !!caller.confirmedEmail &&
    !!share.provider_email &&
    share.provider_email.trim().toLowerCase() === caller.confirmedEmail;
  if (!byClaim && !byEmail) return false;

  return permission ? shareGrants(share.permissions, permission) : true;
}

// deno-lint-ignore no-explicit-any
type AdminClient = { from: (table: string) => any };

/**
 * Service-role lookup: does `caller` hold a live share from `patientUserId`
 * that grants `permission`? For background jobs acting on a clinician's behalf
 * (EHR import, vital alerts) pass `confirmedEmail: null` — only a claimed share
 * counts, which is the conservative reading when no one is present to ask.
 *
 * Institution (practice) access is deliberately not considered here: those
 * gates are written against auth.uid() and cannot be asked on someone else's
 * behalf, so this fails closed for them.
 */
export async function clinicianShareGrants(
  admin: AdminClient,
  caller: ShareCaller,
  patientUserId: string,
  permission?: string,
): Promise<boolean> {
  if (!patientUserId) return false;
  const { data, error } = await admin
    .from("provider_shares")
    .select("clinician_user_id, provider_email, is_active, expires_at, permissions")
    .eq("user_id", patientUserId)
    .eq("is_active", true);
  if (error || !Array.isArray(data)) return false;
  return (data as ShareAccessRow[]).some((s) => shareOpensTo(s, caller, permission));
}
