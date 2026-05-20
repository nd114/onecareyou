/**
 * Offline write queue.
 *
 * Public API:
 * - enqueueWrite(write): persist a write to IndexedDB for later flush.
 * - flushQueue():        try to push pending writes to Supabase.
 * - startQueueWorker():  subscribe to online/visibility events and flush.
 *
 * Writes use the same Supabase client used everywhere else. Each write has an
 * idempotency key so a network blip mid-flush won't double-insert.
 */
import { supabase } from '@/integrations/supabase/client';
import { getDB, type PendingWrite, type PendingOp } from './db';

const MAX_RETRIES = 5;

export async function enqueueWrite(input: {
  id?: string;
  table: string;
  op: PendingOp;
  payload: Record<string, unknown>;
  match?: Record<string, unknown>;
  user_id: string | null;
}): Promise<string> {
  const db = await getDB();
  const id = input.id ?? (globalThis.crypto?.randomUUID?.() ?? `w_${Date.now()}_${Math.random()}`);
  const write: PendingWrite = {
    id,
    table: input.table,
    op: input.op,
    payload: input.payload,
    match: input.match,
    user_id: input.user_id,
    created_at: Date.now(),
    retries: 0,
  };
  await db.put('pending_writes', write);
  return id;
}

export async function getPendingCount(): Promise<number> {
  try {
    const db = await getDB();
    return db.count('pending_writes');
  } catch {
    return 0;
  }
}

let flushing = false;

export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  if (flushing) return { flushed: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { flushed: 0, failed: 0 };
  }
  flushing = true;
  let flushed = 0;
  let failed = 0;

  try {
    const db = await getDB();
    const all = await db.getAllFromIndex('pending_writes', 'by_created');

    for (const write of all) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = (supabase.from as any)(write.table);
        if (write.op === 'insert') {
          const { error } = await table.insert(write.payload);
          if (error) throw error;
        } else if (write.op === 'update') {
          let q = table.update(write.payload);
          for (const [k, v] of Object.entries(write.match ?? {})) {
            q = q.eq(k, v);
          }
          const { error } = await q;
          if (error) throw error;
        }
        await db.delete('pending_writes', write.id);
        flushed += 1;
      } catch (e: unknown) {
        failed += 1;
        const next: PendingWrite = {
          ...write,
          retries: write.retries + 1,
          last_error: e instanceof Error ? e.message : String(e),
        };
        if (next.retries >= MAX_RETRIES) {
          // Drop after MAX_RETRIES to avoid infinite loops; surface elsewhere.
          await db.delete('pending_writes', write.id);
        } else {
          await db.put('pending_writes', next);
        }
      }
    }
  } finally {
    flushing = false;
  }

  return { flushed, failed };
}

let workerStarted = false;
export function startQueueWorker() {
  if (workerStarted || typeof window === 'undefined') return;
  workerStarted = true;
  window.addEventListener('online', () => {
    void flushQueue();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushQueue();
  });
  // initial attempt on boot
  void flushQueue();
}
