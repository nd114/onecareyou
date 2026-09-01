// KingsChat sign-in: verify the access token the client-side popup flow
// returned, resolve the person's identity from KingsChat, then mint a
// one-time magic-link token so the client can establish a real session
// with supabase.auth.verifyOtp().
//
// Security notes:
// - The access token is verified server-side against KingsChat's profile
//   endpoint. The client cannot assert an identity — it can only hand us a
//   token, and KingsChat tells us who it belongs to.
// - We never store KingsChat tokens; they are used once and discarded.
// - Accounts are matched by verified email. New users are created with
//   email_confirm=true because KingsChat has already verified ownership.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROFILE_ENDPOINTS = [
  "https://connect.kingsch.at/developer/api/profile",
  "https://connect.kingsch.at/api/profile",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface KingsChatProfile {
  email?: string;
  sub?: string;
  id?: string;
  user_id?: string;
  name?: string;
  username?: string;
}

async function fetchProfile(accessToken: string): Promise<KingsChatProfile | null> {
  for (const url of PROFILE_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        console.error("KingsChat profile lookup failed", url, res.status);
        return null;
      }
      return (await res.json()) as KingsChatProfile;
    } catch (e) {
      console.error("KingsChat profile lookup error", url, e);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: { accessToken?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const accessToken = payload.accessToken?.trim();
  if (!accessToken || accessToken.length > 4096) {
    return json({ error: "Missing access token" }, 400);
  }

  const profile = await fetchProfile(accessToken);
  if (!profile) {
    return json({ error: "Could not verify your KingsChat account" }, 401);
  }

  const email = profile.email?.trim().toLowerCase();
  if (!email) {
    return json(
      {
        error:
          "Your KingsChat account does not share an email address. " + "Please sign in with email or Google instead.",
      },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const name = profile.name ?? profile.username ?? null;

  // Mint a magic-link token. If the user doesn't exist yet, create them first.
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        name,
        full_name: name,
        kingschat_id: profile.sub ?? profile.id ?? profile.user_id ?? null,
        auth_provider: "kingschat",
      },
    });
    if (created.error) {
      console.error("KingsChat user creation failed", created.error);
      return json({ error: "Could not create your account" }, 500);
    }
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) {
      console.error("KingsChat magic link failed after create", link.error);
      return json({ error: "Could not start your session" }, 500);
    }
  }

  const tokenHash = link.data?.properties?.hashed_token;
  if (!tokenHash) {
    console.error("KingsChat magic link missing hashed_token");
    return json({ error: "Could not start your session" }, 500);
  }

  return json({ token_hash: tokenHash });
});
