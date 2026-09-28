import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory stand-in for the two IndexedDB stores.
const stores: Record<string, Map<string, any>> = {
  cached_reads: new Map(),
  pending_writes: new Map(),
};
const fakeDb = {
  put: async (store: string, value: any) => {
    stores[store].set(value.key ?? value.id, value);
  },
  get: async (store: string, key: string) => stores[store].get(key),
  clear: async (store: string) => stores[store].clear(),
  delete: async (store: string, key: string) => {
    stores[store].delete(key);
  },
  count: async (store: string) => stores[store].size,
  getAllFromIndex: async (store: string) =>
    [...stores[store].values()].sort((a, b) => a.created_at - b.created_at),
};

vi.mock('@/lib/offline/db', () => ({ getDB: async () => fakeDb }));

const session = { current: null as null | { user: { id: string } } };
const inserted: Array<{ table: string; payload: unknown }> = [];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: session.current } }) },
    from: (table: string) => ({
      insert: async (payload: unknown) => {
        inserted.push({ table, payload });
        return { error: null };
      },
    }),
  },
}));

import { cacheRead, getCachedRead } from '@/lib/offline/cache';
import { enqueueWrite, flushQueue } from '@/lib/offline/queue';
import { clearAllUserData } from '@/lib/query-client';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

describe('offline storage and sign-out', () => {
  beforeEach(() => {
    stores.cached_reads.clear();
    stores.pending_writes.clear();
    inserted.length = 0;
    session.current = null;
  });

  it('drops the cached medications and vitals on sign-out', async () => {
    await cacheRead(`medications:${ALICE}`, [{ name: 'Lisinopril' }]);
    expect(await getCachedRead(`medications:${ALICE}`)).not.toBeNull();

    clearAllUserData();
    await vi.waitFor(async () => {
      expect(await getCachedRead(`medications:${ALICE}`)).toBeNull();
    });
  });

  it("never replays one account's queued writes under another account", async () => {
    await enqueueWrite({ table: 'vitals', op: 'insert', payload: { user_id: ALICE, value: 150 }, user_id: ALICE });

    session.current = { user: { id: BOB } };
    await flushQueue();
    expect(inserted).toHaveLength(0);
    expect(stores.pending_writes.size).toBe(1);

    session.current = { user: { id: ALICE } };
    await flushQueue();
    expect(inserted).toHaveLength(1);
    expect(stores.pending_writes.size).toBe(0);
  });

  it('replays nothing when nobody is signed in', async () => {
    await enqueueWrite({ table: 'vitals', op: 'insert', payload: { user_id: ALICE }, user_id: ALICE });
    await flushQueue();
    expect(inserted).toHaveLength(0);
  });
});
