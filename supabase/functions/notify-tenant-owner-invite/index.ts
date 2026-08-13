import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrAdmin } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const gate = await requireServiceRoleOrAdmin(req, corsHeaders);
    if (gate instanceof Response) return gate;

    if (!RESEND_API_KEY) return json({ error: "Email is not configured" }, 500);

    const body = (await req.json().catch(() => null)) as
      | { invitation_id?: string }
      | null;
    const invitationId = body?.invitation_id;
    if (!invitationId || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
      return json({ error: "invitation_id must be a valid id" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: invite, error } = await admin
      .from("tenant_owner_invitations")
      .select("id, email, expires_at, status, practice_id")
      .eq("id", invitationId)
      .maybeSingle();

    if (error) throw error;
    if (!invite) return json({ error: "Invitation not found" }, 404);
    if (invite.status !== "pending") return json({ error: "Invitation is not pending" }, 400);

    const { data: practice } = await admin
      .from("practices")
      .select("name, tenant_type")
      .eq("id", invite.practice_id)
      .maybeSingle();

    const institution = esc(practice?.name ?? "your institution");
    const kind = practice?.tenant_type === "hospital" ? "hospital" : "practice";
    const expires = new Date(invite.expires_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "OneCare <hello@onecare.you>",
        to: [invite.email],
        reply_to: "hello@onecare.you",
        subject: `You've been invited to run ${practice?.name ?? "an institution"} on OneCare`,
        html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
          <h1 style="color:#14b8a6;margin:0 0 16px;">You're invited to OneCare</h1>
          <p style="line-height:1.6;">You have been invited to become the owner of <strong>${institution}</strong> on OneCare, with full administrative control of that ${kind} — team members, patient connections, storage and settings.</p>
          <p style="line-height:1.6;"><strong>How to accept</strong></p>
          <ol style="line-height:1.8;">
            <li>Create a OneCare clinician account with this email address (<strong>${esc(invite.email)}</strong>), or sign in if you already have one.</li>
            <li>Open <a href="https://onecare.you/clinician/practice" style="color:#14b8a6;">Practice</a>.</li>
            <li>Accept the ownership invitation shown at the top of the page.</li>
          </ol>
          <p style="line-height:1.6;">
            <a href="https://onecare.you/clinician/sign-up" style="display:inline-block;background:#14b8a6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Get started</a>
          </p>
          <p style="line-height:1.6;color:#64748b;">This invitation expires on ${expires}.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
          <p style="color:#94a3b8;font-size:12px;">If you weren't expecting this, you can ignore this email — nothing happens until you accept.</p>
        </div>`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Resend error", text);
      return json({ error: "Could not send the invitation email" }, 502);
    }

    return json({ success: true });
  } catch (e) {
    console.error("notify-tenant-owner-invite failed", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
