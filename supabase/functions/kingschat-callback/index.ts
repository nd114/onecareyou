// KingsChat OAuth callback endpoint.
//
// Register this function's public URL as the `redirect_url` in the KingsChat
// developer console. KingsChat POSTs { code, origin? } here after the user
// approves the app; we immediately exchange the code for tokens (codes expire
// in 1 hour and must not be stored) and return a minimal, non-sensitive result.
//
// ---------------------------------------------------------------------------
// Off by default, deliberately
// ---------------------------------------------------------------------------
// Nothing in the application starts this flow — there is no client code that
// builds a KingsChat authorization URL, so this endpoint has no caller. What it
// does have is a public URL, no authentication, and a branch that makes an
// outbound HTTP request for anyone who POSTs to it.
//
// It is also missing the two things that make an OAuth callback safe, and both
// are missing *because* there is no initiator to supply them: a `state` value
// binding the callback to the browser session that began the flow, and PKCE.
// Without `state`, whoever wires up account linking inherits a login-CSRF: an
// attacker's code lands in a victim's session and links the attacker's identity
// to the victim's account.
//
// So it stays switched off until that design is settled. KINGSCHAT_LINKING_ENABLED
// must be set explicitly, and the guard below refuses to run without `state`
// even then — the requirement is enforced here rather than written down
// somewhere and hoped for. Whoever turns this on has to deal with it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_ENDPOINT = "https://connect.kingsch.at/developer/api/oauth2/token";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // No caller today, so the default is closed. An unauthenticated endpoint that
  // performs an outbound request on demand should not sit open with nothing
  // using it.
  if (Deno.env.get("KINGSCHAT_LINKING_ENABLED") !== "true") {
    return json({ error: "Not found" }, 404);
  }

  const clientId = Deno.env.get("KINGSCHAT_CLIENT_ID");
  if (!clientId) {
    console.error("KINGSCHAT_CLIENT_ID is not configured");
    return json({ error: "KingsChat sign-in is not configured yet" }, 500);
  }

  let payload: { code?: string; origin?: string; state?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const code = payload.code?.trim();
  if (!code) {
    return json({ error: "Missing authorization code" }, 400);
  }

  // The guard that outlives this comment. A callback with no `state` cannot be
  // tied to the session that started the flow, which is the whole mechanism
  // preventing an attacker's authorization code from being redeemed inside a
  // victim's session. Refusing here means account linking cannot ship without
  // someone building the issuing half first.
  const state = payload.state?.trim();
  if (!state) {
    console.error("KingsChat callback received without state");
    return json(
      {
        error:
          "This callback requires a state value issued when the flow started. " +
          "Account linking cannot be enabled until that is implemented.",
      },
      400,
    );
  }

  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "code",
        client_id: clientId,
        code,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("KingsChat token exchange failed", res.status, detail);
      return json({ error: "Token exchange failed" }, 502);
    }

    const tokens = await res.json();
    // Never log or return raw tokens. Downstream account linking (mapping the
    // KingsChat profile to an app user) is handled in a follow-up step.
    console.log("KingsChat token exchange succeeded", {
      hasAccessToken: !!tokens?.access_token,
      hasRefreshToken: !!tokens?.refresh_token,
      expiresInMillis: tokens?.expires_in_millis ?? null,
      origin: payload.origin ?? null,
    });

    return json({ ok: true, origin: payload.origin ?? null });
  } catch (error) {
    console.error("KingsChat callback error", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
