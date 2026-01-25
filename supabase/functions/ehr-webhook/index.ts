import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ehr-signature, x-ehr-provider",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[EHR-WEBHOOK] ${step}${detailsStr}`);
};

// LOINC codes for vital types
const VITAL_LOINC_MAP: Record<string, string> = {
  '85354-9': 'blood_pressure',
  '8867-4': 'heart_rate',
  '8310-5': 'temperature',
  '9279-1': 'respiratory_rate',
  '2708-6': 'oxygen_saturation',
  '29463-7': 'weight',
  '39156-5': 'bmi',
  '2339-0': 'blood_glucose',
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
    return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
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
        // Verify signature if credentials are configured (webhook secret)
        if (connection.credentials_encrypted && signature) {
          const isValid = await verifySignature(bodyText, signature, connection.credentials_encrypted);
          if (!isValid) {
            logStep("Invalid signature for connection", { connectionId: connection.id });
            continue;
          }
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

          // Get vital type from LOINC code
          const loincCode = obs.code?.coding?.find(c => c.system === 'http://loinc.org')?.code;
          const vitalType = loincCode ? VITAL_LOINC_MAP[loincCode] : null;
          if (!vitalType) continue;

          const recordedAt = obs.effectiveDateTime || new Date().toISOString();

          // Handle blood pressure (has components)
          if (vitalType === 'blood_pressure' && obs.component) {
            const systolic = obs.component.find(c => 
              c.code?.coding?.some(cd => cd.code === '8480-6')
            )?.valueQuantity?.value;
            const diastolic = obs.component.find(c => 
              c.code?.coding?.some(cd => cd.code === '8462-4')
            )?.valueQuantity?.value;

            if (systolic && diastolic) {
              // Check for duplicates
              const { data: existing } = await supabaseClient
                .from('vitals')
                .select('id')
                .eq('user_id', mapping.marpeUserId)
                .eq('type', 'blood_pressure')
                .eq('recorded_at', recordedAt)
                .single();

              if (!existing) {
                await supabaseClient.from('vitals').insert({
                  user_id: mapping.marpeUserId,
                  type: 'blood_pressure',
                  value: systolic,
                  secondary_value: diastolic,
                  unit: 'mmHg',
                  recorded_at: recordedAt,
                  notes: `Real-time sync from ${connection.provider_name}`,
                  source: 'ehr_import',
                  external_id: obs.id,
                  ehr_connection_id: connection.id,
                });
                importedCount++;
              }
            }
          } else if (obs.valueQuantity?.value) {
            // Check for duplicates
            const { data: existing } = await supabaseClient
              .from('vitals')
              .select('id')
              .eq('user_id', mapping.marpeUserId)
              .eq('type', vitalType)
              .eq('recorded_at', recordedAt)
              .single();

            if (!existing) {
              await supabaseClient.from('vitals').insert({
                user_id: mapping.marpeUserId,
                type: vitalType,
                value: obs.valueQuantity.value,
                unit: obs.valueQuantity.unit || getDefaultUnit(vitalType),
                recorded_at: recordedAt,
                notes: `Real-time sync from ${connection.provider_name}`,
                source: 'ehr_import',
                external_id: obs.id,
                ehr_connection_id: connection.id,
              });
              importedCount++;
            }
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

function getDefaultUnit(vitalType: string): string {
  switch (vitalType) {
    case 'heart_rate': return 'bpm';
    case 'temperature': return '°C';
    case 'respiratory_rate': return 'breaths/min';
    case 'oxygen_saturation': return '%';
    case 'weight': return 'kg';
    case 'bmi': return 'kg/m²';
    case 'blood_glucose': return 'mg/dL';
    default: return '';
  }
}
