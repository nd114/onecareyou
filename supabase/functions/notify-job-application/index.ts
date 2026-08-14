import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string[], subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "OneCare Careers <careers@onecare.you>",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Resend API error: ${errorText}`);
  }

  return res.json();
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const body = await req.json().catch(() => null);
    const applicationId = body && typeof body === "object" ? (body as any).applicationId : null;

    // Only a real, already-persisted application can trigger an email.
    if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
      return new Response(JSON.stringify({ error: "Valid applicationId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: application, error } = await admin
      .from("job_applications")
      .select("job_title, full_name, email, created_at")
      .eq("id", applicationId)
      .maybeSingle();

    if (error) throw error;
    if (!application) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Only notify for freshly created applications (guards replay/abuse).
    const ageMs = Date.now() - new Date(application.created_at as string).getTime();
    if (ageMs > 15 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Application is not recent" }), {
        status: 409,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const jobTitle = String(application.job_title ?? "");
    const applicantName = String(application.full_name ?? "");
    const applicantEmail = String(application.email ?? "");
    if (!applicantEmail) throw new Error("Application has no email on record");

    const safeJobTitle = esc(jobTitle);
    const safeApplicantName = esc(applicantName);
    const safeApplicantEmail = esc(applicantEmail);

    await sendEmail(
      ["careers@onecare.you"],
      `New Application: ${jobTitle.replace(/[\r\n]/g, " ")}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #14b8a6; margin-bottom: 24px;">New Job Application</h1>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin-top: 0; color: #334155;">Position: ${safeJobTitle}</h2>
            <p style="margin-bottom: 8px;"><strong>Applicant:</strong> ${safeApplicantName}</p>
            <p style="margin-bottom: 0;"><strong>Email:</strong> <a href="mailto:${safeApplicantEmail}">${safeApplicantEmail}</a></p>
          </div>
          <p style="color: #64748b; font-size: 14px;">
            View the full application and resume in the OneCare backend admin panel.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
          <p style="color: #94a3b8; font-size: 12px;">
            This is an automated notification from OneCare Careers.
          </p>
        </div>
      `
    );

    await sendEmail(
      [applicantEmail],
      `Application Received: ${jobTitle.replace(/[\r\n]/g, " ")}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #14b8a6; margin-bottom: 24px;">Thanks for applying, ${safeApplicantName}!</h1>
          <p style="color: #334155; line-height: 1.6;">
            We've received your application for the <strong>${safeJobTitle}</strong> position at OneCare.
            Our team will review your application and get back to you if there's a good fit.
          </p>
          <p style="color: #334155; line-height: 1.6;">
            In the meantime, feel free to learn more about us at
            <a href="https://onecare.you" style="color: #14b8a6;">onecare.you</a>.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
          <p style="color: #94a3b8; font-size: 12px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-job-application function:", error);
    return new Response(JSON.stringify({ error: "Failed to send notification" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
