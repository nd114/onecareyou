import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Clinician tier price IDs
const CLINICIAN_PRICES = {
  solo_monthly: "price_1SsbOVDycAbKvlfcXquEUSq6",
  pro_monthly: "price_1SsbOmDycAbKvlfcM3mH6ER9",
  enterprise_monthly: "price_1SsbQwDycAbKvlfc5P9A9nVn",
};

// Input validation schema
const CreateCheckoutSchema = z.object({
  priceId: z
    .string()
    .min(1, "Price ID is required")
    .max(100, "Price ID too long")
    .regex(/^price_[a-zA-Z0-9]+$/, "Invalid Stripe price ID format"),
  tier: z.enum(["solo", "pro", "enterprise"]),
});

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CLINICIAN-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;
    if (!user?.email) {
      return new Response(JSON.stringify({ error: "User email not available" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("User authenticated", { userId: user.id });

    // Verify user has a clinician profile
    const { data: clinicianProfile, error: profileError } = await supabaseClient
      .from("clinician_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError || !clinicianProfile) {
      return new Response(JSON.stringify({ error: "Clinician profile required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("Clinician profile verified");

    // Parse and validate input
    const rawBody = await req.json();
    const parseResult = CreateCheckoutSchema.safeParse(rawBody);

    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parseResult.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { priceId, tier } = parseResult.data;
    logStep("Request params validated", { priceId, tier });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer already exists
    let customerId = clinicianProfile.stripe_customer_id;

    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        // Update the clinician profile with the customer ID
        await supabaseClient
          .from("clinician_profiles")
          .update({ stripe_customer_id: customerId })
          .eq("user_id", user.id);
        logStep("Found existing customer", { customerId });
      } else {
        logStep("No existing customer found, will create new");
      }
    } else {
      logStep("Using existing customer from profile", { customerId });
    }

    const origin = req.headers.get("origin") || "https://onecare.you";

    // Determine patient limit based on tier
    const patientLimits: Record<string, number> = {
      solo: 25,
      pro: 100,
      enterprise: 999999, // Unlimited
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId || undefined,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/clinician/subscription-success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
      cancel_url: `${origin}/clinician/pricing`,
      subscription_data: {
        metadata: {
          user_id: user.id,
          clinician_profile_id: clinicianProfile.id,
          tier: tier,
          patient_limit: patientLimits[tier],
        },
      },
      allow_promotion_codes: true,
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(JSON.stringify({ error: "Failed to create checkout session" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
