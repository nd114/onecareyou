/**
 * Features that exist in the code but are switched off, by the founder's
 * decision, until later in the roadmap.
 *
 * One file, shared by the app (through src/lib/features.ts) and by the edge
 * functions, so a feature cannot be hidden on screen while a background job
 * goes on doing it, or the other way round. Imports nothing, so it runs in
 * Deno and in the browser.
 */

/**
 * Caregivers: missed-dose alert contacts (care_alert_settings, sent by
 * check-care-alerts) and every screen that offers to add "someone who cares
 * for you".
 *
 * Paused by the founder: who cares for a patient changes over time, and the
 * product does not model that yet. Off means hidden and not sent; nothing is
 * deleted, so turning it back on restores what patients had set up.
 *
 * Not covered, deliberately: a patient keeping records for their own family
 * members (FamilyContext, the family dashboard). That is the patient's own
 * data, not a second person acting for them.
 */
export const CAREGIVERS_ENABLED = false;
