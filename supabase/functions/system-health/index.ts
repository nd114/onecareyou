import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * A single, deliberately boring endpoint an external uptime monitor can
 * poll every minute or two.
 *
 * docs/continuity/service-continuity.md named this precisely: "No
 * monitoring or alerting story in this document. You cannot recover from
 * what you do not know is down." Nothing in this codebase watched for that
 * — Tier 1 could go dark and the first anyone heard of it would be a
 * clinician or patient noticing the app was gone.
 *
 * Public and unauthenticated on purpose: an uptime checker cannot hold a
 * session, and the response never carries more than up/down plus which
 * dependency failed — no error text, no stack trace, nothing a public
 * endpoint shouldn't say.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const checks: Record<string, boolean> = {};
  let healthy = true;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // A cheap, real query against Tier 1 itself — the database and RLS
    // engine — rather than just confirming this function's own process is
    // alive, which would say nothing about the thing actually worth knowing.
    const { error } = await supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .limit(1);

    checks.database = !error;
    if (error) healthy = false;
  } catch {
    checks.database = false;
    healthy = false;
  }

  return new Response(
    JSON.stringify({
      status: healthy ? "ok" : "degraded",
      checks,
      checked_at: new Date().toISOString(),
    }),
    {
      // A non-200 is the whole point: every uptime service alerts on status
      // code by default, so this needs no special configuration to be useful.
      status: healthy ? 200 : 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
