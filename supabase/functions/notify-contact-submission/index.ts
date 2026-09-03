import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Sends the two emails a contact form owes: a confirmation to the sender and a
 * notification to us.
 *
 * The submission is written by the client and read back here with the service
 * role, so the message body in the email is the message that was actually
 * stored — a caller cannot post arbitrary text through this function by
 * calling it directly. It can only name a row id, and the row has to be recent
 * and real.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string[], subject: string, html: string, replyTo?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "OneCare <hello@onecare.you>",
      to,
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Resend API error: ${errorText}`);
  }
  return res.json();
}

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPE_LABELS: Record<string, string> = {
  general: "General enquiry",
  support: "Technical support",
  billing: "Billing question",
  partnership: "Partnership",
  feedback: "Feedback",
  other: "Other",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const body = await req.json().catch(() => null);
    const submissionId =
      body && typeof body === "object" ? (body as Record<string, unknown>).submissionId : null;

    if (typeof submissionId !== "string" || !UUID_RE.test(submissionId)) {
      return new Response(JSON.stringify({ error: "Valid submissionId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: submission, error } = await admin
      .from("contact_submissions")
      .select("contact_name, contact_email, inquiry_type, subject, message, created_at")
      .eq("id", submissionId)
      .maybeSingle();

    if (error) throw error;
    if (!submission) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Only a submission that has just been written gets an email. An old id
    // cannot be replayed to send the same person the same message again.
    const ageMs = Date.now() - new Date(submission.created_at as string).getTime();
    if (ageMs > 15 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Submission is not recent" }), {
        status: 409,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const contactEmail = String(submission.contact_email ?? "");
    if (!contactEmail) throw new Error("Submission has no contact email on record");

    const safe = {
      name: esc(submission.contact_name ?? "there"),
      email: esc(contactEmail),
      type: esc(TYPE_LABELS[String(submission.inquiry_type)] ?? String(submission.inquiry_type)),
      subject: esc(submission.subject ?? ""),
      message: esc(submission.message ?? "").replace(/\n/g, "<br/>"),
    };

    // Header injection: a newline in a subject line is how a sender would try
    // to add their own headers, so it never reaches one.
    const plainSubject = String(submission.subject ?? "").replace(/[\r\n]/g, " ").slice(0, 120);

    // Confirmation to the sender, so "message sent" is something they can check.
    await sendEmail(
      [contactEmail],
      "We received your message",
      `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#0d0d0d;">
        <h1 style="color:#064e3b;margin:0 0 16px;font-size:22px;">Thanks, ${safe.name}</h1>
        <p style="line-height:1.6;">We have your message and someone will reply. If it is urgent and clinical, please contact your care provider directly rather than waiting on us.</p>
        <div style="background:#f5f0e0;border-radius:12px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;color:#064e3b;"><strong>What you sent</strong></p>
          <p style="margin:4px 0;"><strong>Type:</strong> ${safe.type}</p>
          <p style="margin:4px 0;"><strong>Subject:</strong> ${safe.subject}</p>
          <p style="margin:12px 0 0;line-height:1.6;">${safe.message}</p>
        </div>
        <hr style="border:none;border-top:1px solid #e2ded0;margin:24px 0;"/>
        <p style="color:#6b7280;font-size:12px;">This is an automated confirmation from OneCare. You can reply to this email.</p>
      </div>`,
      "hello@onecare.you",
    );

    // Notification to us, with reply-to set so a reply reaches the sender.
    await sendEmail(
      ["hello@onecare.you"],
      `[${TYPE_LABELS[String(submission.inquiry_type)] ?? "Contact"}] ${plainSubject}`,
      `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;color:#0d0d0d;">
        <h2 style="color:#064e3b;margin:0 0 16px;font-size:18px;">New contact message</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;width:90px;">From</td><td>${safe.name} &lt;<a href="mailto:${safe.email}">${safe.email}</a>&gt;</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Type</td><td>${safe.type}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Subject</td><td>${safe.subject}</td></tr>
        </table>
        <div style="background:#f5f0e0;border-radius:12px;padding:16px;margin:20px 0;line-height:1.6;">
          ${safe.message}
        </div>
        <p style="color:#6b7280;font-size:12px;">Submission ${esc(submissionId)}</p>
      </div>`,
      contactEmail,
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("notify-contact-submission failed:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
