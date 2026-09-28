/**
 * Stale-while-offline read cache.
 *
 * Stores the last-known payload for important reads (dashboard, vitals,
 * medications, schedule) so the app can paint *something* when offline.
 * Always re-fetches when online; the cache is only a fallback.
 */
import { getDB, type CachedRead } from './db';

export async function cacheRead(key: string, payload: unknown): Promise<void> {
  try {
    const db = await getDB();
    const entry: CachedRead = { key, payload, fetched_at: Date.now() };
    await db.put('cached_reads', entry);
  } catch {
    // best-effort
  }
}

/**
 * Drops every cached read. Called on sign-out: the store holds medications,
 * vitals and schedules, and IndexedDB outlives the session — on a shared
 * machine the next person at the keyboard could read the last one's record
 * straight out of DevTools.
 */
export async function clearCachedReads(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('cached_reads');
  } catch {
    // best-effort: no IndexedDB means nothing was cached
  }
}

export async function getCachedRead<T>(key: string): Promise<{ payload: T; fetched_at: number } | null> {
  try {
    const db = await getDB();
    const entry = (await db.get('cached_reads', key)) as CachedRead | undefined;
    if (!entry) return null;
    return { payload: entry.payload as T, fetched_at: entry.fetched_at };
  } catch {
    return null;
  }
}
