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
  isPlaceholderEmail,
  placeholderEmail,
} from "../_shared/kingschat-identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_ENDPOINT = "https://connect.kingsch.at/developer/api/oauth2/token";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const clientId = Deno.env.get("KINGSCHAT_CLIENT_ID");
  if (!clientId) {
    console.error("KINGSCHAT_CLIENT_ID is not configured");
    return json({ error: "Not configured" }, 503);
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
    return json({ error: reason }, status);
  };

  try {
    let payload: { code?: string; origin?: string };
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

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

    // Identity comes from the token itself — it is an RS256 JWT — rather than a
    // profile endpoint. The claim names are not documented, so the key names are
    // logged (never the values) and the first real login tells us what we get.
    const claims = decodeJwtClaims(accessToken);
    const identity = identityFromClaims(claims);
    console.log("KingsChat token claims present:", Object.keys(identity.claims).join(", ") || "none");

    if (!identity.subject) {
      console.error("KingsChat token carried nothing identifying the holder");
      return await fail("KingsChat did not tell us who you are", 502);
    }

    // Supabase needs an address to hold an account against. A real one links to
    // an existing OneCare account; a placeholder is stable per KingsChat user
    // and is recognisable later so it is never mistaken for a contactable email.
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
