import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface JobApplicationNotification {
  jobTitle: string;
  applicantName: string;
  applicantEmail: string;
}

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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobTitle, applicantName, applicantEmail }: JobApplicationNotification = await req.json();

    // Validate required fields
    if (!jobTitle || !applicantName || !applicantEmail) {
      throw new Error("Missing required fields");
    }

    // Send notification to careers inbox
    const emailResponse = await sendEmail(
      ["careers@onecare.you"],
      `New Application: ${jobTitle}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #14b8a6; margin-bottom: 24px;">New Job Application</h1>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin-top: 0; color: #334155;">Position: ${jobTitle}</h2>
            <p style="margin-bottom: 8px;"><strong>Applicant:</strong> ${applicantName}</p>
            <p style="margin-bottom: 0;"><strong>Email:</strong> <a href="mailto:${applicantEmail}">${applicantEmail}</a></p>
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

    console.log("Job application notification sent:", emailResponse);

    // Also send a confirmation to the applicant
    await sendEmail(
      [applicantEmail],
      `Application Received: ${jobTitle}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #14b8a6; margin-bottom: 24px;">Thanks for applying, ${applicantName}!</h1>
          
          <p style="color: #334155; line-height: 1.6;">
            We've received your application for the <strong>${jobTitle}</strong> position at OneCare. 
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
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-job-application function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
