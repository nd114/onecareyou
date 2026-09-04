import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Takes a contact form submission, stores it, and sends the two emails it owes:
 * a confirmation to the sender and a notification to us.
 *
 * ## Why this function writes the row
 *
 * It used to accept a `submissionId` for a row the browser had already
 * inserted, and `anon` had INSERT on the table. That made the pair an open
 * mail relay: store any text addressed to any inbox, then ask us to send it,
 * from our own domain, without limit. The function's previous comment said a
 * caller "can only name a row id" — true, and beside the point, because they
 * inserted the row first.
 *
 * So the write moved here. Validation and rate limiting have to happen before
 * anything is stored, and that is impossible when the client inserts directly,
 * because the function never sees the insert.
 *
 * ## What stops it being a relay now
 *
 *   - `anon` cannot write to the table at all.
 *   - Rate limits per email address and per sender, both generous for a person
 *     and useless for a script.
 *   - `notified_at` is claimed atomically before sending, so a submission can
 *     never be emailed twice.
 *   - The confirmation to the sender carries only a short excerpt. The full
 *     text goes to us. Echoing ten kilobytes of somebody's chosen prose to
 *     somebody else's chosen inbox is the phishing payload, and a confirmation
 *     does not need it to be a useful confirmation.
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

const TYPE_LABELS: Record<string, string> = {
  general: "General enquiry",
  support: "Technical support",
  billing: "Billing question",
  partnership: "Partnership",
  feedback: "Feedback",
  other: "Other",
};

/** Generous for a person writing in, useless for a script. */
const MAX_PER_EMAIL_PER_HOUR = 3;
const MAX_PER_SENDER_PER_HOUR = 5;

/** How much of the message is echoed back to the sender's own inbox. */
const CONFIRMATION_EXCERPT = 240;

const FIELD_LIMITS = {
  contact_name: 200,
  contact_email: 320,
  subject: 300,
  message: 10000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * A daily-salted hash of the sender's address.
 *
 * Not the address itself: who writes to a health company is not worth keeping
 * in the clear. Rotating the salt daily means a fingerprint stops being
 * linkable after a day, which is longer than the hourly window needs and
 * shorter than forever.
 */
async function fingerprint(req: Request): Promise<string | null> {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "";
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  const bytes = new TextEncoder().encode(`${day}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function readField(body: Record<string, unknown>, key: keyof typeof FIELD_LIMITS): string {
  const raw = body[key];
  return typeof raw === "string" ? raw.trim() : "";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return badRequest("A message is required");

    const contactName = readField(body, "contact_name");
    const contactEmail = readField(body, "contact_email").toLowerCase();
    const subject = readField(body, "subject");
    const message = readField(body, "message");
    const inquiryType = typeof body.inquiry_type === "string" ? body.inquiry_type : "general";

    // Validated here as well as by the table's CHECK constraints. The
    // constraints are the backstop; this is so a person gets a sentence rather
    // than a constraint violation.
    if (!contactName) return badRequest("Please tell us your name");
    if (!EMAIL_RE.test(contactEmail)) return badRequest("That email address does not look right");
    if (!subject) return badRequest("Please give the message a subject");
    if (!message) return badRequest("The message is empty");
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
      const value = { contact_name: contactName, contact_email: contactEmail, subject, message }[
        field as keyof typeof FIELD_LIMITS
      ];
      if (value.length > limit) return badRequest(`That ${field.replace("contact_", "")} is too long`);
    }
    if (!TYPE_LABELS[inquiryType]) return badRequest("Unknown enquiry type");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const sender = await fingerprint(req);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count: emailCount } = await admin
      .from("contact_submissions")
      .select("id", { count: "exact", head: true })
      .eq("contact_email", contactEmail)
      .gte("created_at", hourAgo);
    if ((emailCount ?? 0) >= MAX_PER_EMAIL_PER_HOUR) {
      return badRequest("You have sent us several messages already. We will reply to those first.", 429);
    }

    if (sender) {
      const { count: senderCount } = await admin
        .from("contact_submissions")
        .select("id", { count: "exact", head: true })
        .eq("sender_fingerprint", sender)
        .gte("created_at", hourAgo);
      if ((senderCount ?? 0) >= MAX_PER_SENDER_PER_HOUR) {
        return badRequest("Too many messages just now. Please try again later.", 429);
      }
    }

    // Signed-in senders may claim themselves and nobody else. The claim is
    // checked against the token rather than taken from the body.
    let submittedBy: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const { data } = await admin.auth.getUser(token);
      submittedBy = data?.user?.id ?? null;
    }

    const { data: submission, error: insertError } = await admin
      .from("contact_submissions")
      .insert({
        submitted_by: submittedBy,
        contact_name: contactName,
        contact_email: contactEmail,
        inquiry_type: inquiryType,
        subject,
        message,
        sender_fingerprint: sender,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    // Claim the send before making it. Two concurrent calls cannot both win,
    // so a submission is emailed exactly once however often this is called.
    const { data: claimed } = await admin
      .from("contact_submissions")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", submission.id)
      .is("notified_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) {
      // Stored, and somebody else is sending it. Not an error to the sender.
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const safe = {
      name: esc(contactName),
      email: esc(contactEmail),
      type: esc(TYPE_LABELS[inquiryType] ?? inquiryType),
      subject: esc(subject),
      message: esc(message).replace(/\n/g, "<br/>"),
    };
    // Short, because this goes to an address the sender chose. The full text
    // goes to us, where it is a message rather than a payload.
    const excerpt = esc(
      message.length > CONFIRMATION_EXCERPT
        ? `${message.slice(0, CONFIRMATION_EXCERPT)}…`
        : message,
    ).replace(/\n/g, "<br/>");

    // Header injection: a newline in a subject line is how a sender would try
    // to add their own headers, so it never reaches one.
    const plainSubject = subject.replace(/[\r\n]/g, " ").slice(0, 120);

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
          <p style="margin:12px 0 0;line-height:1.6;">${excerpt}</p>
        </div>
        <hr style="border:none;border-top:1px solid #e2ded0;margin:24px 0;"/>
        <p style="color:#6b7280;font-size:12px;">This is an automated confirmation from OneCare. You can reply to this email. If you did not write to us, you can ignore this — nothing has been shared with anybody.</p>
      </div>`,
      "hello@onecare.you",
    );

    // Notification to us, with reply-to set so a reply reaches the sender.
    await sendEmail(
      ["hello@onecare.you"],
      `[${TYPE_LABELS[inquiryType] ?? "Contact"}] ${plainSubject}`,
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
        <p style="color:#6b7280;font-size:12px;">Submission ${esc(submission.id)}</p>
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
