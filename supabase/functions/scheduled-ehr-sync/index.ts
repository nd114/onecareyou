import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SCHEDULED-EHR-SYNC] ${step}${detailsStr}`);
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
  code: { coding: Array<{ system: string; code: string; display: string }> };
  valueQuantity?: { value: number; unit: string };
  effectiveDateTime?: string;
  component?: Array<{
    code: { coding: Array<{ system: string; code: string; display: string }> };
    valueQuantity?: { value: number; unit: string };
  }>;
}

interface PatientMapping {
  fhirPatientId: string;
  marpeUserId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Scheduled EHR sync started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get all active EHR connections with FHIR URLs
    const { data: connections, error: connError } = await supabaseClient
      .from('ehr_connections')
      .select('*')
      .eq('is_active', true)
      .eq('sync_status', 'active')
      .not('fhir_base_url', 'is', null);

    if (connError) {
      throw new Error(`Failed to fetch connections: ${connError.message}`);
    }

    logStep("Found active connections", { count: connections?.length || 0 });

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No active EHR connections to sync",
        syncedConnections: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];

    for (const connection of connections) {
      logStep("Processing connection", { 
        id: connection.id, 
        provider: connection.provider_name 
      });

      try {
        // Get patient mappings for this connection
        const patientMappings: PatientMapping[] = 
          (connection.patient_id_mapping as PatientMapping[]) || [];

        if (patientMappings.length === 0) {
          logStep("No patient mappings configured", { connectionId: connection.id });
          
          // Log skipped sync
          await supabaseClient.from('ehr_sync_logs').insert({
            connection_id: connection.id,
            sync_type: 'scheduled_import',
            resource_type: 'Observation',
            record_count: 0,
            status: 'skipped',
            error_details: { reason: 'No patient mappings configured' },
          });

          continue;
        }

        // Update connection to syncing status
        await supabaseClient
          .from('ehr_connections')
          .update({ sync_status: 'syncing' })
          .eq('id', connection.id);

        let totalImported = 0;

        for (const mapping of patientMappings) {
          logStep("Syncing patient", { 
            fhirId: mapping.fhirPatientId, 
            marpeId: mapping.marpeUserId 
          });

          try {
            // Fetch observations from last 24 hours
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateParam = yesterday.toISOString().split('T')[0];

            const obsUrl = `${connection.fhir_base_url}/Observation?patient=${mapping.fhirPatientId}&category=vital-signs&date=ge${dateParam}&_count=100`;
            
            // Note: In production, credentials would be decrypted here
            // For now, we assume bearer token auth
            const accessToken = connection.credentials_encrypted; // Simplified - would decrypt

            const obsResponse = await fetch(obsUrl, {
              headers: {
                'Accept': 'application/fhir+json',
                'Authorization': accessToken ? `Bearer ${accessToken}` : '',
              },
            });

            if (!obsResponse.ok) {
              logStep("Failed to fetch observations", { 
                status: obsResponse.status,
                patientId: mapping.fhirPatientId 
              });
              continue;
            }

            const bundle = await obsResponse.json();
            const observations: FHIRObservation[] = 
              bundle.entry?.map((e: any) => e.resource) || [];

            logStep("Fetched observations", { 
              count: observations.length,
              patientId: mapping.fhirPatientId 
            });

            // Convert FHIR observations to Marpe vitals
            for (const obs of observations) {
              const loincCode = obs.code?.coding?.find(c => c.system === 'http://loinc.org')?.code;
              const vitalType = loincCode ? VITAL_LOINC_MAP[loincCode] : null;

              if (!vitalType) continue;

              // Handle blood pressure specially (has components)
              if (vitalType === 'blood_pressure' && obs.component) {
                const systolic = obs.component.find(c => 
                  c.code?.coding?.some(cd => cd.code === '8480-6')
                )?.valueQuantity?.value;
                const diastolic = obs.component.find(c => 
                  c.code?.coding?.some(cd => cd.code === '8462-4')
                )?.valueQuantity?.value;

                if (systolic && diastolic) {
                  // Check if this vital already exists (by recorded_at time)
                  const recordedAt = obs.effectiveDateTime || new Date().toISOString();
                  
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
                      notes: `Synced from ${connection.provider_name}`,
                      source: 'ehr_import',
                      external_id: obs.id,
                      ehr_connection_id: connection.id,
                    });
                    totalImported++;
                  }
                }
              } else if (obs.valueQuantity?.value) {
                const recordedAt = obs.effectiveDateTime || new Date().toISOString();
                
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
                    notes: `Synced from ${connection.provider_name}`,
                    source: 'ehr_import',
                    external_id: obs.id,
                    ehr_connection_id: connection.id,
                  });
                  totalImported++;
                }
              }
            }

          } catch (patientError: any) {
            logStep("Patient sync error", { 
              patientId: mapping.fhirPatientId, 
              error: patientError.message 
            });
          }
        }

        // Log successful sync
        await supabaseClient.from('ehr_sync_logs').insert({
          connection_id: connection.id,
          sync_type: 'scheduled_import',
          resource_type: 'Observation',
          record_count: totalImported,
          status: 'success',
        });

        // Update connection status
        await supabaseClient
          .from('ehr_connections')
          .update({ 
            sync_status: 'active',
            last_sync_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', connection.id);

        successCount++;
        results.push({
          connectionId: connection.id,
          provider: connection.provider_name,
          status: 'success',
          importedVitals: totalImported,
        });

        logStep("Connection sync complete", { 
          connectionId: connection.id, 
          imported: totalImported 
        });

      } catch (error: any) {
        errorCount++;
        logStep("Connection sync failed", { 
          connectionId: connection.id, 
          error: error.message 
        });

        // Log failed sync
        await supabaseClient.from('ehr_sync_logs').insert({
          connection_id: connection.id,
          sync_type: 'scheduled_import',
          resource_type: 'Observation',
          record_count: 0,
          status: 'failed',
          error_details: { message: error.message },
        });

        // Update connection with error
        await supabaseClient
          .from('ehr_connections')
          .update({ 
            sync_status: 'error',
            error_message: error.message,
          })
          .eq('id', connection.id);

        results.push({
          connectionId: connection.id,
          provider: connection.provider_name,
          status: 'error',
          error: error.message,
        });
      }
    }

    logStep("Scheduled sync complete", { successCount, errorCount });

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${successCount} connections, ${errorCount} errors`,
      syncedConnections: successCount,
      errorConnections: errorCount,
      results,
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
