import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

/**
 * Tells someone they have been invited to join a practice.
 *
 * Inviting a colleague wrote a practice_invitations row and stopped there. The
 * toast said "Invitation sent" and nothing had been sent: a colleague who
 * already had a OneCare account under that exact address would eventually see
 * a badge in their header, and a colleague who did not — which is most of the
 * point of inviting someone — got nothing at all, ever, while the practice
 * admin watched a row sit at "pending" indefinitely.
 *
 * The caller has to be the person who created the invitation. Anyone signed in
 * could otherwise make us email any address they liked by guessing invitation
 * ids, which is the same open-relay shape the contact form had.
 */

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

/** The roles practice_members actually uses — see PracticeRole. */
const ROLE_LABEL: Record<string, string> = {
  owner: "an owner",
  admin: "an administrator",
  provider: "a clinician",
  staff: "a staff member",
  clinician: "a clinician",
  nurse: "a nurse",
  front_desk: "front desk staff",
  billing: "billing staff",
  read_only: "a read-only member",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await requireUser(req, corsHeaders);
    if (caller instanceof Response) return caller;

    if (!RESEND_API_KEY) return json({ error: "Email is not configured" }, 500);

    const body = (await req.json().catch(() => null)) as { invitation_id?: string } | null;
    const invitationId = body?.invitation_id;
    if (!invitationId || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
      return json({ error: "invitation_id must be a valid id" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: invite, error } = await admin
      .from("practice_invitations")
      .select("id, email, name, role, status, practice_id, invited_by")
      .eq("id", invitationId)
      .maybeSingle();

    if (error) throw error;
    if (!invite) return json({ error: "Invitation not found" }, 404);
    if (invite.status !== "pending") return json({ error: "Invitation is not pending" }, 400);

    // Only the person who sent it may ask us to deliver it.
    if (invite.invited_by !== caller.id) {
      return json({ error: "Not your invitation to send" }, 403);
    }

    const { data: practice } = await admin
      .from("practices")
      .select("name")
      .eq("id", invite.practice_id)
      .maybeSingle();

    const practiceName = esc(practice?.name ?? "a practice");
    const role = ROLE_LABEL[invite.role] ?? "a team member";
    const greeting = invite.name ? `Hello ${esc(invite.name)},` : "Hello,";

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
        subject: `You've been invited to join ${practice?.name ?? "a practice"} on OneCare`,
        html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
          <h1 style="color:#14b8a6;margin:0 0 16px;">You're invited to OneCare</h1>
          <p style="line-height:1.6;">${greeting}</p>
          <p style="line-height:1.6;">You have been invited to join <strong>${practiceName}</strong> on OneCare as ${role}.</p>
          <p style="line-height:1.6;"><strong>How to accept</strong></p>
          <ol style="line-height:1.8;">
            <li>Create a OneCare clinician account using this email address (<strong>${esc(invite.email)}</strong>), or sign in if you already have one. The invitation is tied to that address.</li>
            <li>Open <a href="https://onecare.you/clinician/practice" style="color:#14b8a6;">Practice</a>.</li>
            <li>Accept the invitation shown at the top of the page.</li>
          </ol>
          <p style="line-height:1.6;">
            <a href="https://onecare.you/clinician/sign-up" style="display:inline-block;background:#14b8a6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Get started</a>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
          <p style="color:#94a3b8;font-size:12px;">If you weren't expecting this, you can ignore this email — nothing happens until you accept, and you see no patient information before then.</p>
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
    console.error("notify-practice-invite failed", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
