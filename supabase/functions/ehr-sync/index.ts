import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  medicationRowFromFhir,
  type FhirMedicationRequest,
} from "../_shared/fhir-medication.ts";
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
  console.log(`[EHR-SYNC] ${step}${detailsStr}`);
};

interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  name?: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
  telecom?: Array<{ system: string; value: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

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
    
    if (userError || !userData.user) {
      throw new Error("Authentication failed");
    }
    
    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    const body = await req.json();
    const { action, connectionId, fhirBaseUrl, accessToken, patientFhirId } = body;

    logStep("Request received", { action, connectionId });

    // Verify connection belongs to user
    if (connectionId) {
      const { data: connection, error: connError } = await supabaseClient
        .from('ehr_connections')
        .select('*')
        .eq('id', connectionId)
        .eq('clinician_user_id', userId)
        .single();

      if (connError || !connection) {
        throw new Error("Connection not found or access denied");
      }
    }

    switch (action) {
      case 'test_connection': {
        // Test FHIR server connectivity
        logStep("Testing FHIR connection", { fhirBaseUrl });
        
        try {
          const response = await fetch(`${fhirBaseUrl}/metadata`, {
            headers: {
              'Accept': 'application/fhir+json',
              'Authorization': accessToken ? `Bearer ${accessToken}` : '',
            },
          });

          if (!response.ok) {
            throw new Error(`FHIR server returned ${response.status}`);
          }

          const capability = await response.json();
          logStep("FHIR server connected", { fhirVersion: capability.fhirVersion });

          // Update connection status
          if (connectionId) {
            await supabaseClient
              .from('ehr_connections')
              .update({ 
                sync_status: 'active', 
                fhir_base_url: fhirBaseUrl,
                error_message: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', connectionId);
          }

          return new Response(JSON.stringify({
            success: true,
            fhirVersion: capability.fhirVersion,
            software: capability.software?.name,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        } catch (error: any) {
          logStep("FHIR connection failed", { error: error.message });
          
          if (connectionId) {
            await supabaseClient
              .from('ehr_connections')
              .update({ 
                sync_status: 'error', 
                error_message: error.message,
                updated_at: new Date().toISOString()
              })
              .eq('id', connectionId);
          }

          throw new Error(`Failed to connect to FHIR server: ${error.message}`);
        }
      }

      case 'import_patient': {
        // Import one patient's records from the connected FHIR server.
        //
        // This used to fetch observations, count them, log the sync as
        // 'success' with a record count, and write nothing at all — the
        // comment said "this would need patient mapping to a real user_id".
        // A sync that reports success having imported zero rows is worse than
        // one that fails, because nobody goes looking.
        //
        // Two things had to be settled to finish it, and both are refusals
        // rather than guesses:
        //
        //   1. **Which OneCare user is this?** From the connection's
        //      patient_id_mapping, and nowhere else. Guessing — by name, by
        //      date of birth, by the caller's current patient — is how one
        //      person's blood pressure ends up in another person's record.
        //   2. **May this clinician write there?** Owning the EHR connection
        //      is not consent. The patient's own sharing decides, and it is
        //      the database that answers, against the caller's own token.
        logStep("Importing patient data", { patientFhirId });

        if (!fhirBaseUrl || !patientFhirId || !connectionId) {
          throw new Error("connectionId, fhirBaseUrl and patientFhirId are all required");
        }

        const { data: connection } = await supabaseClient
          .from('ehr_connections')
          .select('*')
          .eq('id', connectionId)
          .single();
        if (!connection) throw new Error("Connection not found");

        // ---- 1. Who is this, in our records? ----------------------------
        const mappings = (connection.patient_id_mapping as PatientMapping[] | null) ?? [];
        const mapping = mappings.find((m) => m.fhirPatientId === patientFhirId);
        if (!mapping?.marpeUserId) {
          return json({
            error:
              "That patient is not linked to a OneCare account on this connection yet. Link them " +
              "first — importing into a record we guessed at is not something this will do.",
          }, 409);
        }
        const patientUserId = mapping.marpeUserId;

        // ---- 2. May this clinician write there? -------------------------
        // Asked of the database, as the caller, so the answer is the same one
        // RLS would give for a read. Service-role does the writing afterwards
        // because the write is legitimately cross-user, but it does not get to
        // decide whether it is allowed.
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
        );
        const [{ data: viaShare }, { data: viaInstitution }] = await Promise.all([
          userClient.rpc('clinician_has_patient_access', { patient_user_id: patientUserId }),
          userClient.rpc('institution_has_patient_access', { patient_user_id: patientUserId }),
        ]);
        if (viaShare !== true && viaInstitution !== true) {
          return json({
            error:
              "That patient has not shared their record with you, so nothing can be written to it. " +
              "Ask them to connect first.",
          }, 403);
        }

        await supabaseClient
          .from('ehr_connections')
          .update({ sync_status: 'syncing' })
          .eq('id', connectionId);

        const headers = {
          'Accept': 'application/fhir+json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : '',
        };

        try {
          const patientResponse = await fetch(`${fhirBaseUrl}/Patient/${patientFhirId}`, { headers });
          if (!patientResponse.ok) {
            throw new Error(`Failed to fetch patient: ${patientResponse.status}`);
          }
          const patient: FHIRPatient = await patientResponse.json();
          logStep("Patient fetched", { patientId: patient.id });

          const skipped: Array<{ id: string | null; reason: string }> = [];
          const warnings: Array<{ id: string | null; warnings: string[] }> = [];
          let importedVitals = 0;
          let importedMedications = 0;

          // ---- Observations ---------------------------------------------
          const obsResponse = await fetch(
            `${fhirBaseUrl}/Observation?patient=${patientFhirId}&category=vital-signs&_count=100&_sort=-date`,
            { headers },
          );

          if (obsResponse.ok) {
            const bundle = await obsResponse.json();
            const observations: FhirObservation[] =
              bundle.entry?.map((e: any) => e.resource) ?? [];
            logStep("Observations fetched", { count: observations.length });

            for (const obs of observations) {
              const rows = vitalRowsFrom(obs, {
                userId: patientUserId,
                sourceLabel: connection.provider_name,
                connectionId,
              });
              if (rows.length === 0) {
                skipped.push({ id: obs.id ?? null, reason: "No vital sign we recognise in this observation" });
                continue;
              }
              for (const row of rows) {
                // Identity is the sending system's id, not the timestamp: a
                // corrected reading resent with a new time would otherwise
                // arrive as a second reading.
                const { data: existing } = await supabaseClient
                  .from('vitals')
                  .select('id')
                  .eq('user_id', row.user_id)
                  .eq('ehr_connection_id', connectionId)
                  .eq('external_id', row.external_id)
                  .eq('type', row.type)
                  .maybeSingle();

                if (existing) {
                  await supabaseClient.from('vitals').update(row).eq('id', existing.id);
                } else {
                  const { error: insertError } = await supabaseClient.from('vitals').insert(row);
                  if (insertError) {
                    skipped.push({ id: obs.id ?? null, reason: insertError.message });
                    continue;
                  }
                  importedVitals++;
                }
              }
            }
          } else {
            skipped.push({ id: null, reason: `Observations could not be fetched (${obsResponse.status})` });
          }

          // ---- Medications ------------------------------------------------
          // Not date-windowed: a prescription written a year ago is still
          // live, and asking only for recent ones would import nothing.
          const medResponse = await fetch(
            `${fhirBaseUrl}/MedicationRequest?patient=${patientFhirId}&status=active,on-hold&_count=100`,
            { headers },
          );

          if (medResponse.ok) {
            const medBundle = await medResponse.json();
            const requests: FhirMedicationRequest[] = medBundle.entry?.map((e: any) => e.resource) ?? [];
            logStep("Medication requests fetched", { count: requests.length });

            for (const request of requests) {
              const { row, warnings: rowWarnings, rejected } = medicationRowFromFhir(request, {
                userId: patientUserId,
                sourceLabel: connection.provider_name,
                connectionId,
              });
              if (rejected) {
                skipped.push({ id: request.id ?? null, reason: rejected });
                continue;
              }
              if (!row) continue;
              if (rowWarnings.length) warnings.push({ id: request.id ?? null, warnings: rowWarnings });

              const { data: existing } = await supabaseClient
                .from('medications')
                .select('id')
                .eq('user_id', row.user_id)
                .eq('ehr_connection_id', row.ehr_connection_id)
                .eq('external_id', row.external_id)
                .maybeSingle();

              if (existing) {
                await supabaseClient
                  .from('medications')
                  .update({
                    name: row.name,
                    dosage: row.dosage,
                    frequency: row.frequency,
                    times_of_day: row.times_of_day,
                    instructions: row.instructions,
                    prescriber: row.prescriber,
                    is_active: row.is_active,
                    source: row.source,
                  })
                  .eq('id', existing.id);
              } else {
                const { error: insertError } = await supabaseClient.from('medications').insert(row);
                if (insertError) {
                  skipped.push({ id: request.id ?? null, reason: insertError.message });
                  continue;
                }
                importedMedications++;
              }
            }
          } else {
            skipped.push({ id: null, reason: `Medications could not be fetched (${medResponse.status})` });
          }

          // A run that refused anything is 'partial'. An import that quietly
          // dropped half a record looks exactly like one that worked.
          await supabaseClient
            .from('ehr_sync_logs')
            .insert({
              connection_id: connectionId,
              sync_type: 'import',
              resource_type: 'Patient,Observation,MedicationRequest',
              record_count: importedVitals + importedMedications,
              status: skipped.length > 0 ? 'partial' : 'success',
              error_details: skipped.length > 0 || warnings.length > 0 ? { skipped, warnings } : null,
            });

          await supabaseClient
            .from('ehr_connections')
            .update({
              sync_status: 'active',
              last_sync_at: new Date().toISOString(),
              error_message: null,
            })
            .eq('id', connectionId);

          // The patient gets told, in their own log, that a hospital put
          // something in their record. Finding out by noticing a medication
          // you did not add is a bad way to find out.
          await supabaseClient.from('patient_action_log').insert({
            patient_user_id: patientUserId,
            clinician_user_id: userId,
            actor_user_id: userId,
            action: 'ehr_import',
            summary:
              `Imported ${importedVitals} reading(s) and ${importedMedications} medication(s) ` +
              `from ${connection.provider_name}`,
            ref_table: 'ehr_connections',
            ref_id: connectionId,
          });

          return json({
            success: true,
            patient: {
              id: patient.id,
              name: [patient.name?.[0]?.given?.join(' '), patient.name?.[0]?.family]
                .filter(Boolean).join(' ') || null,
              birthDate: patient.birthDate ?? null,
              gender: patient.gender ?? null,
            },
            importedVitals,
            importedMedications,
            skipped,
            warnings,
          });
        } catch (error: any) {
          await supabaseClient
            .from('ehr_sync_logs')
            .insert({
              connection_id: connectionId,
              sync_type: 'import',
              resource_type: 'Patient,Observation,MedicationRequest',
              record_count: 0,
              status: 'failed',
              error_details: { message: error.message },
            });

          await supabaseClient
            .from('ehr_connections')
            .update({ sync_status: 'error', error_message: error.message })
            .eq('id', connectionId);

          throw error;
        }
      }

      case 'export_vitals': {
        // Export vitals to FHIR server (future implementation)
        logStep("Export vitals requested - not yet implemented");
        return new Response(JSON.stringify({
          success: false,
          message: "Export functionality is coming soon",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'get_sync_history': {
        const { data: logs, error: logsError } = await supabaseClient
          .from('ehr_sync_logs')
          .select('*')
          .eq('connection_id', connectionId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (logsError) throw logsError;

        return new Response(JSON.stringify({ logs }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
