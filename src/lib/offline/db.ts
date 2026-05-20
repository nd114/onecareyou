/**
 * IndexedDB schema for OneCare's offline support.
 *
 * Two stores:
 * - pending_writes: queue of writes captured while offline; flushed when back online.
 * - cached_reads:   last-known payload for key reads (dashboard, vitals, meds),
 *                   so the app can render *something* offline.
 */
import { openDB, type IDBPDatabase } from 'idb';

export type PendingOp = 'insert' | 'update';

export interface PendingWrite {
  id: string; // idempotency key (uuid)
  table: string;
  op: PendingOp;
  payload: Record<string, unknown>;
  match?: Record<string, unknown>; // for update ops: WHERE clause
  user_id: string | null;
  created_at: number;
  retries: number;
  last_error?: string;
}

export interface CachedRead {
  key: string;            // e.g. `dashboard:${user_id}`
  payload: unknown;
  fetched_at: number;
}

const DB_NAME = 'onecare-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function open(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pending_writes')) {
        const store = db.createObjectStore('pending_writes', { keyPath: 'id' });
        store.createIndex('by_user', 'user_id');
        store.createIndex('by_created', 'created_at');
      }
      if (!db.objectStoreNames.contains('cached_reads')) {
        db.createObjectStore('cached_reads', { keyPath: 'key' });
      }
    },
    blocked() {
      // Another tab is holding an older version open.
    },
    blocking() {
      // A newer version wants to upgrade; release our handle.
      dbPromise = null;
    },
    terminated() {
      // Connection was abnormally closed (HMR, browser eviction, etc.).
      dbPromise = null;
    },
  }).then((db) => {
    // If the connection later closes (e.g. HMR reload), drop our cached promise
    // so the next caller re-opens instead of reusing a dead handle.
    db.addEventListener('close', () => {
      dbPromise = null;
    });
    return db;
  });
}

export async function getDB(): Promise<IDBPDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB not available');
  }
  if (!dbPromise) {
    dbPromise = open();
  }
  try {
    return await dbPromise;
  } catch (err) {
    dbPromise = null;
    throw err;
  }
}
