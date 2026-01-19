import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schemas
const VitalRecordSchema = z.object({
  id: z.string().uuid(),
  type: z.string().max(50),
  value: z.number(),
  secondary_value: z.number().nullable(),
  unit: z.string().max(20),
  recorded_at: z.string(),
  notes: z.string().max(500).nullable(),
});

const SendReportRequestSchema = z.object({
  recipientEmail: z.string().email().max(255),
  recipientName: z.string().max(100).optional(),
  vitals: z.array(VitalRecordSchema).min(1).max(500),
  dateRange: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }),
});

type VitalRecord = z.infer<typeof VitalRecordSchema>;

const VITAL_LABELS: Record<string, string> = {
  blood_pressure: 'Blood Pressure',
  heart_rate: 'Heart Rate',
  weight: 'Weight',
  temperature: 'Temperature',
  glucose: 'Glucose',
  hba1c: 'HbA1c',
  cholesterol_total: 'Total Cholesterol',
  ldl: 'LDL',
  hdl: 'HDL',
  hemoglobin: 'Hemoglobin',
  creatinine: 'Creatinine',
  gfr: 'GFR',
  urea: 'Urea',
  alt: 'ALT',
  ast: 'AST',
  potassium: 'Potassium',
  sodium: 'Sodium',
  wbc: 'WBC',
};

function formatValue(vital: VitalRecord): string {
  if (vital.type === 'blood_pressure' && vital.secondary_value) {
    return `${vital.value}/${vital.secondary_value}`;
  }
  return vital.value.toString();
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function generateEmailHTML(
  patientName: string,
  patientEmail: string,
  recipientName: string | undefined,
  vitals: VitalRecord[],
  dateRange: { from?: string; to?: string }
): string {
  const greeting = recipientName ? `Dear ${recipientName}` : 'Dear Healthcare Provider';
  
  const dateRangeText = dateRange.from && dateRange.to
    ? `${formatDate(dateRange.from).split(',')[0]} to ${formatDate(dateRange.to).split(',')[0]}`
    : 'All recorded readings';

  // Group vitals by type for summary
  const vitalsByType: Record<string, VitalRecord[]> = {};
  for (const vital of vitals) {
    if (!vitalsByType[vital.type]) vitalsByType[vital.type] = [];
    vitalsByType[vital.type].push(vital);
  }

  const summaryRows = Object.entries(vitalsByType).map(([type, records]) => {
    const label = VITAL_LABELS[type] || type;
    const values = records.map(r => r.value);
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    const latest = records[0];
    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; font-weight: 500;">${label}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${formatValue(latest)} ${latest.unit}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${avg} ${latest.unit}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${records.length}</td>
      </tr>
    `;
  }).join('');

  const detailRows = vitals.slice(0, 50).map(vital => {
    const label = VITAL_LABELS[vital.type] || vital.type;
    return `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0;">${label}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-weight: 600;">${formatValue(vital)} ${vital.unit}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; color: #666;">${formatDate(vital.recorded_at)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 12px;">${vital.notes || '-'}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%); padding: 30px; text-align: center;">
          <h1 style="margin: 0; color: white; font-size: 24px;">Health Vitals Report</h1>
          <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Shared via MedTrack</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px;">
          <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
            ${greeting},
          </p>
          <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
            <strong>${patientName}</strong> (${patientEmail}) has shared their health vitals report with you.
          </p>
          
          <!-- Report Info -->
          <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #666;">Date Range:</span>
              <strong style="color: #333;">${dateRangeText}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Total Readings:</span>
              <strong style="color: #333;">${vitals.length}</strong>
            </div>
          </div>
          
          <!-- Summary Table -->
          <h2 style="margin: 0 0 15px; color: #333; font-size: 18px;">Summary</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666; font-weight: 600;">Metric</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666; font-weight: 600;">Latest</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666; font-weight: 600;">Average</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666; font-weight: 600;">Count</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRows}
            </tbody>
          </table>
          
          <!-- Detailed Readings -->
          <h2 style="margin: 0 0 15px; color: #333; font-size: 18px;">Recent Readings ${vitals.length > 50 ? '(showing first 50)' : ''}</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666;">Type</th>
                <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666;">Value</th>
                <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666;">Date</th>
                <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e5e5; color: #666;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${detailRows}
            </tbody>
          </table>
        </div>
        
        <!-- Footer -->
        <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e5e5;">
          <p style="margin: 0; color: #999; font-size: 12px;">
            This report is for informational purposes only. Please consult with your healthcare provider for medical advice.
          </p>
          <p style="margin: 10px 0 0; color: #999; font-size: 12px;">
            Generated by MedTrack Health Tracking Platform
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-vitals-report function invoked");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error("No authorization header");
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log("Authenticated user:", userId);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
    }

    const patientName = profile?.name || 'A patient';
    const patientEmail = profile?.email || claimsData.claims.email || 'Unknown';

    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = SendReportRequestSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation error:', parseResult.error.flatten());
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parseResult.error.flatten().fieldErrors }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    const { recipientEmail, recipientName, vitals, dateRange } = parseResult.data;
    
    console.log(`Sending report to ${recipientEmail} with ${vitals.length} vitals`);

    // Generate email HTML
    const html = generateEmailHTML(patientName, patientEmail, recipientName, vitals, dateRange);

    // Send email
    const emailResponse = await resend.emails.send({
      from: "MedTrack <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `Health Vitals Report from ${patientName}`,
      html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in send-vitals-report function:", error);
    return new Response(
      JSON.stringify({ error: 'Failed to send report' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
