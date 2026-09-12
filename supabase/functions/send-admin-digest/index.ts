import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrAdmin } from "../_shared/auth.ts";

/**
 * The morning digest for platform admins: yesterday's movement, the current
 * attention queue and anything that broke, with a link into the console.
 *
 * Runs hourly from cron and sends only to admins whose chosen send hour (UTC)
 * matches the current hour and who have not already had today's email. An
 * admin can also ask for one immediately from the console ({ test: true }),
 * which never touches last_sent_at so it cannot suppress the real send.
 *
 * The body carries counts and states only. No clinical content, ever — the
 * snapshot RPC it reads cannot return any.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const CONSOLE_URL = "https://onecare.you/admin";

interface Snapshot {
  movement: Record<string, number>;
  pulse: Record<string, number | string>;
  attention: Array<{ severity: string; title: string; detail: string | null }>;
}

function delta(current: number, previous: number): string {
  if (!previous) return current > 0 ? "new" : "no change";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "level with the day before";
  return `${pct > 0 ? "+" : ""}${pct}% on the day before`;
}

function render(snapshot: Snapshot, dateLabel: string): string {
  const m = snapshot.movement ?? {};
  const p = snapshot.pulse ?? {};
  const rows = [
    ["New accounts", m.signups ?? 0, delta(Number(m.signups ?? 0), Number(m.signups_previous ?? 0))],
    ["New tenants", m.tenants ?? 0, ""],
    ["Patient connections", m.connections ?? 0, ""],
    ["Documents stored", m.documents ?? 0, ""],
    ["Assistant conversations", m.assistant_conversations ?? 0, ""],
  ]
    .map(
      ([label, value, hint]) => `
      <tr>
        <td style="padding:8px 0;color:#334155;font-size:14px;">${label}</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#064E3B;font-size:14px;">${value}</td>
        <td style="padding:8px 0 8px 12px;color:#64748B;font-size:12px;">${hint}</td>
      </tr>`,
    )
    .join("");

  const attention = (snapshot.attention ?? []).slice(0, 10);
  const attentionHtml = attention.length
    ? attention
        .map(
          (a) => `
        <li style="margin-bottom:8px;color:#334155;font-size:14px;">
          <strong style="color:${a.severity === "critical" ? "#B91C1C" : "#064E3B"};">${a.title}</strong>
          ${a.detail ? `<br><span style="color:#64748B;font-size:12px;">${a.detail}</span>` : ""}
        </li>`,
        )
        .join("")
    : `<li style="color:#64748B;font-size:14px;">Nothing needs you this morning.</li>`;

  const broke = Number(p.sync_failures ?? 0) + Number(p.signin_partner_failures ?? 0);

  return `<!doctype html>
<html><body style="margin:0;background:#F8FAFC;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#064E3B;color:#ECFDF5;border-radius:16px;padding:20px 24px;">
      <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;">OneCare command centre</p>
      <h1 style="margin:6px 0 0;font-size:22px;">Your morning brief</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.8;">${dateLabel}</p>
    </div>

    <div style="background:#fff;border-radius:16px;padding:20px 24px;margin-top:16px;">
      <h2 style="margin:0 0 8px;font-size:16px;color:#0F172A;">Needs you (${attention.length})</h2>
      <ul style="margin:0;padding-left:18px;">${attentionHtml}</ul>
    </div>

    <div style="background:#fff;border-radius:16px;padding:20px 24px;margin-top:16px;">
      <h2 style="margin:0 0 8px;font-size:16px;color:#0F172A;">Last 24 hours</h2>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="margin:14px 0 0;font-size:13px;color:${broke > 0 ? "#B91C1C" : "#64748B"};">
        ${broke > 0
          ? `${broke} background failure${broke === 1 ? "" : "s"} in the last day — worth a look.`
          : "Nothing failed in the last day."}
      </p>
    </div>

    <p style="text-align:center;margin:20px 0;">
      <a href="${CONSOLE_URL}" style="background:#064E3B;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;">Open the command centre</a>
    </p>
    <p style="text-align:center;color:#94A3B8;font-size:11px;margin:0;">
      You receive this because you are a OneCare platform admin. Turn it off in the console.
    </p>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Cron, or an admin asking for their own copy.
  const caller = await requireServiceRoleOrAdmin(req, corsHeaders);
  if (caller instanceof Response) return caller;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    // A "send me one now" request always resolves to the calling admin, so it
    // can never be aimed at somebody else's inbox.
    const testFor: string | null = body?.test === true && caller.user ? caller.user.id : null;
    const hour = new Date().getUTCHours();
    const dateLabel = new Date().toUTCString().slice(0, 16);

    const { data: prefs, error: prefsError } = await supabase
      .from("admin_digest_preferences")
      .select("user_id, enabled, send_hour, last_sent_at");
    if (prefsError) throw prefsError;

    // Every platform admin is a recipient; a missing row means the default
    // (on, 07:00 UTC), so a new admin starts receiving it without any setup.
    const { data: admins, error: adminsError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (adminsError) throw adminsError;

    const prefFor = (id: string) => prefs?.find((p) => p.user_id === id);
    const today = new Date().toISOString().slice(0, 10);

    const recipients = (admins ?? [])
      .map((a) => a.user_id as string)
      .filter((id) => {
        if (testFor) return id === testFor;
        const pref = prefFor(id);
        if (pref && pref.enabled === false) return false;
        if ((pref?.send_hour ?? 7) !== hour) return false;
        if (pref?.last_sent_at && pref.last_sent_at.slice(0, 10) === today) return false;
        return true;
      });

    let sent = 0;
    for (const userId of recipients) {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (!email) continue;

      const { data: snapshot, error: snapError } = await supabase.rpc("admin_digest_snapshot", {
        _for_admin: userId,
      });
      if (snapError) {
        console.error("digest snapshot failed", snapError);
        continue;
      }

      if (!RESEND_API_KEY) {
        console.warn("RESEND_API_KEY missing — digest not delivered");
        continue;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "OneCare <hello@onecare.you>",
          to: [email],
          subject: `OneCare morning brief — ${dateLabel}`,
          html: render(snapshot as unknown as Snapshot, dateLabel),
        }),
      });

      if (!res.ok) {
        console.error("digest send failed", await res.text());
        continue;
      }
      sent += 1;

      if (!testFor) {
        await supabase
          .from("admin_digest_preferences")
          .upsert(
            { user_id: userId, last_sent_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
      }
    }

    return new Response(JSON.stringify({ sent, considered: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-admin-digest error", error);
    return new Response(JSON.stringify({ error: "Could not send the digest" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
