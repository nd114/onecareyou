import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Map Stripe product IDs to subscription tiers
const PRODUCT_TIER_MAP: Record<string, string> = {
  "prod_To9o7nfrT2GrFM": "premium",  // Monthly Premium
  "prod_To9oGDfKrPJphC": "premium",  // Annual Premium
};

// 12-hour trial period in milliseconds
const TRIAL_PERIOD_MS = 12 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check if user is in trial period (registered within last 12 hours)
    const userCreatedAt = new Date(user.created_at).getTime();
    const now = Date.now();
    const isInTrialPeriod = (now - userCreatedAt) < TRIAL_PERIOD_MS;
    const trialEndsAt = isInTrialPeriod ? new Date(userCreatedAt + TRIAL_PERIOD_MS).toISOString() : null;

    if (isInTrialPeriod) {
      logStep("User is in 12-hour trial period", { 
        trialEndsAt,
        hoursRemaining: Math.round((userCreatedAt + TRIAL_PERIOD_MS - now) / (60 * 60 * 1000) * 10) / 10
      });
      
      // Update profile to premium (trial)
      await supabaseClient
        .from('profiles')
        .update({ subscription_tier: 'premium' })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ 
        subscribed: true,
        tier: "premium",
        subscription_end: trialEndsAt,
        is_annual: false,
        is_trial: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, returning free tier");
      return new Response(JSON.stringify({ 
        subscribed: false,
        tier: "free",
        subscription_end: null,
        is_annual: false
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      logStep("No active subscription found");
      
      // Update profile to free tier
      await supabaseClient
        .from('profiles')
        .update({ subscription_tier: 'free' })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ 
        subscribed: false,
        tier: "free",
        subscription_end: null,
        is_annual: false
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscription = subscriptions.data[0];
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const productId = subscription.items.data[0].price.product as string;
    const priceInterval = subscription.items.data[0].price.recurring?.interval;
    const tier = PRODUCT_TIER_MAP[productId] || "premium";
    const isAnnual = priceInterval === "year";

    logStep("Active subscription found", { 
      subscriptionId: subscription.id, 
      productId,
      tier,
      endDate: subscriptionEnd,
      isAnnual 
    });

    // Update profile subscription tier
    await supabaseClient
      .from('profiles')
      .update({ subscription_tier: tier })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({
      subscribed: true,
      tier,
      subscription_end: subscriptionEnd,
      is_annual: isAnnual
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
