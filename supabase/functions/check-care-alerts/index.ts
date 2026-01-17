import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema (optional user_id filter)
const CheckCareAlertsSchema = z.object({
  user_id: z.string().uuid().optional(),
}).optional();

interface CareAlertSetting {
  id: string;
  user_id: string;
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
        // Check if we already sent an alert today
        if (setting.last_alert_sent_at) {
          const lastSent = new Date(setting.last_alert_sent_at);
          if (lastSent >= today) {
            console.log(`Already sent alert today for setting ${setting.id}`);
            continue;
          }
        }

        // Get missed doses for this user today
        const { data: missedEntries, error: entriesError } = await supabase
          .from('schedule_entries')
          .select('id, scheduled_time, medication:medications(name)')
          .eq('user_id', setting.user_id)
          .eq('status', 'pending')
          .lt('scheduled_time', new Date().toISOString())
          .gte('scheduled_time', today.toISOString());

        if (entriesError) {
          console.error(`Error fetching entries for user ${setting.user_id}:`, entriesError);
          continue;
        }

        const missedCount = missedEntries?.length || 0;
        console.log(`User ${setting.user_id} has ${missedCount} missed doses today`);

        // Check if threshold is met
        if (missedCount >= setting.missed_dose_threshold) {
          // Get user profile for name
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('user_id', setting.user_id)
            .single();

          const userName = profile?.name || 'Your loved one';
          const missedMeds = missedEntries
            ?.map(e => (e.medication as any)?.name)
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
                from: 'OneCare <alerts@updates.lovable.app>',
                to: [setting.alert_recipient_email],
                subject: `⚠️ Care Alert: ${userName} has missed ${missedCount} medication dose${missedCount > 1 ? 's' : ''}`,
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ef4444;">Care Alert</h2>
                    <p>Hello ${setting.alert_recipient_name},</p>
                    <p>We wanted to let you know that <strong>${userName}</strong> has missed <strong>${missedCount} medication dose${missedCount > 1 ? 's' : ''}</strong> today.</p>
                    ${missedMeds ? `<p><strong>Missed medications:</strong> ${missedMeds}</p>` : ''}
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
