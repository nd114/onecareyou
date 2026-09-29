import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * The only door through which somebody without an account reads a patient's
 * record: a read-only snapshot link.
 *
 * The caller presents the token from the link (which the viewer page keeps in
 * the URL fragment, so it never reaches a server log). It is hashed here and
 * only the hash goes to the database. `open_snapshot_link` — granted to the
 * service role and nobody else — checks the hash, expiry, revocation and the
 * optional passcode at the moment of this request, logs the view, and returns
 * the frozen snapshot. With `documentId` it instead returns the storage path
 * of one document the patient chose, still live, and this function signs a
 * URL for it that lasts a minute.
 *
 * Deliberately absent: the caller's session is never read, so a signed-in
 * visitor gains nothing and no relationship is created; the IP address is not
 * stored; and the token is never logged.
 *
 * See supabase/migrations/20261010060000_read_only_snapshot_links.sql.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// A patient's record must not be cached by a proxy, indexed, or leak its
// address onward as a referrer.
const privateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "application/json",
};

const SIGNED_URL_SECONDS = 60;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...privateHeaders },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * "Chrome on Android", not the full string: enough for the patient to tell
 * "that was my sister's phone" from "someone else opened this", without
 * keeping a fingerprint of the viewer.
 */
function coarseUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /bot|crawl|spider|preview/i.test(ua) ? "Link preview or bot"
    : "Other browser";
  const os =
    /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  return os ? `${browser} on ${os}` : browser;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply({ status: "not_found" });
    }

    const token = typeof body.token === "string" ? body.token : "";
    const passcode = typeof body.passcode === "string" ? body.passcode.slice(0, 16) : null;
    const documentId = typeof body.documentId === "string" ? body.documentId : null;

    // A malformed token cannot match a 256-bit one; answer as for any unknown
    // link rather than saying what shape a real one has.
    if (!TOKEN_SHAPE.test(token)) {
      return reply({ status: "not_found" });
    }
    if (documentId !== null && !UUID_SHAPE.test(documentId)) {
      return reply({ status: "document_unavailable" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await supabase.rpc("open_snapshot_link", {
      _token_hash: await sha256Hex(token),
      _passcode: passcode,
      _user_agent: coarseUserAgent(req.headers.get("user-agent")),
      _document_id: documentId,
    });

    if (error) {
      // enforce_rate_limit raises P0001 with a message meant for people.
      if (error.code === "P0001") {
        return reply({ status: "rate_limited", error: error.message }, 429);
      }
      console.error("view-snapshot-link: open failed", error.code, error.message);
      return reply({ error: "Unexpected error" }, 500);
    }

    const result = (data ?? { status: "not_found" }) as Record<string, unknown>;

    if (documentId === null || result.status !== "ok") {
      return reply(result);
    }

    // One document: sign a URL for just this file, briefly. The path never
    // leaves this function.
    const { data: signed, error: signError } = await supabase.storage
      .from("health-documents")
      .createSignedUrl(String(result.file_path), SIGNED_URL_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error("view-snapshot-link: signing failed", signError?.message);
      return reply({ status: "document_unavailable" });
    }

    return reply({
      status: "ok",
      signedUrl: signed.signedUrl,
      fileName: result.file_name ?? null,
      mimeType: result.mime_type ?? null,
      expiresInSeconds: SIGNED_URL_SECONDS,
    });
  } catch (err) {
    console.error("view-snapshot-link failed", err instanceof Error ? err.message : "unknown");
    return reply({ error: "Unexpected error" }, 500);
  }
});
