import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[EHR-EXPORT] ${step}${detailsStr}`);
};

// Map internal vital types to LOINC codes
const VITAL_TO_LOINC: Record<string, { code: string; display: string; system: string }> = {
  'blood_pressure': { code: '85354-9', display: 'Blood pressure panel', system: 'http://loinc.org' },
  'heart_rate': { code: '8867-4', display: 'Heart rate', system: 'http://loinc.org' },
  'temperature': { code: '8310-5', display: 'Body temperature', system: 'http://loinc.org' },
  'respiratory_rate': { code: '9279-1', display: 'Respiratory rate', system: 'http://loinc.org' },
  'oxygen_saturation': { code: '2708-6', display: 'Oxygen saturation', system: 'http://loinc.org' },
  'weight': { code: '29463-7', display: 'Body weight', system: 'http://loinc.org' },
  'bmi': { code: '39156-5', display: 'Body mass index', system: 'http://loinc.org' },
  'blood_glucose': { code: '2339-0', display: 'Glucose', system: 'http://loinc.org' },
};

// BP component LOINC codes
const BP_SYSTOLIC = { code: '8480-6', display: 'Systolic blood pressure', system: 'http://loinc.org' };
const BP_DIASTOLIC = { code: '8462-4', display: 'Diastolic blood pressure', system: 'http://loinc.org' };

interface VitalRecord {
  id: string;
  user_id: string;
  type: string;
  value: number;
  secondary_value?: number;
  unit: string;
  recorded_at: string;
  notes?: string;
  source: string;
}

interface ExportQueueItem {
  id: string;
  vital_id: string;
  connection_id: string;
  patient_fhir_id: string;
  status: string;
  attempts: number;
}

function buildFHIRObservation(
  vital: VitalRecord,
  patientFhirId: string
): object {
  const loincInfo = VITAL_TO_LOINC[vital.type];
  if (!loincInfo) {
    throw new Error(`Unknown vital type: ${vital.type}`);
  }

  const observation: any = {
    resourceType: 'Observation',
    status: 'final',
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
        display: 'Vital Signs'
      }]
    }],
    code: {
      coding: [loincInfo]
    },
    subject: {
      reference: `Patient/${patientFhirId}`
    },
    effectiveDateTime: vital.recorded_at,
    performer: [{
      display: 'Patient (via Marpe)'
    }],
    note: [{
      text: `Recorded via Marpe Health App${vital.notes ? ` - ${vital.notes}` : ''}`
    }]
  };

  // Handle blood pressure specially (has components)
  if (vital.type === 'blood_pressure' && vital.secondary_value) {
    observation.component = [
      {
        code: { coding: [BP_SYSTOLIC] },
        valueQuantity: {
          value: vital.value,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]'
        }
      },
      {
        code: { coding: [BP_DIASTOLIC] },
        valueQuantity: {
          value: vital.secondary_value,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]'
        }
      }
    ];
  } else {
    observation.valueQuantity = {
      value: vital.value,
      unit: vital.unit,
      system: 'http://unitsofmeasure.org'
    };
  }

  return observation;
}

async function exportVitalToFHIR(
  fhirBaseUrl: string,
  accessToken: string | null,
  observation: object
): Promise<{ success: boolean; resourceId?: string; error?: string }> {
  try {
    const response = await fetch(`${fhirBaseUrl}/Observation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
        ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(observation),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `FHIR server returned ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    return { success: true, resourceId: result.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
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

    const body = await req.json();
    const { action } = body;

    logStep("Request received", { action });

    switch (action) {
      case 'process_queue': {
        // Process pending exports from the queue
        const { data: pendingItems, error: queueError } = await supabaseClient
          .from('ehr_export_queue')
          .select(`
            id,
            vital_id,
            connection_id,
            patient_fhir_id,
            status,
            attempts
          `)
          .eq('status', 'pending')
          .lt('attempts', 3)
          .order('created_at', { ascending: true })
          .limit(50);

        if (queueError) throw queueError;
        if (!pendingItems?.length) {
          return new Response(JSON.stringify({ processed: 0, message: 'No pending exports' }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        logStep("Processing queue", { count: pendingItems.length });

        let successCount = 0;
        let failCount = 0;

        for (const item of pendingItems) {
          // Get the vital record
          const { data: vital, error: vitalError } = await supabaseClient
            .from('vitals')
            .select('*')
            .eq('id', item.vital_id)
            .single();

          if (vitalError || !vital) {
            // Mark as failed if vital doesn't exist
            await supabaseClient
              .from('ehr_export_queue')
              .update({
                status: 'failed',
                error_message: 'Vital record not found',
                attempts: item.attempts + 1,
                last_attempt_at: new Date().toISOString()
              })
              .eq('id', item.id);
            failCount++;
            continue;
          }

          // Skip if vital is from EHR import (don't re-export imported data)
          if (vital.source === 'ehr_import') {
            await supabaseClient
              .from('ehr_export_queue')
              .update({
                status: 'skipped',
                error_message: 'Vital originated from EHR import - skipping to prevent duplicate',
                last_attempt_at: new Date().toISOString()
              })
              .eq('id', item.id);
            continue;
          }

          // Get the connection details
          const { data: connection, error: connError } = await supabaseClient
            .from('ehr_connections')
            .select('*')
            .eq('id', item.connection_id)
            .eq('is_active', true)
            .single();

          if (connError || !connection || !connection.fhir_base_url) {
            await supabaseClient
              .from('ehr_export_queue')
              .update({
                status: 'failed',
                error_message: 'EHR connection not found or inactive',
                attempts: item.attempts + 1,
                last_attempt_at: new Date().toISOString()
              })
              .eq('id', item.id);
            failCount++;
            continue;
          }

          // Build FHIR Observation
          const observation = buildFHIRObservation(vital, item.patient_fhir_id);
          
          // Export to FHIR server
          const result = await exportVitalToFHIR(
            connection.fhir_base_url,
            connection.credentials_encrypted, // In production, this would be decrypted
            observation
          );

          if (result.success) {
            await supabaseClient
              .from('ehr_export_queue')
              .update({
                status: 'exported',
                exported_at: new Date().toISOString(),
                fhir_resource_id: result.resourceId,
                last_attempt_at: new Date().toISOString()
              })
              .eq('id', item.id);
            successCount++;

            // Log the successful export
            await supabaseClient
              .from('ehr_sync_logs')
              .insert({
                connection_id: item.connection_id,
                sync_type: 'export',
                resource_type: 'Observation',
                record_count: 1,
                status: 'success'
              });
          } else {
            await supabaseClient
              .from('ehr_export_queue')
              .update({
                status: item.attempts + 1 >= 3 ? 'failed' : 'pending',
                error_message: result.error,
                attempts: item.attempts + 1,
                last_attempt_at: new Date().toISOString()
              })
              .eq('id', item.id);
            failCount++;
          }
        }

        logStep("Queue processing complete", { successCount, failCount });

        return new Response(JSON.stringify({
          processed: pendingItems.length,
          success: successCount,
          failed: failCount
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'queue_vital': {
        // Queue a specific vital for export
        const { vitalId, connectionId, patientFhirId } = body;

        if (!vitalId || !connectionId || !patientFhirId) {
          throw new Error('Missing required parameters: vitalId, connectionId, patientFhirId');
        }

        // Check if already queued
        const { data: existing } = await supabaseClient
          .from('ehr_export_queue')
          .select('id')
          .eq('vital_id', vitalId)
          .eq('connection_id', connectionId)
          .single();

        if (existing) {
          return new Response(JSON.stringify({
            success: false,
            message: 'Vital already queued for this connection'
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Add to queue
        const { error: insertError } = await supabaseClient
          .from('ehr_export_queue')
          .insert({
            vital_id: vitalId,
            connection_id: connectionId,
            patient_fhir_id: patientFhirId,
            status: 'pending'
          });

        if (insertError) throw insertError;

        return new Response(JSON.stringify({ success: true, message: 'Vital queued for export' }), {
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
