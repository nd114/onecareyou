import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-CLINICIAN-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Map Stripe price IDs to tiers
const PRICE_TIER_MAP: Record<string, string> = {
  "price_1SsbOVDycAbKvlfcXquEUSq6": "solo",
  "price_1SsbOmDycAbKvlfcM3mH6ER9": "pro",
  "price_1SsbQwDycAbKvlfc5P9A9nVn": "enterprise",
  // Updated price IDs
  "price_1SuKweDycAbKvlfcGepIUqjl": "solo",
  "price_1SuKyqDycAbKvlfcVWUKk03a": "pro",
  "price_1SuL1ADycAbKvlfcmvKgb99I": "enterprise",
};

// Patient limits per tier
const TIER_LIMITS: Record<string, number> = {
  trial: 5,
  solo: 25,
  pro: 100,
  enterprise: 999999,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) {
      throw new Error(`Authentication error: ${userError.message}`);
    }
    
    const user = userData.user;
    if (!user?.email) {
      throw new Error("User not authenticated or email not available");
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get clinician profile
    const { data: clinicianProfile, error: profileError } = await supabaseClient
      .from('clinician_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !clinicianProfile) {
      logStep("No clinician profile found");
      return new Response(JSON.stringify({ 
        subscribed: false, 
        tier: null,
        is_clinician: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("Clinician profile found", { profileId: clinicianProfile.id });

    // Check if still in trial period
    const trialEndsAt = clinicianProfile.trial_ends_at ? new Date(clinicianProfile.trial_ends_at) : null;
    const isInTrial = trialEndsAt && trialEndsAt > new Date();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find Stripe customer
    let customerId = clinicianProfile.stripe_customer_id;
    
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        // Update profile with customer ID
        await supabaseClient
          .from('clinician_profiles')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', user.id);
      }
    }

    if (!customerId) {
      logStep("No Stripe customer found");
      
      // Check if they're in trial period
      if (isInTrial) {
        return new Response(JSON.stringify({
          subscribed: false,
          tier: 'trial',
          is_clinician: true,
          trial_ends_at: trialEndsAt?.toISOString(),
          patient_limit: TIER_LIMITS.trial,
          is_in_trial: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Trial expired, no subscription
      await supabaseClient
        .from('clinician_profiles')
        .update({ 
          subscription_tier: 'expired',
          subscription_status: 'inactive',
          patient_limit: 0,
        })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({
        subscribed: false,
        tier: 'expired',
        is_clinician: true,
        trial_ends_at: trialEndsAt?.toISOString(),
        patient_limit: 0,
        is_in_trial: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found Stripe customer", { customerId });

    // Check for active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    // Find clinician subscription (check against our price IDs)
    const clinicianSubscription = subscriptions.data.find((sub: any) => {
      const priceId = sub.items.data[0]?.price?.id;
      return priceId && Object.keys(PRICE_TIER_MAP).includes(priceId);
    });

    if (!clinicianSubscription) {
      logStep("No active clinician subscription found");
      
      // Still in trial?
      if (isInTrial) {
        return new Response(JSON.stringify({
          subscribed: false,
          tier: 'trial',
          is_clinician: true,
          trial_ends_at: trialEndsAt?.toISOString(),
          patient_limit: TIER_LIMITS.trial,
          is_in_trial: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Update profile as expired
      await supabaseClient
        .from('clinician_profiles')
        .update({ 
          subscription_tier: 'expired',
          subscription_status: 'inactive',
          patient_limit: 0,
        })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({
        subscribed: false,
        tier: 'expired',
        is_clinician: true,
        patient_limit: 0,
        is_in_trial: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Active subscription found
    const priceId = clinicianSubscription.items.data[0].price.id;
    const tier = PRICE_TIER_MAP[priceId] || 'unknown';
    const subscriptionEnd = new Date(clinicianSubscription.current_period_end * 1000).toISOString();
    const patientLimit = TIER_LIMITS[tier] || 0;

    logStep("Active subscription found", { 
      subscriptionId: clinicianSubscription.id, 
      tier, 
      endDate: subscriptionEnd 
    });

    // Update clinician profile
    await supabaseClient
      .from('clinician_profiles')
      .update({ 
        subscription_tier: tier,
        subscription_status: 'active',
        subscription_ends_at: subscriptionEnd,
        stripe_subscription_id: clinicianSubscription.id,
        patient_limit: patientLimit,
      })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({
      subscribed: true,
      tier: tier,
      subscription_end: subscriptionEnd,
      is_clinician: true,
      patient_limit: patientLimit,
      is_in_trial: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-clinician-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
