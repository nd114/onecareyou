// KingsChat OAuth callback.
//
// KingsChat POSTs `{ code, origin }` here after the user approves the app —
// server to server, not a browser redirect. The browser that started the login
// never sees the code, so `origin` (the nonce issued by kingschat-start) is the
// only thing connecting the two. The docs are explicit that the callback always
// goes to the URL registered on the application and cannot be overridden at
// request time, which is what makes the registered endpoint trustworthy.
//
// Requires verify_jwt = false in config.toml: KingsChat has no Supabase session
// and sends no Authorization header.
//
// See docs: https://developers.kingschat.online/docs/login
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  decodeJwtClaims,
  identityFromClaims,
  identityFromProfile,
  isPlaceholderEmail,
  placeholderEmail,
  type KingsChatIdentity,
} from "../_shared/kingschat-identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const TOKEN_ENDPOINT = "https://connect.kingsch.at/developer/api/oauth2/token";
const PROFILE_ENDPOINT = "https://connect.kingsch.at/developer/api/user/profile";

/**
 * Who this token belongs to.
 *
 * The profile endpoint is the documented answer and the only one that reports
 * whether an email is verified, so it is tried first. It needs the project API
 * key alongside the user's token, and returns 403 if profile access is not
 * enabled for the project or the user did not authorise it — neither of which
 * should fail the whole sign-in, because the access token is itself an RS256
 * JWT carrying an identity. So the JWT is the fallback, and the reason the
 * profile call failed is logged rather than swallowed.
 */
async function resolveIdentity(accessToken: string): Promise<KingsChatIdentity> {
  const apiKey = Deno.env.get("KINGSCHAT_API_KEY");

  if (apiKey) {
    try {
      const res = await fetch(PROFILE_ENDPOINT, {
        headers: {
          "api-key": apiKey,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const identity = identityFromProfile(await res.json());
        if (identity.subject) return identity;
        console.error("KingsChat profile returned nothing identifying the holder");
      } else {
        // 401 invalid_api_key, 403 project_cannot_access_profile or
        // user_not_authorized, 404 user_not_found — each needs a different fix
        // in the portal, so the status is worth having in the log.
        console.error("KingsChat profile lookup failed", res.status, await res.text());
      }
    } catch (e) {
      console.error("KingsChat profile lookup error", e);
    }
  } else {
    console.error("KINGSCHAT_API_KEY is not set — falling back to the token's own claims");
  }

  const identity = identityFromClaims(decodeJwtClaims(accessToken));
  console.log(
    "KingsChat token claims present:",
    Object.keys(identity.claims).join(", ") || "none",
  );
  return identity;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * A closing page instead of raw JSON.
 *
 * KingsChat can deliver the callback as a browser navigation (the window it
 * opened for the login lands here), so a JSON body would be shown to the user
 * as text — which is exactly what the "Invalid JSON body" screenshot was. When
 * the request looks like a browser navigation we answer with a page that tells
 * the opener it is done and closes itself.
 */
function page(message: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>KingsChat sign-in</title>
<style>body{font-family:system-ui,sans-serif;background:#faf7ef;color:#14342b;display:grid;place-items:center;height:100vh;margin:0}p{max-width:28rem;text-align:center;line-height:1.5}</style>
</head><body><p>${message}</p>
<script>try{window.opener&&window.opener.postMessage({source:"kingschat-callback",ok:${status < 400}},"*");}catch(e){}setTimeout(function(){try{window.close()}catch(e){}},1200);</script>
</body></html>`;
  return new Response(html, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

function wantsHtml(req: Request) {
  return (req.headers.get("accept") ?? "").includes("text/html");
}

/**
 * KingsChat does not document a single wire format for this callback, and in
 * practice it has arrived as JSON, as a form post, and as a plain navigation
 * with query parameters. All three carry the same two values, so all three are
 * read here rather than rejecting on content type.
 */
async function readPayload(req: Request): Promise<{ code?: string; origin?: string }> {
  const url = new URL(req.url);
  const fromQuery = {
    code: url.searchParams.get("code") ?? url.searchParams.get("authorization_code") ?? undefined,
    origin:
      url.searchParams.get("origin") ??
      url.searchParams.get("state") ??
      url.searchParams.get("nonce") ??
      undefined,
  };

  if (req.method === "GET") return fromQuery;

  const raw = (await req.text()).trim();
  if (!raw) return fromQuery;

  if (raw.startsWith("{")) {
    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      return {
        code: (body.code ?? body.authorization_code ?? fromQuery.code) as string | undefined,
        origin: (body.origin ?? body.state ?? body.nonce ?? fromQuery.origin) as string | undefined,
      };
    } catch {
      // fall through to form parsing — a malformed body is worth one more read
    }
  }

  const form = new URLSearchParams(raw);
  return {
    code: form.get("code") ?? form.get("authorization_code") ?? fromQuery.code ?? undefined,
    origin:
      form.get("origin") ?? form.get("state") ?? form.get("nonce") ?? fromQuery.origin ?? undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const browser = wantsHtml(req);
  const respond = (body: { error?: string }, status: number) =>
    browser
      ? page(
          body.error ?? "Signed in. You can close this window.",
          status,
        )
      : json(body, status);

  const clientId = Deno.env.get("KINGSCHAT_CLIENT_ID");
  if (!clientId) {
    console.error("KINGSCHAT_CLIENT_ID is not configured");
    return respond({ error: "Not configured" }, 503);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Held outside the try so a failure can be written against the right attempt,
  // which is what turns a spinning button into a message the user can act on.
  let nonce: string | null = null;

  const fail = async (reason: string, status = 400) => {
    if (nonce) {
      await admin
        .from("kingschat_login_attempts")
        .update({ status: "failed", failure_reason: reason })
        .eq("nonce", nonce)
        .eq("status", "pending");
    }
    return respond({ error: reason }, status);
  };

  try {
    const payload = await readPayload(req);


    const code = payload.code?.trim();
    nonce = payload.origin?.trim() || null;

    if (!code) return json({ error: "Missing authorization code" }, 400);
    if (!nonce) {
      // Without it there is no way to know which browser this belongs to, and
      // no protection against the code being redeemed in someone else's session.
      console.error("KingsChat callback arrived without origin");
      return json({ error: "Missing origin" }, 400);
    }

    // The nonce is looked up, never interpreted. An unknown or stale one is a
    // callback we did not start.
    const { data: attempt } = await admin
      .from("kingschat_login_attempts")
      .select("id, status, expires_at")
      .eq("nonce", nonce)
      .maybeSingle();

    if (!attempt) {
      console.error("KingsChat callback with an unrecognised origin");
      return json({ error: "Unrecognised sign-in attempt" }, 400);
    }
    if (attempt.status !== "pending") {
      return json({ error: "This sign-in was already completed" }, 409);
    }
    if (new Date(attempt.expires_at) < new Date()) {
      return await fail("This sign-in took too long. Please try again.", 410);
    }

    // Exchange immediately: codes expire in an hour and must not be stored.
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "code", client_id: clientId, code }),
    });

    if (!tokenRes.ok) {
      console.error("KingsChat token exchange failed", tokenRes.status, await tokenRes.text());
      return await fail("KingsChat could not confirm this sign-in", 502);
    }

    const tokens = await tokenRes.json();
    const accessToken: string | undefined = tokens?.access_token;
    if (!accessToken) {
      console.error("KingsChat token response carried no access_token");
      return await fail("KingsChat could not confirm this sign-in", 502);
    }

    const identity = await resolveIdentity(accessToken);

    if (!identity.subject) {
      console.error("KingsChat token carried nothing identifying the holder");
      return await fail("KingsChat did not tell us who you are", 502);
    }

    // Supabase needs an address to hold an account against. A *verified* address
    // links to an existing OneCare account; anything less takes the placeholder
    // path, because linking on an unverified email would let someone set their
    // KingsChat address to a patient's and sign into that patient's record.
    const email = identity.email ?? placeholderEmail(identity.subject);

    let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name: identity.name,
          full_name: identity.name,
          kingschat_id: identity.subject,
          auth_provider: "kingschat",
          // Flags an account that still needs a real address before anything is
          // sent to it. The Vault and every notification path depend on this.
          needs_email: isPlaceholderEmail(email),
        },
      });
      if (created.error) {
        console.error("KingsChat user creation failed", created.error);
        return await fail("Could not create your account", 500);
      }
      link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    }

    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      console.error("KingsChat magic link failed", link.error);
      return await fail("Could not start your session", 500);
    }

    const { error: saveError } = await admin
      .from("kingschat_login_attempts")
      .update({
        status: "fulfilled",
        token_hash: tokenHash,
        kingschat_subject: identity.subject,
        fulfilled_at: new Date().toISOString(),
      })
      .eq("nonce", nonce)
      .eq("status", "pending");

    if (saveError) {
      console.error("Could not record the fulfilled KingsChat login", saveError);
      return json({ error: "Could not complete sign-in" }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("KingsChat callback error", error);
    return await fail("Unexpected error completing sign-in", 500);
  }
});
