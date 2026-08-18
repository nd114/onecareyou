/**
 * Feature flags for surfaces that are built but deliberately not shown.
 *
 * A flag here hides entry points only. The underlying tables, hooks and
 * components stay in place and keep working, so switching a flag back on is a
 * one-line change rather than a rebuild.
 */

/**
 * Family health management — managing a relative's medications, vitals and
 * documents from your own account.
 *
 * Turned off in August 2026 after platform review. The feature works in
 * isolation but does not hold together end to end: a medication added for a
 * family member did not appear in that member's list, a vital recorded for them
 * redirected to the account holder's own screen and only surfaced after
 * switching context, and nothing recorded *who* entered a reading on someone
 * else's behalf. That last point is the blocking one — recording into another
 * person's health record without attribution is an audit problem, not a
 * cosmetic one.
 *
 * The deeper question behind it: a family member who wants their own OneCare
 * account has nowhere to go, because their record lives inside someone else's.
 * The intended shape is the reverse — each person holds their own account and
 * grants view (later edit) access to a relative, with every write attributed to
 * whoever made it. That is a piece of design work, not a bug fix.
 *
 * Until then patients can share their own credentials with a relative, which is
 * what most do anyway. Revisit when there is room to build delegated access
 * properly.
 *
 * To restore: set this to true. Routes, the header switcher, the "recording
 * for" pickers and the Family nav entry all read this flag.
 */
export const FAMILY_HEALTH_ENABLED = false;
