/**
 * A Supabase client good enough to drive a journey.
 *
 * Journey tests need the client to behave the way the real one does — including
 * the ways it fails — without a network. This is not a database: it answers
 * queries from a fixture table and records what it was asked, which is enough
 * to test the join between screens, which is where the untested bugs are.
 *
 * The chain is a thenable proxy because that is the shape callers rely on:
 * `.from(t).select(c).eq(a, b).order(...).limit(n)` can be awaited at any point,
 * and `.single()` / `.maybeSingle()` change the result rather than the query.
 */

export interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface MockConfig {
  /** Rows returned per table. A function receives the calls made so far. */
  tables?: Record<string, unknown[] | (() => unknown[])>;
  /** Results per RPC name. */
  rpcs?: Record<string, MockResult | ((args: unknown) => MockResult)>;
  /** Results per edge function name. */
  functions?: Record<string, MockResult | ((body: unknown) => MockResult)>;
  /** The signed-in user, or null. */
  user?: { id: string; email?: string } | null;
  /** Rows returned by a `.single()` on a table with no fixture. */
  fallback?: MockResult;
}

export interface RecordedCall {
  kind: "select" | "insert" | "update" | "delete" | "upsert" | "rpc" | "invoke";
  target: string;
  payload?: unknown;
}

export function createSupabaseMock(config: MockConfig = {}) {
  const calls: RecordedCall[] = [];
  const user = config.user === undefined ? { id: "user-1", email: "jane.evans@example.com" } : config.user;

  const rowsFor = (table: string): unknown[] => {
    const entry = config.tables?.[table];
    if (typeof entry === "function") return entry();
    return entry ?? [];
  };

  function chain(table: string, kind: RecordedCall["kind"], payload?: unknown) {
    let single = false;
    let maybe = false;

    const result = (): MockResult => {
      const rows = kind === "select" ? rowsFor(table) : [];
      if (single || maybe) {
        const row = rows[0] ?? null;
        if (row === null && single) {
          // The real client errors on a `.single()` that matches nothing, and
          // code written against it branches on that. A mock that returns
          // `{data: null, error: null}` hides those branches.
          return { data: null, error: { message: "No rows found", code: "PGRST116" } };
        }
        return { data: row, error: null };
      }
      return { data: rows, error: null };
    };

    const proxy: Record<string, unknown> = {};
    const passthrough = [
      "select", "eq", "neq", "in", "is", "not", "or", "gt", "gte", "lt", "lte",
      "like", "ilike", "contains", "order", "limit", "range", "filter", "match",
      "overlaps", "textSearch", "abortSignal", "returns", "csv", "throwOnError",
    ];
    for (const method of passthrough) {
      proxy[method] = () => proxy;
    }
    proxy.single = () => {
      single = true;
      return proxy;
    };
    proxy.maybeSingle = () => {
      maybe = true;
      return proxy;
    };
    proxy.then = (resolve: (v: MockResult) => unknown) => Promise.resolve(result()).then(resolve);
    proxy.catch = () => proxy;
    proxy.finally = () => proxy;

    calls.push({ kind, target: table, payload });
    return proxy;
  }

  const client = {
    from: (table: string) => ({
      select: (...args: unknown[]) => chain(table, "select", args),
      insert: (payload: unknown) => chain(table, "insert", payload),
      update: (payload: unknown) => chain(table, "update", payload),
      upsert: (payload: unknown) => chain(table, "upsert", payload),
      delete: () => chain(table, "delete"),
    }),
    rpc: async (name: string, args?: unknown): Promise<MockResult> => {
      calls.push({ kind: "rpc", target: name, payload: args });
      const entry = config.rpcs?.[name];
      if (typeof entry === "function") return entry(args);
      return entry ?? { data: null, error: null };
    },
    functions: {
      invoke: async (name: string, options?: { body?: unknown }): Promise<MockResult> => {
        calls.push({ kind: "invoke", target: name, payload: options?.body });
        const entry = config.functions?.[name];
        if (typeof entry === "function") return entry(options?.body);
        return entry ?? { data: null, error: null };
      },
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({
        data: { session: user ? { user, access_token: "test-token" } : null },
        error: null,
      }),
      onAuthStateChange: (_event: unknown) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: async () => ({ data: { user }, error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user }, error: null }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "test/path" }, error: null }),
        remove: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/x" }, error: null }),
        download: async () => ({ data: new Blob(["x"]), error: null }),
      }),
    },
    channel: () => ({
      on: function () { return this; },
      subscribe: function () { return this; },
      unsubscribe: () => {},
    }),
    removeChannel: () => {},
  };

  return { client, calls };
}
