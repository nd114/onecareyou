/**
 * The browser's side of a KingsChat sign-in, kept apart from the components so
 * it can be tested.
 *
 * A login is bound to the browser that began it (20261009110000). Beginning
 * returns a nonce, which goes in the KingsChat link and is therefore public,
 * and a browser secret, which is kept here and nowhere else. When the user
 * approves in KingsChat, the callback sends the approving browser back to
 * /auth/kingschat/complete with the nonce and a completion code in the
 * fragment. That page claims the session with the nonce, the code and the
 * secret it finds here. If this browser did not begin the login, there is no
 * secret here for that nonce, and nothing is claimed.
 *
 * localStorage rather than sessionStorage because the approval happens in a
 * popup, which is a separate tab with its own session storage.
 */

export const KINGSCHAT_CLIENT_ID = "45b995ce-a27e-49b2-9047-8d43229b0d46";
export const KINGSCHAT_LOGIN_URL = "https://accounts.kingschat.online/log-in";
export const KINGSCHAT_COMPLETE_PATH = "/auth/kingschat/complete";

/** Same-origin channel the completion page reports on. */
export const KINGSCHAT_RESULT_CHANNEL = "onecare-kingschat-login";
/** Fallback for browsers without BroadcastChannel: a storage event. */
export const KINGSCHAT_RESULT_KEY = "onecare.kingschat.result";

const PENDING_KEY = "onecare.kingschat.pending";
/** Matches the attempt's expiry in the database. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export interface PendingKingsChatLogin {
  nonce: string;
  secret: string;
  /** Internal path to land on afterwards. */
  redirectTo: string;
  /** 'popup': a waiting window will take over. 'redirect': this tab left for KingsChat. */
  mode: "popup" | "redirect";
  expiresAt: number;
}

export interface KingsChatResultMessage {
  nonce: string;
  outcome: "signed-in" | "failed";
  error?: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readAll(storage: StorageLike, now: number): PendingKingsChatLogin[] {
  try {
    const raw = storage.getItem(PENDING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PendingKingsChatLogin =>
        !!p &&
        typeof p.nonce === "string" &&
        typeof p.secret === "string" &&
        typeof p.redirectTo === "string" &&
        (p.mode === "popup" || p.mode === "redirect") &&
        typeof p.expiresAt === "number" &&
        p.expiresAt > now,
    );
  } catch {
    return [];
  }
}

function writeAll(storage: StorageLike, entries: PendingKingsChatLogin[]) {
  try {
    if (entries.length) storage.setItem(PENDING_KEY, JSON.stringify(entries));
    else storage.removeItem(PENDING_KEY);
  } catch {
    // Storage full or blocked: the completion page will say it cannot finish.
  }
}

export function savePendingLogin(
  storage: StorageLike,
  entry: Omit<PendingKingsChatLogin, "expiresAt">,
  now = Date.now(),
) {
  const rest = readAll(storage, now).filter((p) => p.nonce !== entry.nonce);
  writeAll(storage, [...rest, { ...entry, expiresAt: now + PENDING_TTL_MS }]);
}

/** Read and forget: the secret is for one claim. */
export function takePendingLogin(
  storage: StorageLike,
  nonce: string,
  now = Date.now(),
): PendingKingsChatLogin | null {
  const all = readAll(storage, now);
  const found = all.find((p) => p.nonce === nonce) ?? null;
  writeAll(storage, all.filter((p) => p.nonce !== nonce));
  return found;
}

export function forgetPendingLogin(storage: StorageLike, nonce: string, now = Date.now()) {
  writeAll(storage, readAll(storage, now).filter((p) => p.nonce !== nonce));
}

/** The KingsChat link. Carries the nonce, never the secret. */
export function buildKingsChatLoginUrl(nonce: string): string {
  return `${KINGSCHAT_LOGIN_URL}?clientId=${encodeURIComponent(
    KINGSCHAT_CLIENT_ID,
  )}&origin=${encodeURIComponent(nonce)}`;
}

/** `#n=<nonce>&c=<code>` as the callback writes it. */
export function parseCompletionFragment(
  hash: string,
): { nonce: string; code: string | null } | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const nonce = params.get("n");
  if (!nonce || nonce.length > 128) return null;
  const code = params.get("c");
  return { nonce, code: code && code.length <= 128 ? code : null };
}

export function isResultMessage(value: unknown): value is KingsChatResultMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.nonce === "string" &&
    (v.outcome === "signed-in" || v.outcome === "failed") &&
    (v.error === undefined || typeof v.error === "string")
  );
}
