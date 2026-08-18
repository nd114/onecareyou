/**
 * Per-account storage for AI chat transcripts.
 *
 * These conversations carry whatever health detail the person typed into the
 * assistant. They used to be kept under a fixed key per surface, with nothing
 * clearing them on sign-out — so the next account to sign in on the same
 * browser loaded the previous person's conversation. Confirmed in review on a
 * shared device.
 *
 * Two changes close it: the key is scoped to the account, so two people on one
 * browser never collide even without signing out; and the whole namespace is
 * swept on sign-out, so nothing is left on disk afterwards.
 */

/** Every per-account chat key lives under this prefix so it can be swept. */
export const CHAT_STORAGE_PREFIX = 'onecare.chat.';

/**
 * Fixed keys written before conversations were scoped per account. Existing
 * browsers still hold one person's transcript under these, so they are purged
 * on start-up as well as on sign-out.
 */
const LEGACY_CHAT_KEYS = [
  'onecare.assistant.chat.v1',
  'onecare.clinician-assistant.v1',
  'onecare.simple-mode.chat.v1',
] as const;

/**
 * Storage key for one chat surface and one account.
 *
 * Returns null when there is no signed-in account — a conversation with no
 * owner is never written to disk.
 */
export function chatStorageKey(
  surface: string,
  userId: string | null | undefined,
): string | null {
  if (!userId) return null;
  return `${CHAT_STORAGE_PREFIX}${surface}.${userId}`;
}

/** Removes every stored chat transcript. Called on sign-out. */
export function clearChatStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(CHAT_STORAGE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
    purgeLegacyChatStorage();
  } catch {
    /* storage unavailable (private mode, partitioned storage) */
  }
}

/**
 * Drops transcripts written under the old unscoped keys. Safe to call at any
 * time; it only removes the three legacy keys, never per-account ones.
 */
export function purgeLegacyChatStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    LEGACY_CHAT_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}
