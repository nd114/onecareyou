import { describe, it, expect, beforeEach } from "vitest";
import {
  KINGSCHAT_COMPLETE_PATH,
  PENDING_TTL_MS,
  buildKingsChatLoginUrl,
  isResultMessage,
  parseCompletionFragment,
  savePendingLogin,
  takePendingLogin,
} from "@/lib/kingschat-login";
import {
  KINGSCHAT_COMPLETE_PATH as CALLBACK_COMPLETE_PATH,
  completionUrl,
  isAllowedReturnOrigin,
  normaliseOrigin,
  parseExtraOrigins,
} from "../../supabase/functions/_shared/kingschat-return";

/**
 * A KingsChat sign-in belongs to the browser that began it (20261009110000).
 * The SQL suite proves the database refuses a claim without the browser secret
 * and the completion code; these cover the two pieces around it — the secret
 * never leaving this browser, and the completion code only ever being sent
 * back to one of our own origins.
 */
describe("the browser secret", () => {
  beforeEach(() => window.localStorage.clear());

  const entry = {
    nonce: "n".repeat(64),
    secret: "s".repeat(64),
    redirectTo: "/dashboard",
    mode: "popup" as const,
  };

  it("is not in the KingsChat link", () => {
    const url = buildKingsChatLoginUrl(entry.nonce);
    expect(url).toContain(`origin=${entry.nonce}`);
    expect(url).not.toContain(entry.secret);
  });

  it("is found by the page that finishes the login, once", () => {
    savePendingLogin(window.localStorage, entry);
    expect(takePendingLogin(window.localStorage, entry.nonce)?.secret).toBe(entry.secret);
    expect(takePendingLogin(window.localStorage, entry.nonce)).toBeNull();
  });

  it("is not found for a login this browser did not begin", () => {
    savePendingLogin(window.localStorage, entry);
    expect(takePendingLogin(window.localStorage, "someone-elses-nonce")).toBeNull();
    // And looking does not disturb this browser's own login.
    expect(takePendingLogin(window.localStorage, entry.nonce)?.secret).toBe(entry.secret);
  });

  it("expires with the attempt", () => {
    const now = 1_000_000;
    savePendingLogin(window.localStorage, entry, now);
    expect(takePendingLogin(window.localStorage, entry.nonce, now + PENDING_TTL_MS + 1)).toBeNull();
  });

  it("survives garbage in storage", () => {
    window.localStorage.setItem("onecare.kingschat.pending", "{not json");
    expect(takePendingLogin(window.localStorage, entry.nonce)).toBeNull();
    savePendingLogin(window.localStorage, entry);
    expect(takePendingLogin(window.localStorage, entry.nonce)?.nonce).toBe(entry.nonce);
  });
});

describe("the completion fragment", () => {
  it("round-trips what the callback writes", () => {
    const url = new URL(completionUrl("https://onecare.you", "abc", "def"));
    expect(url.pathname).toBe(KINGSCHAT_COMPLETE_PATH);
    expect(url.search).toBe("");
    expect(parseCompletionFragment(url.hash)).toEqual({ nonce: "abc", code: "def" });
  });

  it("carries no code when the callback is reporting a failure", () => {
    const url = new URL(completionUrl("https://onecare.you", "abc"));
    expect(parseCompletionFragment(url.hash)).toEqual({ nonce: "abc", code: null });
  });

  it("is refused without a nonce", () => {
    expect(parseCompletionFragment("#c=def")).toBeNull();
    expect(parseCompletionFragment("")).toBeNull();
  });

  it("is the same path on both sides", () => {
    expect(CALLBACK_COMPLETE_PATH).toBe(KINGSCHAT_COMPLETE_PATH);
  });
});

describe("where the completion code may be sent", () => {
  it("is onecare.you and its tenant subdomains over https", () => {
    expect(isAllowedReturnOrigin("https://onecare.you")).toBe(true);
    expect(isAllowedReturnOrigin("https://lmc.onecare.you")).toBe(true);
  });

  it("is not anywhere the person who began the login chooses", () => {
    for (const origin of [
      "https://evil.example",
      "https://evilonecare.you",
      "https://onecare.you.evil.example",
      "http://onecare.you",
      "https://onecare.you:8443",
      "https://someone.lovable.app",
      "https://onecare.you/path",
      "https://user@onecare.you",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(isAllowedReturnOrigin(origin), String(origin)).toBe(false);
    }
  });

  it("includes exact origins configured for development, and nothing near them", () => {
    const extra = parseExtraOrigins("http://localhost:8080, https://preview-123.lovable.app, not an origin");
    expect(extra).toEqual(["http://localhost:8080", "https://preview-123.lovable.app"]);
    expect(isAllowedReturnOrigin("http://localhost:8080", extra)).toBe(true);
    expect(isAllowedReturnOrigin("https://preview-123.lovable.app", extra)).toBe(true);
    expect(isAllowedReturnOrigin("http://localhost:9999", extra)).toBe(false);
    expect(isAllowedReturnOrigin("https://attacker.lovable.app", extra)).toBe(false);
  });

  it("is compared in canonical form", () => {
    expect(normaliseOrigin("https://OneCare.you")).toBe("https://onecare.you");
    expect(normaliseOrigin("https://onecare.you/")).toBeNull();
  });
});

describe("the result message", () => {
  it("is recognised only in its own shape", () => {
    expect(isResultMessage({ nonce: "a", outcome: "signed-in" })).toBe(true);
    expect(isResultMessage({ nonce: "a", outcome: "failed", error: "x" })).toBe(true);
    expect(isResultMessage({ nonce: "a", outcome: "ready", token_hash: "t" })).toBe(false);
    expect(isResultMessage(null)).toBe(false);
  });
});
