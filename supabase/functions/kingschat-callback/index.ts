// KingsChat OAuth callback endpoint.
//
// Register this function's public URL as the `redirect_url` in the KingsChat
// developer console. KingsChat POSTs { code, origin? } here after the user
// approves the app; we immediately exchange the code for tokens (codes expire
// in 1 hour and must not be stored) and return a minimal, non-sensitive result.
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

  const clientId = Deno.env.get("KINGSCHAT_CLIENT_ID");
  if (!clientId) {
    console.error("KINGSCHAT_CLIENT_ID is not configured");
    return json({ error: "KingsChat sign-in is not configured yet" }, 500);
  }

  let payload: { code?: string; origin?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const code = payload.code?.trim();
  if (!code) {
    return json({ error: "Missing authorization code" }, 400);
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
