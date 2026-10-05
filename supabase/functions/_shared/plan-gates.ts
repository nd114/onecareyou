/**
 * Who a plan lets use a paid AI feature. Decision logic only: it imports no
 * Deno or Supabase module, so the edge functions and the unit tests share it.
 *
 * Two founder decisions are enforced here, on the server, so a hand-made request
 * gets the same answer as the app:
 *
 *   1. Patient AI (the assistant, lab-report parsing, document summaries) is a
 *      Plus feature. Free patients get none.
 *   2. The clinician scribe (visit scribe, dictation, voice memos) is not part
 *      of Individual or Community. Trial, Practice, Clinic and Enterprise have it.
 *
 * A lookup that fails is never an answer. The caller gets a retryable 503, not
 * a silent allow (free riders) and not a refusal (a paying customer locked out
 * by a database blip).
 */
import { entitlementsFor, loadTierLimits, type Entitlements, type TierLimitRow } from "./entitlements.ts";

// deno-lint-ignore no-explicit-any
type Client = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

export type GateDecision =
  | { allow: true }
  | { allow: false; status: 403 | 503; error: "plus_required" | "scribe_not_in_plan" | "plan_check_failed"; message: string; retryable: boolean };

// ---------------------------------------------------------------------------
// Patient AI: Plus only
// ---------------------------------------------------------------------------

/**
 * Stored profiles.subscription_tier values that are a paid patient plan. Mirrors
 * useSubscription.isPremium (premium, family, enterprise). check-subscription
 * writes 'premium' for an active Stripe subscription and 'free' otherwise, and a
 * lifetime or admin-granted plan is a stored 'premium', so the profile row is
 * the one source both the app and the functions read.
 */
export const PAID_PATIENT_TIERS: readonly string[] = ["premium", "family", "enterprise"];

export function patientHasPlus(tier: string | null | undefined): boolean {
  return !!tier && PAID_PATIENT_TIERS.includes(tier);
}

export const PLUS_REQUIRED_MESSAGE =
  "The AI assistant, lab-report reading and document summaries are part of OneCare Plus. See Pricing to upgrade.";

/**
 * `lookup` is what reading the profile produced: the stored tier (null when the
 * profile has none, which is a free account), or "error" when the read failed.
 */
export function decidePatientAi(lookup: string | null | "error"): GateDecision {
  if (lookup === "error") {
    return {
      allow: false,
      status: 503,
      error: "plan_check_failed",
      message: "We could not check your plan just now. Please try again in a moment.",
      retryable: true,
    };
  }
  if (patientHasPlus(lookup)) return { allow: true };
  return { allow: false, status: 403, error: "plus_required", message: PLUS_REQUIRED_MESSAGE, retryable: false };
}

/** Reads the caller's stored tier and decides. Never throws. */
export async function checkPatientAi(admin: Client, userId: string): Promise<GateDecision> {
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("subscription_tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return decidePatientAi("error");
    return decidePatientAi((data?.subscription_tier as string | null | undefined) ?? null);
  } catch {
    return decidePatientAi("error");
  }
}

// ---------------------------------------------------------------------------
// Clinician scribe: not in Individual or Community
// ---------------------------------------------------------------------------

export const SCRIBE_NOT_IN_PLAN_MESSAGE =
  "The scribe is not part of your plan. Practice, Clinic and Enterprise include it.";

/**
 * entitlements_for reports `scribe_included` for the clinician's own plan, and
 * `tier` for the plan they work under (a Practice seat lifts it). Either one
 * granting the scribe is enough, so a clinician seated in a Practice is not
 * locked out by a personal Community profile. The tier_limits row is the
 * authority for what a tier includes; nothing here names a tier.
 */
export function scribeIncluded(
  ent: Pick<Entitlements, "tier" | "scribe_included"> | null | undefined,
  limits: Record<string, TierLimitRow> | null | undefined,
): boolean {
  if (!ent) return false;
  if (ent.scribe_included === true) return true;
  return limits?.[ent.tier]?.scribe_included === true;
}

export function decideScribe(
  ent: Pick<Entitlements, "tier" | "scribe_included"> | null | undefined,
  limits: Record<string, TierLimitRow> | null | undefined,
): GateDecision {
  // No entitlements, or no tier table to read, is "could not tell", not "no".
  if (!ent || !limits) {
    return {
      allow: false,
      status: 503,
      error: "plan_check_failed",
      message: "We could not check your plan just now. Please try again in a moment.",
      retryable: true,
    };
  }
  if (scribeIncluded(ent, limits)) return { allow: true };
  return {
    allow: false,
    status: 403,
    error: "scribe_not_in_plan",
    message: SCRIBE_NOT_IN_PLAN_MESSAGE,
    retryable: false,
  };
}

/** Reads the clinician's entitlements (service-role client) and decides. Never throws. */
export async function checkScribe(admin: Client, userId: string): Promise<GateDecision> {
  try {
    const [ent, limits] = await Promise.all([entitlementsFor(admin, userId), loadTierLimits(admin)]);
    return decideScribe(ent, limits);
  } catch {
    return decideScribe(null, null);
  }
}

/** The JSON body a refused call returns. */
export function gateBody(d: Extract<GateDecision, { allow: false }>) {
  return { error: d.error, message: d.message, retryable: d.retryable };
}
