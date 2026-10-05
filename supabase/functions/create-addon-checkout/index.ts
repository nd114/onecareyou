import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { safeOrigin } from "../_shared/safe-origin.ts";
import {
  buildCheckoutMetadata,
  checkoutEligibility,
  checkoutModeFor,
  PACK_MINUTES_ENV,
  parsePackMinutes,
  resolvePriceId,
  validateCheckoutRequest,
} from "../_shared/addon-events.ts";

/**
 * Starts a Stripe Checkout for a practice add-on (extra clinician seats, paid
 * staff seats, a scribe minutes pack). The page redirects the person to the
 * returned url; card details are entered on Stripe's page and never reach us.
 * The seats or minutes are granted later by stripe-webhook, not here.
 *
 * Who may call it: the caller's own session is used (not a claim in the body).
 * practice_account_overview runs as the caller and refuses anyone who is not an
 * owner/admin of the practice or a member with manage_billing, so a stranger and
 * a non-billing member get the same 403.
 *
 * No service-role client is used in this function.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Never log emails, names, tokens or anything from the request beyond ids.
const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-ADDON-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authorization required" }, 401);

    // The caller's own client: every database call below runs as them under RLS.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "").trim(),
    );
    const user = userData?.user;
    if (userError || !user) return json({ error: "Authentication failed" }, 401);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    const parsed = validateCheckoutRequest(raw);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const { practice_id, kind, quantity } = parsed.value;

    // Authorisation, as the caller. Owner/admin or a member with manage_billing
    // gets the overview; anyone else gets an error from the database.
    const { data: overview, error: overviewError } = await supabase.rpc(
      "practice_account_overview",
      { _practice_id: practice_id },
    );
    if (overviewError || !overview) {
      logStep("Not permitted", { userId: user.id, practiceId: practice_id });
      return json({ error: "You do not have permission to manage billing for this practice" }, 403);
    }

    const eligible = checkoutEligibility(kind, quantity, overview);
    if (!eligible.ok) {
      logStep("Not applicable", { practiceId: practice_id, kind, code: eligible.code });
      return json({ error: eligible.error }, 400);
    }

    // The add-on is switched on only once its Stripe price exists in the
    // environment. Until then say so (the page offers a contact link) and do
    // not call Stripe.
    const priceId = resolvePriceId(eligible.priceEnv, Deno.env.toObject());
    const packMinutes = kind === "scribe_pack" ? parsePackMinutes(Deno.env.get(PACK_MINUTES_ENV)) : null;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!priceId || !stripeKey || (kind === "scribe_pack" && packMinutes === null)) {
      logStep("Add-on not configured", { kind, priceEnv: eligible.priceEnv });
      return json({ error: "addon_not_configured" });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Reuse the practice's Stripe customer when one is on file (the column may
    // not be readable to this caller; that is fine), otherwise a customer with
    // the same email, otherwise let Checkout create one.
    let customerId: string | null = null;
    const { data: practiceRow } = await supabase
      .from("practices")
      .select("stripe_customer_id")
      .eq("id", practice_id)
      .maybeSingle();
    customerId = (practiceRow as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
    if (!customerId && user.email) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data[0]?.id ?? null;
    }

    const origin = safeOrigin(req);
    const metadata = buildCheckoutMetadata({
      practice_id,
      kind,
      quantity,
      initiated_by: user.id,
      pack_minutes: packMinutes,
    });
    const mode = checkoutModeFor(kind);
    const returnBase = `${origin}/clinician/practice/account?tab=addons`;

    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId || undefined,
      customer_email: customerId ? undefined : user.email || undefined,
      line_items: [{ price: priceId, quantity }],
      success_url: `${returnBase}&checkout=success`,
      cancel_url: `${returnBase}&checkout=cancelled`,
      metadata,
      // Seats are a subscription: the metadata is copied onto it so later
      // quantity changes and cancellation can be tied back to the practice.
      ...(mode === "subscription" ? { subscription_data: { metadata } } : {}),
      allow_promotion_codes: true,
    });

    logStep("Checkout session created", { practiceId: practice_id, kind, quantity, sessionId: session.id });
    return json({ url: session.url });
  } catch (error) {
    console.error("Add-on checkout error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Failed to create checkout session" }, 500);
  }
});
