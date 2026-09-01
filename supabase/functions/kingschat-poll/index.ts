// Has this KingsChat login completed yet?
//
// The code arrives at the callback out of band, so the browser has no way to
// know its login finished except by asking. It asks with the nonce it was given
// at the start, and gets back the one-time token it can exchange for a session.
//
// The token is handed out exactly once. A nonce is unguessable, but a value
// that opens a session and can be replayed is a different class of thing from
// one that cannot, and the difference costs nothing here.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: { nonce?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const nonce = payload.nonce?.trim();
  if (!nonce || nonce.length > 128) return json({ error: "Missing sign-in reference" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: attempt } = await admin
    .from("kingschat_login_attempts")
    .select("status, token_hash, failure_reason, expires_at")
    .eq("nonce", nonce)
    .maybeSingle();

  // An unknown nonce and an expired one are the same answer to the caller: this
  // is not a live sign-in. Saying which would confirm a guess.
  if (!attempt) return json({ status: "unknown" });

  if (attempt.status === "failed") {
    return json({ status: "failed", error: attempt.failure_reason ?? "Sign-in failed" });
  }
  if (attempt.status === "consumed") {
    return json({ status: "consumed" });
  }
  if (new Date(attempt.expires_at) < new Date()) {
    return json({ status: "expired" });
  }
  if (attempt.status !== "fulfilled" || !attempt.token_hash) {
    return json({ status: "pending" });
  }

  // Claim it. The conditional update is what makes this single-use even if two
  // polls land at the same moment — only one transition out of 'fulfilled' wins.
  const { data: claimed, error } = await admin
    .from("kingschat_login_attempts")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("nonce", nonce)
    .eq("status", "fulfilled")
    .select("token_hash")
    .maybeSingle();

  if (error) {
    console.error("Could not claim the KingsChat login", error);
    return json({ error: "Could not complete sign-in" }, 500);
  }
  if (!claimed?.token_hash) {
    // Another poll got there first.
    return json({ status: "consumed" });
  }

  return json({ status: "ready", token_hash: claimed.token_hash });
});
