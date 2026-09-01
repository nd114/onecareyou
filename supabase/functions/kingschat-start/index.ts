// Begin a KingsChat login.
//
// Issues the unguessable value that ties this browser to the callback KingsChat
// will make later, and hands back the URL to send the user to. The value is
// generated here rather than in the browser on purpose: the callback's only
// defence against an authorization code being redeemed in somebody else's
// session is that the server recognises a value it issued itself.
//
// See docs: https://developers.kingschat.online/docs/login
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGIN_URL = "https://accounts.kingschat.online/log-in";

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
    return json({ error: "KingsChat sign-in is not configured yet" }, 503);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Two UUIDs: 244 bits, and no reliance on one generator being perfect.
  const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

  const { error } = await admin.from("kingschat_login_attempts").insert({ nonce });
  if (error) {
    console.error("Could not record KingsChat login attempt", error);
    return json({ error: "Could not start sign-in" }, 500);
  }

  // Abandoned logins leave rows holding a session token behind them. Cheap to
  // clear here rather than depending on a scheduler being present.
  void admin.rpc("purge_expired_kingschat_attempts").then(
    () => {},
    (e: unknown) => console.error("KingsChat attempt purge failed", e),
  );

  const url = new URL(LOGIN_URL);
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("origin", nonce);

  return json({ nonce, url: url.toString() });
});
