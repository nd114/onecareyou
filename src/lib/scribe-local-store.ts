/**
 * Local safety net for the ambient scribe.
 *
 * A visit is the one thing that cannot be re-recorded, so audio is written to
 * this device before anything leaves it, and kept until the server confirms a
 * draft. Two kinds of record:
 *
 *  - `recordings`: a finished WAV waiting for upload / drafting.
 *  - `sessions` + `chunks`: a recording still in progress, written in slices so
 *    a reload or a discarded mobile tab can still offer what was heard.
 *
 * Nothing here is logged or sent anywhere; it only touches IndexedDB. Where
 * IndexedDB is unavailable (private modes, old browsers) it falls back to
 * memory so the pipeline still works, it is just not durable.
 */

export interface PendingRecording {
  id: string;
  userId: string;
  encounterId: string;
  blob: Blob;
  transcript: string;
  noteStyle: string;
  createdAt: number;
  /** Recorder-measured length; the server meters from real audio, this is advisory. */
  durationSeconds?: number;
  /** Set when the recording was rebuilt from chunks after an interruption. */
  recovered?: boolean;
  /** Where to send the clinician back to (a local app path; kept on this device only). */
  returnTo?: string;
}

export interface SessionMeta {
  id: string;
  userId: string;
  encounterId: string;
  sampleRate: number;
  startedAt: number;
  transcript: string;
  noteStyle: string;
  returnTo?: string;
  /** Updated while recording; a session that stops beating was interrupted. */
  heartbeatAt?: number;
}

export interface ChunkRecord {
  key: string;
  sessionId: string;
  seq: number;
  samples: Float32Array;
}

export type StoreName = "recordings" | "sessions" | "chunks";

export interface KV {
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  delete(store: StoreName, key: string): Promise<void>;
}

export function createMemoryKV(): KV {
  const data: Record<StoreName, Map<string, unknown>> = {
    recordings: new Map(),
    sessions: new Map(),
    chunks: new Map(),
  };
  return {
    async put(store, key, value) {
      data[store].set(key, value);
    },
    async getAll<T>(store: StoreName) {
      return [...data[store].values()] as T[];
    },
    async delete(store, key) {
      data[store].delete(key);
    },
  };
}

const DB_NAME = "onecare-scribe";
const STORES: StoreName[] = ["recordings", "sessions", "chunks"];

function createIdbKV(): KV | null {
  if (typeof indexedDB === "undefined") return null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          for (const s of STORES) {
            if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => {
        dbPromise = null;
      });
    }
    return dbPromise;
  };
  const run = async <R>(
    store: StoreName,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest,
  ): Promise<R> => {
    const db = await open();
    return new Promise<R>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result as R);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    put: (store, key, value) => run<void>(store, "readwrite", (s) => s.put(value, key)),
    getAll: <R>(store: StoreName) => run<R[]>(store, "readonly", (s) => s.getAll()),
    delete: (store, key) => run<void>(store, "readwrite", (s) => s.delete(key)),
  };
}

let backend: KV | null = null;
const fallback = createMemoryKV();

function kv(): KV {
  if (!backend) backend = createIdbKV() ?? fallback;
  return backend;
}

/** For tests: swap the storage backend (null restores the default). */
export function setScribeStoreBackend(next: KV | null) {
  backend = next;
}

/** A storage failure must never take down a recording; it just reports "not saved". */
async function safe<R>(fn: () => Promise<R>, otherwise: R): Promise<R> {
  try {
    return await fn();
  } catch {
    return otherwise;
  }
}

export const savePending = (rec: PendingRecording) =>
  safe(async () => {
    await kv().put("recordings", rec.id, rec);
    return true;
  }, false);

export const listPending = (userId: string) =>
  safe(async () => {
    const all = await kv().getAll<PendingRecording>("recordings");
    return all.filter((r) => r.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  }, [] as PendingRecording[]);

export const deletePending = (id: string) => safe(() => kv().delete("recordings", id), undefined);

export const saveSession = (meta: SessionMeta) =>
  safe(async () => {
    await kv().put("sessions", meta.id, meta);
    return true;
  }, false);

export const listSessions = (userId: string) =>
  safe(async () => {
    const all = await kv().getAll<SessionMeta>("sessions");
    return all.filter((s) => s.userId === userId);
  }, [] as SessionMeta[]);

export const appendChunk = (sessionId: string, seq: number, samples: Float32Array) =>
  safe(async () => {
    const key = `${sessionId}:${String(seq).padStart(8, "0")}`;
    const rec: ChunkRecord = { key, sessionId, seq, samples };
    await kv().put("chunks", key, rec);
    return true;
  }, false);

export const listChunks = (sessionId: string) =>
  safe(async () => {
    const all = await kv().getAll<ChunkRecord>("chunks");
    return all.filter((c) => c.sessionId === sessionId).sort((a, b) => a.seq - b.seq);
  }, [] as ChunkRecord[]);

/** Remove a session and every chunk of it. */
export const deleteSession = (sessionId: string) =>
  safe(async () => {
    const all = await kv().getAll<ChunkRecord>("chunks");
    for (const c of all) if (c.sessionId === sessionId) await kv().delete("chunks", c.key);
    await kv().delete("sessions", sessionId);
  }, undefined);

/** Hand the audio back to the clinician as a file when everything else failed. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
