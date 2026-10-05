import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  applyArgs,
  classifyApplyStatus,
  isPermanentRpcError,
  mapStripeEvent,
  PACK_MINUTES_ENV,
  parsePackMinutes,
  precheckWebhook,
} from "../_shared/addon-events.ts";

/**
 * Stripe webhook for practice add-ons. There was no Stripe webhook before this;
 * the clinician plan flow polls check-clinician-subscription instead and is
 * untouched. Events that are not add-on events (no practice_id/kind metadata) are
 * acknowledged and ignored, so this one endpoint can safely receive everything
 * Stripe sends.
 *
 * verify_jwt is off (Stripe does not send a Supabase token); the Stripe signature
 * is the authentication. A request with no or a bad signature is refused with 400
 * before anything is read or written. The service-role client is created only
 * after the signature has verified.
 *
 * Answers: 200 for everything handled, refused (rejected_in_use, ...), duplicate
 * or ignored, so Stripe never retry-loops on a business outcome. 500 only for a
 * transient failure, where a retry is wanted and apply_addon_change's event-id
 * guard makes it safe.
 *
 * Nothing sensitive is logged: ids, event types and statuses only. No card data
 * reaches this code and no patient data exists in Stripe or here.
 */

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = req.headers.get("stripe-signature");

  const gate = precheckWebhook({ method: req.method, signature, secretConfigured: !!secret });
  if (!gate.ok) {
    logStep("Refused before verification", { error: gate.error });
    return reply({ error: gate.error }, gate.status);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    logStep("Refused: STRIPE_SECRET_KEY not set");
    return reply({ error: "webhook_not_configured" }, 500);
  }

  // The signature is checked against the exact bytes received.
  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature as string,
      secret as string,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (_err) {
    logStep("Signature verification failed");
    return reply({ error: "invalid_signature" }, 400);
  }

  try {
    const action = mapStripeEvent(
      {
        id: event.id,
        type: event.type,
        data: {
          object: event.data.object,
          previous_attributes: (event.data as { previous_attributes?: unknown }).previous_attributes,
        },
      },
      { packMinutes: parsePackMinutes(Deno.env.get(PACK_MINUTES_ENV)) },
    );

    if (action.action === "ignore") {
      logStep("Ignored", { eventId: event.id, type: event.type, reason: action.reason });
      return reply({ received: true, handled: false });
    }
    if (action.action === "log") {
      // invoice.payment_failed: recorded only. No seat changes in this step.
      logStep("Payment failed (no seat change)", { eventId: event.id, type: event.type });
      return reply({ received: true, handled: false });
    }
    if (action.action === "invalid") {
      // Answered 200: Stripe resending it cannot fix missing metadata.
      console.error(
        `[STRIPE-WEBHOOK] NEEDS ATTENTION - event cannot be applied - ${JSON.stringify({
          eventId: event.id,
          type: event.type,
          reason: action.reason,
        })}`,
      );
      return reply({ received: true, handled: false });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data, error } = await admin.rpc("apply_addon_change", applyArgs(action));

    if (error) {
      if (isPermanentRpcError(error)) {
        console.error(
          `[STRIPE-WEBHOOK] NEEDS ATTENTION - apply refused as invalid - ${JSON.stringify({
            eventId: event.id,
            addon: action.addon,
            code: error.code,
          })}`,
        );
        return reply({ received: true, handled: false });
      }
      logStep("Apply failed, asking Stripe to retry", { eventId: event.id, code: error.code ?? null });
      return reply({ error: "temporary_failure" }, 500);
    }

    const outcome = classifyApplyStatus((data as { status?: unknown } | null)?.status);
    const line = {
      eventId: event.id,
      type: event.type,
      practiceId: action.practice_id,
      addon: action.addon,
      qty: action.qty,
      status: outcome.status,
    };
    if (outcome.level === "warn") {
      console.warn(`[STRIPE-WEBHOOK] Not applied - ${JSON.stringify(line)}`);
    } else {
      logStep("Applied", line);
    }
    return reply({ received: true, handled: true, status: outcome.status });
  } catch (err) {
    console.error("[STRIPE-WEBHOOK] Unexpected error:", err instanceof Error ? err.message : "unknown");
    return reply({ error: "temporary_failure" }, 500);
  }
});
