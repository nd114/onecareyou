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
 *   caller is a clinician account
 *   AND active AND not expired
 *   AND (claimed by this clinician OR addressed to their CONFIRMED email)
 *   AND share_grants(permissions, permission)
 *
 * "Clinician account" is public.is_clinician_account(), the app's own
 * definition (a clinician profile, an active practice membership, or a pending
 * tenant-owner invitation). Without it a patient account whose confirmed
 * address matched a share read that patient's record (20261010050000).
 *
 * `shareOpensTo` is pure, so the browser test suite can run it; the async
 * helpers ask the database, so they cannot drift from the SQL gates.
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
  /**
   * From isClinicianAccount(). Required rather than defaulted, so no caller
   * can forget to ask and quietly open shares to a patient account.
   */
  isClinician: boolean;
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
  if (caller.isClinician !== true) return false;
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
type AdminClient = { rpc: (fn: string, args?: Record<string, unknown>) => any };

/**
 * Service-role lookup: is this account on the clinician side of the product?
 * Fails closed — an error answers "no", because the alternative is opening a
 * patient's record to somebody we could not identify.
 */
export async function isClinicianAccount(admin: AdminClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await admin.rpc("is_clinician_account", { _user_id: userId });
  return !error && data === true;
}

/**
 * Service-role lookup: does `clinicianUserId` hold a live share from
 * `patientUserId` that grants `permission` (any access, when omitted)?
 *
 * Asks public.clinician_can_see_patient_as(), which is the same test as
 * clinician_has_patient_permission() evaluated for a named account, including
 * the confirmed-email match and the clinician-account requirement. Background
 * jobs acting for a clinician who is not present (vital alerts, EHR sync,
 * webhook, export) therefore honour exactly what the app lets that clinician
 * see. They used to count claimed shares only, which silently dropped the
 * alerts of a clinician who had set a rule on a share addressed to them but
 * not yet opened.
 *
 * Returns null when the database could not be asked, so a caller that would
 * act on a definite "no" can tell that apart from an outage. Treat null as
 * "not now", never as "yes".
 *
 * Institution (practice) access is deliberately not considered here: those
 * gates are written against auth.uid() and cannot be asked on someone else's
 * behalf, so this fails closed for them.
 */
export async function clinicianCanSeePatientAs(
  admin: AdminClient,
  clinicianUserId: string,
  patientUserId: string,
  permission?: string,
): Promise<boolean | null> {
  if (!clinicianUserId || !patientUserId) return false;
  const { data, error } = await admin.rpc("clinician_can_see_patient_as", {
    _clinician: clinicianUserId,
    _patient: patientUserId,
    _permission: permission ?? null,
  });
  if (error || typeof data !== "boolean") return null;
  return data;
}

/**
 * clinicianCanSeePatientAs, collapsed to a yes/no that fails closed. Takes the
 * caller object the interactive functions already build; only its id is used,
 * because the database resolves the confirmed email and the clinician-account
 * question itself.
 */
export async function clinicianShareGrants(
  admin: AdminClient,
  caller: { id: string },
  patientUserId: string,
  permission?: string,
): Promise<boolean> {
  return (await clinicianCanSeePatientAs(admin, caller.id, patientUserId, permission)) === true;
}
