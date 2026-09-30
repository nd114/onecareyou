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
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const body = await req.json().catch(() => null);
    const inquiryId = body && typeof body === "object" ? (body as any).inquiryId : null;

    // Emails are only sent for inquiries that actually exist in the database.
    if (typeof inquiryId !== "string" || !UUID_RE.test(inquiryId)) {
      return new Response(JSON.stringify({ error: "Valid inquiryId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: inquiry, error } = await admin
      .from("enterprise_inquiries")
      .select(
        "contact_name, contact_email, contact_phone, practice_name, practice_size, specialty, country, ehr_system, requirements, created_at"
      )
      .eq("id", inquiryId)
      .maybeSingle();

    if (error) throw error;
    if (!inquiry) {
      return new Response(JSON.stringify({ error: "Inquiry not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const ageMs = Date.now() - new Date(inquiry.created_at as string).getTime();
    if (ageMs > 15 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Inquiry is not recent" }), {
        status: 409,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const contactEmail = String(inquiry.contact_email ?? "");
    const practiceName = String(inquiry.practice_name ?? "");
    if (!contactEmail) throw new Error("Inquiry has no contact email on record");

    const safe = {
      name: esc(inquiry.contact_name ?? "there"),
      email: esc(contactEmail),
      practice: esc(practiceName),
      size: inquiry.practice_size ? esc(inquiry.practice_size) : "—",
      specialty: inquiry.specialty ? esc(inquiry.specialty) : "—",
      country: inquiry.country ? esc(inquiry.country) : "—",
      ehr: inquiry.ehr_system ? esc(inquiry.ehr_system) : "—",
      phone: inquiry.contact_phone ? esc(inquiry.contact_phone) : "—",
      requirements: inquiry.requirements ? esc(inquiry.requirements).replace(/\n/g, "<br/>") : "—",
    };

    // No confirmation is mailed to the contact address: the caller only
    // names an inquiry id and has not proved they own that address. Only our
    // own team inbox is notified.

    // Internal notification
    await sendEmail(
      ["sales@onecare.you", "hello@onecare.you"],
      `New Enterprise Inquiry: ${practiceName.replace(/[\r\n]/g, " ")}`,
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
      contactEmail
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("notify-enterprise-inquiry error:", error);
    return new Response(JSON.stringify({ error: "Failed to send notification" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
