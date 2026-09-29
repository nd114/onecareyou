import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrUser } from "../_shared/auth.ts";
import { clinicianShareGrants } from "../_shared/share-access.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertRule {
  id: string;
  clinician_user_id: string;
  patient_user_id: string;
  share_id: string | null;
  vital_type: string;
  condition: string;
  threshold_value: number;
  threshold_secondary: number | null;
  alert_method: string;
  is_active: boolean;
}

interface Vital {
  id: string;
  type: string;
  value: number;
  secondary_value: number | null;
  unit: string;
  recorded_at: string;
  user_id: string;
}

const VITAL_LABELS: Record<string, string> = {
  blood_pressure: "Blood Pressure",
  heart_rate: "Heart Rate",
  blood_glucose: "Blood Glucose",
  weight: "Weight",
  temperature: "Temperature",
  oxygen_saturation: "Oxygen Saturation",
};

function checkThresholdViolation(
  vital: Vital,
  rule: AlertRule
): { violated: boolean; message: string } {
  const vitalLabel = VITAL_LABELS[vital.type] || vital.type;
  let vitalDisplay = vital.secondary_value 
    ? `${vital.value}/${vital.secondary_value} ${vital.unit}`
    : `${vital.value} ${vital.unit}`;

  switch (rule.condition) {
    case "above":
      if (vital.type === "blood_pressure") {
        // Check systolic (primary value)
        if (vital.value > rule.threshold_value) {
          return {
            violated: true,
            message: `${vitalLabel} reading of ${vitalDisplay} exceeds the threshold of ${rule.threshold_value} mmHg (systolic)`,
          };
        }
        // Check diastolic if secondary threshold exists
        if (rule.threshold_secondary && vital.secondary_value && 
            vital.secondary_value > rule.threshold_secondary) {
          return {
            violated: true,
            message: `${vitalLabel} reading of ${vitalDisplay} exceeds the threshold of ${rule.threshold_secondary} mmHg (diastolic)`,
          };
        }
      } else {
        if (vital.value > rule.threshold_value) {
          return {
            violated: true,
            message: `${vitalLabel} reading of ${vitalDisplay} exceeds the threshold of ${rule.threshold_value} ${vital.unit}`,
          };
        }
      }
      break;

    case "below":
      if (vital.type === "blood_pressure") {
        if (vital.value < rule.threshold_value) {
          return {
            violated: true,
            message: `${vitalLabel} reading of ${vitalDisplay} is below the threshold of ${rule.threshold_value} mmHg (systolic)`,
          };
        }
        if (rule.threshold_secondary && vital.secondary_value && 
            vital.secondary_value < rule.threshold_secondary) {
          return {
            violated: true,
            message: `${vitalLabel} reading of ${vitalDisplay} is below the threshold of ${rule.threshold_secondary} mmHg (diastolic)`,
          };
        }
      } else {
        if (vital.value < rule.threshold_value) {
          return {
            violated: true,
            message: `${vitalLabel} reading of ${vitalDisplay} is below the threshold of ${rule.threshold_value} ${vital.unit}`,
          };
        }
      }
      break;

    case "outside_range":
      if (rule.threshold_secondary !== null) {
        const min = Math.min(rule.threshold_value, rule.threshold_secondary);
        const max = Math.max(rule.threshold_value, rule.threshold_secondary);
        if (vital.value < min || vital.value > max) {
          return {
            violated: true,
            message: `${vitalLabel} reading of ${vitalDisplay} is outside the expected range of ${min}-${max} ${vital.unit}`,
          };
        }
      }
      break;
  }

  return { violated: false, message: "" };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Scheduled job or a signed-in user (the app triggers this after logging a vital).
  // Anonymous callers are rejected so the endpoint cannot be used to spam alert emails.
  const caller = await requireServiceRoleOrUser(req, corsHeaders);
  if (caller instanceof Response) return caller;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting vital alert check...");

    // A rule whose clinician can no longer see the patient — the share
    // expired, or the account is no longer a clinician — used to be skipped
    // below on every run, silently. The clinician kept a rule that looked
    // live and would never fire. This archives such rules and puts a notice
    // in the clinician's bell, as on_share_ended does when a share is switched
    // off. A failure here is logged, not fatal: alerts for everyone else
    // still go out, and the per-rule check below still refuses to send.
    const { data: archived, error: archiveError } = await supabase.rpc(
      "archive_alert_rules_without_access",
    );
    if (archiveError) {
      console.error("Error archiving rules without access:", archiveError);
    } else if (archived) {
      console.log(`Archived ${archived} alert rules whose clinician lost access`);
    }

    // Fetch all active alert rules
    const { data: alertRules, error: rulesError } = await supabase
      .from("clinician_alert_rules")
      .select("*")
      .eq("is_active", true)
      .is("archived_at", null);

    if (rulesError) {
      console.error("Error fetching alert rules:", rulesError);
      throw rulesError;
    }

    if (!alertRules || alertRules.length === 0) {
      console.log("No active alert rules found");
      return new Response(
        JSON.stringify({ message: "No active alert rules", alerts_sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ${alertRules.length} active alert rules`);

    // Get vitals recorded in the last hour that haven't been checked
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Get recent alert logs to avoid duplicate notifications
    const { data: recentAlertLogs, error: logsError } = await supabase
      .from("alert_logs")
      .select("vital_id")
      .gte("sent_at", oneHourAgo);

    if (logsError) {
      console.error("Error fetching alert logs:", logsError);
    }

    const alreadyAlertedVitalIds = new Set(
      (recentAlertLogs || []).map((log: { vital_id: string | null }) => log.vital_id).filter(Boolean)
    );

    let alertsSent = 0;

    // Process each alert rule
    for (const rule of alertRules as AlertRule[]) {
      // The rule was checked against the patient's share when it was created,
      // and never again. A share revoked or expired since — or a rule whose
      // patient_user_id was edited afterwards, which the UPDATE policy does
      // not prevent — would otherwise keep mailing this patient's readings to
      // someone the patient no longer shares them with.
      //
      // Asked exactly as the app asks it (clinician_can_see_patient_as), so
      // an unclaimed share addressed to the clinician's confirmed email counts
      // here as it did when the rule was created. Counting claimed shares only
      // stopped the alerts of every clinician who had not yet opened the
      // invite link. A rule with no access at all was archived above; one
      // that reaches the patient but whose share does not grant vitals is
      // skipped, because the readings are not the clinician's to be sent.
      const stillShared = await clinicianShareGrants(
        supabase,
        { id: rule.clinician_user_id },
        rule.patient_user_id,
        "vitals",
      );
      if (!stillShared) continue;

      // Fetch recent vitals for this patient and vital type
      const { data: vitals, error: vitalsError } = await supabase
        .from("vitals")
        .select("*")
        .eq("user_id", rule.patient_user_id)
        .eq("type", rule.vital_type)
        .gte("recorded_at", oneHourAgo)
        .order("recorded_at", { ascending: false });

      if (vitalsError) {
        console.error(`Error fetching vitals for rule ${rule.id}:`, vitalsError);
        continue;
      }

      if (!vitals || vitals.length === 0) {
        continue;
      }

      // Get clinician email
      let clinicianEmail: string | null = null;
      
      // First try to get email from auth.users via service role
      const { data: clinicianUser, error: userError } = await supabase
        .auth.admin.getUserById(rule.clinician_user_id);
      
      if (!userError && clinicianUser?.user?.email) {
        clinicianEmail = clinicianUser.user.email;
      } else if (rule.share_id) {
        // Fallback: get from provider_shares
        const { data: share } = await supabase
          .from("provider_shares")
          .select("provider_email")
          .eq("id", rule.share_id)
          .single();
        
        if (share?.provider_email) {
          clinicianEmail = share.provider_email;
        }
      }

      if (!clinicianEmail) {
        console.log(`No email found for clinician ${rule.clinician_user_id}`);
        continue;
      }

      // The email says that something needs review and where, not who or what
      // the reading was. The patient's name and value in a subject line and
      // body sat in every mail provider and inbox preview on the way; the
      // clinician sees both after signing in, where access is re-checked.
      // Check each vital against the rule
      for (const vital of vitals as Vital[]) {
        // Skip if already alerted
        if (alreadyAlertedVitalIds.has(vital.id)) {
          continue;
        }

        const { violated, message } = checkThresholdViolation(vital, rule);

        if (violated) {
          console.log(`Alert triggered for rule ${rule.id}`);

          // Send email notification
          try {
            const htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #ef4444, #f97316); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                  .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
                  .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 15px 0; }
                  .vital-value { font-size: 24px; font-weight: bold; color: #dc2626; }
                  .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1 style="margin: 0;">⚠️ Vital Alert</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Patient requires attention</p>
                  </div>
                  <div class="content">
                    <div class="alert-box">
                      <p style="margin: 0;">A reading from one of your patients is outside an alert threshold you set.</p>
                    </div>

                    <p>Sign in to OneCare to see who and what was recorded:
                      <a href="https://onecare.you/clinician/alerts">onecare.you/clinician/alerts</a></p>

                    <div class="footer">
                      <p>This is an automated alert from OneCare based on alert rules you configured.</p>
                      <p>You can manage your alert settings in the Clinician Portal.</p>
                    </div>
                  </div>
                </div>
              </body>
              </html>
            `;

            const emailResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "OneCare Alerts <alerts@onecare.you>",
                to: [clinicianEmail],
                subject: "⚠️ OneCare vital alert — a patient needs review",
                html: htmlContent,
              }),
            });

            const emailResult = await emailResponse.json();

            console.log("Email sent:", emailResult);

            // Log the alert
            const { error: logError } = await supabase
              .from("alert_logs")
              .insert({
                rule_id: rule.id,
                vital_id: vital.id,
                patient_user_id: rule.patient_user_id,
                clinician_user_id: rule.clinician_user_id,
                alert_type: "threshold_violation",
                message: message,
                sent_at: new Date().toISOString(),
              });

            if (logError) {
              console.error("Error logging alert:", logError);
            }

            alertsSent++;
            alreadyAlertedVitalIds.add(vital.id);

          } catch (emailError) {
            console.error("Error sending email:", emailError);
          }
        }
      }
    }

    console.log(`Alert check complete. Sent ${alertsSent} alerts.`);

    return new Response(
      JSON.stringify({ 
        message: "Alert check complete", 
        alerts_sent: alertsSent,
        rules_checked: alertRules.length 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error in check-vital-alerts function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to check vital alerts" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
