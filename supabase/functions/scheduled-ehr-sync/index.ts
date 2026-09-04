import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { timingSafeEqual } from "../_shared/auth.ts";
import {
  MEDICATION_STATUSES,
  medicationRowFromFhir,
  type FhirMedicationRequest,
} from "../_shared/fhir-medication.ts";
import { bearerHeader, resolveEhrSecret } from "../_shared/ehr-credentials.ts";
import {
  vitalRowsFrom,
  type FhirObservation,
  type PatientMapping,
} from "../_shared/fhir-observation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SCHEDULED-EHR-SYNC] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require service-role bearer (cron / internal call only)
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey || !timingSafeEqual(authHeader, `Bearer ${serviceKey}`)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
        let importedMedications = 0;
        let updatedMedications = 0;
        const skippedMedications: Array<{ id: string | null; reason: string }> = [];
        const skippedVitals: Array<{ id: string | null; reason: string }> = [];
        const medicationWarnings: Array<{ id: string | null; warnings: string[] }> = [];

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
            
            // One place resolves the secret, and it says out loud when the
            // value came from the plain column. `credentials_encrypted` is not
            // encrypted — see _shared/ehr-credentials.ts and the column
            // comment — and three functions used to each carry their own
            // "would decrypt" note about it.
            const secret = await resolveEhrSecret(connection);
            const fhirHeaders = {
              'Accept': 'application/fhir+json',
              ...bearerHeader(secret),
            };

            const obsResponse = await fetch(obsUrl, { headers: fhirHeaders });

            if (!obsResponse.ok) {
              logStep("Failed to fetch observations", { 
                status: obsResponse.status,
                patientId: mapping.fhirPatientId 
              });
              continue;
            }

            const bundle = await obsResponse.json();
            const observations: FhirObservation[] =
              bundle.entry?.map((e: any) => e.resource) || [];

            logStep("Fetched observations", { 
              count: observations.length,
              patientId: mapping.fhirPatientId 
            });

            // Convert FHIR observations to OneCare vitals.
            //
            // The mapping is in _shared/fhir-observation.ts so this function
            // and ehr-sync cannot disagree about what a code means — they had
            // separate copies of the LOINC table, and the copies had already
            // drifted in how they handled a code neither recognised.
            for (const obs of observations) {
              const rows = vitalRowsFrom(obs, {
                userId: mapping.marpeUserId,
                sourceLabel: connection.provider_name,
                connectionId: connection.id,
              });
              if (rows.length === 0) {
                skippedVitals.push({
                  id: obs.id ?? null,
                  reason: "No vital sign we recognise in this observation",
                });
                continue;
              }

              for (const row of rows) {
                // Identity is the sending system's id, not the timestamp. The
                // previous check compared (user, type, recorded_at), so a
                // corrected reading resent with a new time arrived as a second
                // reading rather than replacing the first.
                const { data: existing } = await supabaseClient
                  .from('vitals')
                  .select('id')
                  .eq('user_id', row.user_id)
                  .eq('ehr_connection_id', connection.id)
                  .eq('external_id', row.external_id)
                  .eq('type', row.type)
                  .maybeSingle();

                if (existing) {
                  await supabaseClient.from('vitals').update(row).eq('id', existing.id);
                } else {
                  const { error: insertError } = await supabaseClient.from('vitals').insert(row);
                  if (insertError) {
                    skippedVitals.push({ id: obs.id ?? null, reason: insertError.message });
                    continue;
                  }
                  totalImported++;
                }
              }
            }

            // ---- Medications -------------------------------------------
            //
            // Vitals have been imported here since the beginning; medications
            // never were, so a patient who connected their hospital saw their
            // blood pressure arrive and their prescriptions not. The mapping
            // lives in _shared/fhir-medication.ts so it can be tested from the
            // browser suite rather than only in production.
            //
            // Unlike observations these are not date-windowed: a prescription
            // written a year ago is still live, and asking only for the last
            // day would import nothing at all.
            const medUrl =
              `${connection.fhir_base_url}/MedicationRequest?patient=${mapping.fhirPatientId}` +
              `&status=${MEDICATION_STATUSES}&_count=100`;

            const medResponse = await fetch(medUrl, {
              headers: fhirHeaders,
            });

            if (medResponse.ok) {
              const medBundle = await medResponse.json();
              const requests: FhirMedicationRequest[] =
                medBundle.entry?.map((e: any) => e.resource) || [];

              logStep("Fetched medication requests", {
                count: requests.length,
                patientId: mapping.fhirPatientId,
              });

              for (const request of requests) {
                const { row, warnings, rejected } = medicationRowFromFhir(request, {
                  userId: mapping.marpeUserId,
                  sourceLabel: connection.provider_name,
                  connectionId: connection.id,
                });

                if (rejected) {
                  // Refusals are logged rather than swallowed. An import that
                  // quietly drops half a prescription list looks exactly like
                  // one that worked.
                  logStep("Skipped medication", { id: request.id, reason: rejected });
                  skippedMedications.push({ id: request.id ?? null, reason: rejected });
                  continue;
                }
                if (!row) continue;
                if (warnings.length) {
                  logStep("Medication imported with warnings", { id: request.id, warnings });
                  medicationWarnings.push({ id: request.id ?? null, warnings });
                }

                // The unique index on (user_id, ehr_connection_id, external_id)
                // is partial, so ON CONFLICT cannot infer it. Look the row up
                // instead: a repeated sync must update, never duplicate — a
                // doubled medication reads as a real second prescription.
                const { data: existing } = await supabaseClient
                  .from('medications')
                  .select('id')
                  .eq('user_id', row.user_id)
                  .eq('ehr_connection_id', row.ehr_connection_id)
                  .eq('external_id', row.external_id)
                  .maybeSingle();

                if (existing) {
                  // Every mapped field, so a re-sync makes the row match the
                  // prescription rather than merging into it. is_active is the
                  // one that matters: this is how a stopped prescription
                  // actually stops. start_date was left behind before, so a
                  // re-issued prescription kept the original date.
                  await supabaseClient
                    .from('medications')
                    .update({
                      name: row.name,
                      dosage: row.dosage,
                      frequency: row.frequency,
                      times_of_day: row.times_of_day,
                      instructions: row.instructions,
                      prescriber: row.prescriber,
                      start_date: row.start_date,
                      is_active: row.is_active,
                      source: row.source,
                    })
                    .eq('id', existing.id);
                  updatedMedications++;
                } else {
                  const { error: insertError } = await supabaseClient
                    .from('medications')
                    .insert(row);
                  if (insertError) {
                    logStep("Medication insert failed", { id: request.id, error: insertError.message });
                    skippedMedications.push({ id: request.id ?? null, reason: insertError.message });
                  } else {
                    importedMedications++;
                    totalImported++;
                  }
                }
              }
            } else {
              logStep("Failed to fetch medications", {
                status: medResponse.status,
                patientId: mapping.fhirPatientId,
              });
            }

          } catch (patientError: any) {
            logStep("Patient sync error", { 
              patientId: mapping.fhirPatientId, 
              error: patientError.message 
            });
          }
        }

        // Log the sync. 'partial' when anything was refused: a run that threw
        // away half a prescription list should not be filed under 'success'.
        await supabaseClient.from('ehr_sync_logs').insert({
          connection_id: connection.id,
          sync_type: 'scheduled_import',
          resource_type: 'Observation,MedicationRequest',
          record_count: totalImported,
          status: skippedMedications.length + skippedVitals.length > 0 ? 'partial' : 'success',
          error_details: skippedMedications.length + skippedVitals.length > 0 || medicationWarnings.length > 0
            ? { skippedMedications, skippedVitals, medicationWarnings }
            : null,
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
          importedVitals: totalImported - importedMedications,
          importedMedications,
          updatedMedications,
          skippedMedications: skippedMedications.length,
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
          resource_type: 'Observation,MedicationRequest',
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
