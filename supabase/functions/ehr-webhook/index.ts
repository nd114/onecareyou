import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { timingSafeEqual } from "../_shared/auth.ts";
// Every import path goes through one mapper. This file used to carry its own
// LOINC map and unit defaults and both had drifted — 39156-5 to bmi and
// 9279-1 to respiratory_rate, neither of which VITAL_CONFIG holds, and 2339-0
// to blood_glucose where the rest of the app says glucose.
import { vitalRowsFrom, type FhirObservation } from "../_shared/fhir-observation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ehr-signature, x-ehr-provider",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[EHR-WEBHOOK] ${step}${detailsStr}`);
};


interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  subject?: { reference: string };
  code: { coding: Array<{ system: string; code: string; display: string }> };
  valueQuantity?: { value: number; unit: string };
  effectiveDateTime?: string;
  component?: Array<{
    code: { coding: Array<{ system: string; code: string; display: string }> };
    valueQuantity?: { value: number; unit: string };
  }>;
}

interface WebhookPayload {
  event: 'observation.created' | 'observation.updated' | 'patient.updated' | 'subscription.notification';
  resourceType: string;
  resource?: FHIRObservation;
  bundle?: { entry: Array<{ resource: FHIRObservation }> };
  connectionId?: string;
  timestamp: string;
}

// Verify webhook signature (HMAC-SHA256) using Web Crypto API
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    // Constant-time: a webhook endpoint accepts unlimited attempts, which is
    // precisely the condition a timing attack on `===` needs.
    return (
      timingSafeEqual(signature, expectedSignature) ||
      timingSafeEqual(signature, `sha256=${expectedSignature}`)
    );
  } catch (err: any) {
    logStep("Signature verification failed", { error: err.message });
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received", { method: req.method });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get provider and signature from headers
    const providerType = req.headers.get("x-ehr-provider") || "unknown";
    const signature = req.headers.get("x-ehr-signature") || "";
    const bodyText = await req.text();
    
    logStep("Processing webhook", { provider: providerType, hasSignature: !!signature });

    // Parse payload
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Find matching connection for this provider
    const { data: connections, error: connError } = await supabaseClient
      .from('ehr_connections')
      .select('*')
      .eq('provider_type', providerType)
      .eq('is_active', true)
      .eq('sync_status', 'active');

    if (connError || !connections || connections.length === 0) {
      logStep("No matching connections found", { provider: providerType });
      return new Response(JSON.stringify({ 
        success: false, 
        message: "No active connections for this provider" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // If connectionId is provided, filter to that specific connection
    let targetConnections = connections;
    if (payload.connectionId) {
      targetConnections = connections.filter(c => c.id === payload.connectionId);
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const connection of targetConnections) {
      try {
        // Signature verification is mandatory. A connection without a configured
        // webhook secret cannot be trusted, so its payloads are rejected outright
        // instead of being written into the patient's chart unverified.
        if (!connection.credentials_encrypted) {
          logStep("Rejected: connection has no webhook secret configured", { connectionId: connection.id });
          errorCount++;
          continue;
        }
        if (!signature) {
          logStep("Rejected: missing x-ehr-signature header", { connectionId: connection.id });
          errorCount++;
          continue;
        }
        const isValid = await verifySignature(bodyText, signature, connection.credentials_encrypted);
        if (!isValid) {
          logStep("Invalid signature for connection", { connectionId: connection.id });
          errorCount++;
          continue;
        }

        // Process based on event type
        const observations: FHIRObservation[] = [];
        
        if (payload.resource && payload.resource.resourceType === 'Observation') {
          observations.push(payload.resource);
        } else if (payload.bundle?.entry) {
          observations.push(...payload.bundle.entry
            .filter(e => e.resource?.resourceType === 'Observation')
            .map(e => e.resource));
        }

        if (observations.length === 0) {
          logStep("No observations in payload", { event: payload.event });
          continue;
        }

        // Get patient mappings for this connection
        const patientMappings: Array<{ fhirPatientId: string; marpeUserId: string }> = 
          (connection.patient_id_mapping as any[]) || [];

        let importedCount = 0;

        for (const obs of observations) {
          // Extract patient ID from subject reference
          const patientRef = obs.subject?.reference || "";
          const fhirPatientId = patientRef.replace("Patient/", "");

          // Find mapping for this patient
          const mapping = patientMappings.find(m => m.fhirPatientId === fhirPatientId);
          if (!mapping) {
            logStep("No mapping for patient", { fhirPatientId });
            continue;
          }

          // One mapper for every import path. This loop used to be its own,
          // and had drifted in four ways that all mattered: it ignored
          // observation.status, so a reading the sending system had retracted
          // as 'entered-in-error' was imported anyway; it read only
          // effectiveDateTime, so a resource carrying effectivePeriod or
          // issued got stamped with the time it arrived rather than the time
          // it was taken; it required obs.component for a blood pressure and
          // silently dropped any other shape; and its duplicate check used
          // .single(), which errors when nothing matches, so the guard worked
          // by accident and logged a PostgREST error every time it ran.
          const rows = vitalRowsFrom(obs as unknown as FhirObservation, {
            userId: mapping.marpeUserId,
            sourceLabel: connection.provider_name,
            connectionId: connection.id,
          });

          for (const row of rows) {
            // Duplicates are the database's job now — skip_duplicate_vital
            // discards a reading already recorded for that person at that
            // instant, on every path rather than only the ones that remembered
            // to check. A discarded insert returns no row, which is how this
            // counts only what was actually stored.
            const { data: inserted, error: insertError } = await supabaseClient
              .from('vitals')
              .insert(row)
              .select('id');

            if (insertError) {
              logStep("Could not store observation", { error: insertError.message });
              continue;
            }
            if (inserted && inserted.length > 0) importedCount++;
          }
        }

        // Log the sync
        await supabaseClient.from('ehr_sync_logs').insert({
          connection_id: connection.id,
          sync_type: 'webhook',
          resource_type: 'Observation',
          record_count: importedCount,
          status: importedCount > 0 ? 'success' : 'skipped',
        });

        // Update last sync time
        if (importedCount > 0) {
          await supabaseClient
            .from('ehr_connections')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('id', connection.id);
        }

        processedCount += importedCount;

      } catch (error: any) {
        errorCount++;
        logStep("Connection processing error", { 
          connectionId: connection.id, 
          error: error.message 
        });

        await supabaseClient.from('ehr_sync_logs').insert({
          connection_id: connection.id,
          sync_type: 'webhook',
          resource_type: 'Observation',
          record_count: 0,
          status: 'failed',
          error_details: { message: error.message },
        });
      }
    }

    logStep("Webhook processing complete", { processed: processedCount, errors: errorCount });

    return new Response(JSON.stringify({
      success: true,
      processed: processedCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    logStep("FATAL ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
