import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EnterpriseInquiryPayload {
  contact_name: string;
  contact_email: string;
  practice_name: string;
  practice_size?: string | null;
  specialty?: string | null;
  country?: string | null;
  ehr_system?: string | null;
  requirements?: string | null;
  contact_phone?: string | null;
}

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
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    const body = (await req.json().catch(() => null)) as EnterpriseInquiryPayload | null;
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isStr = (v: unknown, max: number) =>
      typeof v === "string" && v.trim().length > 0 && v.length <= max;
    const noCRLF = (v: unknown) => typeof v === "string" && !/[\r\n]/.test(v);

    if (
      !isStr(body.contact_name, 200) || !noCRLF(body.contact_name) ||
      !isStr(body.contact_email, 320) || !emailRegex.test(body.contact_email) ||
      !isStr(body.practice_name, 200) || !noCRLF(body.practice_name)
    ) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const safe = {
      name: esc(body.contact_name),
      email: esc(body.contact_email),
      practice: esc(body.practice_name),
      size: body.practice_size ? esc(body.practice_size) : "—",
      specialty: body.specialty ? esc(body.specialty) : "—",
      country: body.country ? esc(body.country) : "—",
      ehr: body.ehr_system ? esc(body.ehr_system) : "—",
      phone: body.contact_phone ? esc(body.contact_phone) : "—",
      requirements: body.requirements ? esc(body.requirements).replace(/\n/g, "<br/>") : "—",
    };

    // Applicant confirmation
    await sendEmail(
      [body.contact_email],
      "We received your OneCare Enterprise inquiry",
      `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
        <h1 style="color:#14b8a6;margin:0 0 16px;">Thanks, ${safe.name}!</h1>
        <p style="line-height:1.6;">We've received your enterprise inquiry for <strong>${safe.practice}</strong>. A member of our team will be in touch within <strong>1 business day</strong> to schedule a personalized demo and discuss your practice's needs.</p>
        <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;"><strong>Summary</strong></p>
          <p style="margin:4px 0;">Practice: ${safe.practice}</p>
          <p style="margin:4px 0;">Size: ${safe.size}</p>
          <p style="margin:4px 0;">Specialty: ${safe.specialty}</p>
          <p style="margin:4px 0;">EHR: ${safe.ehr}</p>
          <p style="margin:4px 0;">Country: ${safe.country}</p>
        </div>
        <p style="line-height:1.6;">In the meantime, you can explore <a href="https://onecare.you" style="color:#14b8a6;">onecare.you</a> or reply to this email with any questions.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <p style="color:#94a3b8;font-size:12px;">This is an automated confirmation from OneCare.</p>
      </div>`,
      "hello@onecare.you"
    );

    // Internal notification
    await sendEmail(
      ["sales@onecare.you", "hello@onecare.you"],
      `New Enterprise Inquiry: ${body.practice_name}`,
      `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
        <h2 style="color:#14b8a6;margin:0 0 16px;">New Enterprise Inquiry</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#64748b;">Contact</td><td>${safe.name} &lt;<a href="mailto:${safe.email}">${safe.email}</a>&gt;</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Phone</td><td>${safe.phone}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Practice</td><td>${safe.practice}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Size</td><td>${safe.size}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Specialty</td><td>${safe.specialty}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Country</td><td>${safe.country}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">EHR</td><td>${safe.ehr}</td></tr>
        </table>
        <h3 style="margin-top:24px;">Requirements</h3>
        <div style="background:#f8fafc;border-radius:8px;padding:16px;">${safe.requirements}</div>
      </div>`,
      body.contact_email
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("notify-enterprise-inquiry error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
