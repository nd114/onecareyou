import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { requireServiceRole } from "../_shared/auth.ts";
import { CAREGIVERS_ENABLED } from "../_shared/features.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema (optional user_id filter)
const CheckCareAlertsSchema = z.object({
  user_id: z.string().uuid().optional(),
}).optional();

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface CareAlertSetting {
  id: string;
  user_id: string;
  family_member_id: string | null;
  alert_recipient_email: string;
  alert_recipient_name: string;
  missed_dose_threshold: number;
  is_active: boolean;
  notify_by_email: boolean;
  last_alert_sent_at: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal scheduled job only — reject any public caller
  const unauthorized = await requireServiceRole(req, corsHeaders);
  if (unauthorized) return unauthorized;

  // Caregiver alerts are paused. The screens that set them up are hidden by the
  // same switch, so a patient could no longer see or stop mail sent here.
  if (!CAREGIVERS_ENABLED) {
    return new Response(
      JSON.stringify({ message: "Caregiver alerts are paused", alertsSent: 0, paused: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate request body
    const rawBody = await req.json().catch(() => ({}));
    const parseResult = CheckCareAlertsSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation error:', parseResult.error.flatten());
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parseResult.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const user_id = parseResult.data?.user_id;

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Build query for alert settings
    let settingsQuery = supabase
      .from('care_alert_settings')
      .select('*')
      .eq('is_active', true);

    if (user_id) {
      settingsQuery = settingsQuery.eq('user_id', user_id);
    }

    const { data: alertSettings, error: settingsError } = await settingsQuery;

    if (settingsError) {
      console.error("Error fetching alert settings:", settingsError);
      throw settingsError;
    }

    if (!alertSettings || alertSettings.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active alert settings found", alertsSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${alertSettings.length} active alert settings to check`);

    const alertsSent: string[] = [];
    const errors: string[] = [];

    // Process each alert setting
    for (const setting of alertSettings as CareAlertSetting[]) {
      try {
        // Does the patient still want their care circle told?
        //
        // One question, one accessor. The preference this replaces was a boolean
        // on `profiles` that this function — and the nine others that send mail —
        // never read, so switching notifications off in Settings changed nothing
        // anywhere.
        const { data: allowed, error: prefError } = await supabase.rpc('notification_allowed', {
          _user_id: setting.user_id,
          _category: 'care_circle_missed_doses',
          _channel: 'email',
        });
        if (prefError) {
          // A preference lookup that fails is not consent. Skip rather than
          // send: a missed alert is recoverable, mail somebody asked not to
          // receive is not.
          console.error('notification_allowed failed', setting.user_id, prefError);
          continue;
        }
        if (allowed === false) {
          console.log(`Care-circle alerts switched off for ${setting.user_id}`);
          continue;
        }

        // Check if we already sent an alert today
        if (setting.last_alert_sent_at) {
          const lastSent = new Date(setting.last_alert_sent_at);
          if (lastSent >= today) {
            console.log(`Already sent alert today for setting ${setting.id}`);
            continue;
          }
        }

        // A setting for a family member is about that person. Their doses are
        // stored under the account holder's user_id, so this counted every
        // pending dose on the account: the parent's contact was told the
        // parent had missed the child's doses, and the reverse. An archived
        // member is off the owner's screens, so an alert about them is one
        // the owner could no longer see the cause of or switch off there.
        let subjectName: string | null = null;
        if (setting.family_member_id) {
          const { data: member, error: memberError } = await supabase
            .from('family_members')
            .select('name, archived_at')
            .eq('id', setting.family_member_id)
            .maybeSingle();
          if (memberError || !member) {
            console.error(`Family member for setting ${setting.id} not found`, memberError);
            continue;
          }
          if (member.archived_at) {
            console.log(`Setting ${setting.id} is for an archived family member; skipped`);
            continue;
          }
          subjectName = member.name;
        }

        // Missed today: pending and already due. care_alert_missed_doses is
        // the one definition of whose doses a setting counts.
        const { data: missedEntries, error: entriesError } = await supabase.rpc(
          'care_alert_missed_doses',
          {
            _setting_id: setting.id,
            _from: today.toISOString(),
            _until: new Date().toISOString(),
          },
        );

        if (entriesError) {
          console.error(`Error fetching entries for setting ${setting.id}:`, entriesError);
          continue;
        }

        const missedCount = missedEntries?.length || 0;
        console.log(`Setting ${setting.id} has ${missedCount} missed doses today`);

        // Check if threshold is met
        if (missedCount >= setting.missed_dose_threshold) {
          // The person the doses are for: the family member, or the account
          // holder for their own setting.
          if (subjectName === null) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('name, email')
              .eq('user_id', setting.user_id)
              .single();
            subjectName = profile?.name ?? null;
          }

          const userName = subjectName || 'Your loved one';
          // First name only in the email, and no medication names at all: the
          // recipient address was typed by the patient and never verified, so
          // a typo sends this to a stranger — and a list of drug names says
          // what someone is being treated for. The care contact can call.
          const firstName = esc(userName.trim().split(/\s+/)[0] || 'Your loved one');
          const missedMeds = (missedEntries as { medication_name: string | null }[] | null)
            ?.map(e => e.medication_name)
            .filter(Boolean)
            .slice(0, 5)
            .join(', ');

          // Send email alert
          if (setting.notify_by_email && resendApiKey) {
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'OneCare Alerts <alerts@onecare.you>',
                to: [setting.alert_recipient_email],
                subject: '⚠️ OneCare care alert — someone you look out for may need a check-in',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ef4444;">Care Alert</h2>
                    <p>Hello ${esc(setting.alert_recipient_name ?? '')},</p>
                    <p>We wanted to let you know that <strong>${firstName}</strong> has missed <strong>${missedCount} scheduled dose${missedCount > 1 ? 's' : ''}</strong> today.</p>
                    <p>You may want to check in with them to ensure they're okay.</p>
                    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e5e5;" />
                    <p style="color: #666; font-size: 12px;">
                      This alert was sent because you're set up as a care contact in OneCare.
                      You'll receive at most one alert per day for missed doses.
                    </p>
                  </div>
                `,
              }),
            });

            if (!emailResponse.ok) {
              const errorText = await emailResponse.text();
              console.error(`Failed to send email for setting ${setting.id}:`, errorText);
              errors.push(`Email failed for ${setting.alert_recipient_email}`);
            } else {
              console.log(`Email sent successfully to ${setting.alert_recipient_email}`);
              alertsSent.push(setting.alert_recipient_email);
            }
          }

          // Log the alert
          await supabase
            .from('care_alert_logs')
            .insert({
              setting_id: setting.id,
              user_id: setting.user_id,
              recipient_email: setting.alert_recipient_email,
              missed_count: missedCount,
              message: `Missed ${missedCount} doses: ${missedMeds || 'various medications'}`,
            });

          // Update last_alert_sent_at
          await supabase
            .from('care_alert_settings')
            .update({ last_alert_sent_at: new Date().toISOString() })
            .eq('id', setting.id);
        }
      } catch (error) {
        console.error(`Error processing alert setting ${setting.id}:`, error);
        errors.push(`Failed for setting ${setting.id}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "Care alerts check completed",
        alertsSent: alertsSent.length,
        recipients: alertsSent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in check-care-alerts:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process care alerts" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
