/**
 * What a share's permissions object grants.
 *
 * Imports nothing, so it runs unchanged in Deno (the edge functions), in the
 * browser bundle, and in the test suite. That matters more here than anywhere
 * else in the codebase: the same question — "does this share open medications?"
 * — is asked in three runtimes plus SQL, and three of the four were answering
 * it by reading a key name directly.
 *
 * ## Why aliases exist at all
 *
 * The two sharing pathways grew separately and named the same things
 * differently. A clinician share carried `meds` and `profile`; an institution
 * share carried `medications`, `conditions` and `allergies`. A permissions
 * object written for one granted nothing through the other.
 *
 * `supabase/migrations/20260908100000_one_share_vocabulary.sql` converged them
 * on the canonical names and made `share_grants` resolve the old spellings, so
 * no stored consent had to be rewritten — rewriting rows that record what a
 * person agreed to is exactly the operation you do not want to get subtly
 * wrong. This file is the same resolution outside the database, and
 * `src/test/share-permissions.test.ts` asserts the two agree.
 *
 * ## Why `=== true` and nothing looser
 *
 * The SQL used to be `(permissions->>key)::boolean`, and Postgres reads 'yes',
 * 'on', 't' and 1 as true. So `{"vitals": "yes"}` was honoured by the database
 * while the interface, checking `=== true`, showed the same share as off. A
 * share the interface calls closed and the database calls open is the worst
 * kind of disagreement to have about consent. Both ends now require a literal
 * boolean.
 */

/** The canonical permissions. Anything else is an alias or not a permission. */
export const SHARE_PERMISSIONS = [
  "vitals",
  "medications",
  "adherence",
  "conditions",
  "allergies",
  /** The whole profile row, which is more than the two clinical lists. */
  "profile",
  "documents",
] as const;

export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

/**
 * Retired spellings, still stored on shares people already agreed to.
 *
 * Kept in step with `share_grants` in the database by the SQL suite.
 */
const ALIASES: Record<string, readonly string[]> = {
  // The clinician pathway's old name for medications.
  medications: ["meds"],
  // 'profile' was one grant covering both clinical lists, so it still opens
  // each of them.
  conditions: ["profile"],
  allergies: ["profile"],
};

/**
 * Asking for 'profile' means asking for the whole profile row. Granting the
 * two lists separately adds up to it; granting one of them does not.
 */
const IMPLIED_BY_ALL: Record<string, readonly string[]> = {
  profile: ["conditions", "allergies"],
};

function isGranted(permissions: Record<string, unknown>, key: string): boolean {
  return permissions[key] === true;
}

/** Whether a permissions object grants one canonical permission. */
export function shareGrants(
  permissions: Record<string, unknown> | null | undefined,
  permission: string,
): boolean {
  if (!permissions || typeof permissions !== "object") return false;
  if (isGranted(permissions, permission)) return true;
  if ((ALIASES[permission] ?? []).some((alias) => isGranted(permissions, alias))) return true;
  const parts = IMPLIED_BY_ALL[permission];
  if (parts && parts.every((part) => isGranted(permissions, part))) return true;
  return false;
}

/** Every key a stored share might legitimately carry, canonical or retired. */
export function acceptedShareKeys(): string[] {
  return Array.from(
    new Set([...SHARE_PERMISSIONS, ...Object.values(ALIASES).flat()]),
  ).sort();
}
