/**
 * Edge function: clinician-ai-chat
 *
 * Clinician-facing assistant. Mirrors the patient assistant's
 * propose → clinician approves → apply → log architecture: this function NEVER
 * writes clinical data. It only returns proposed actions that the clinician
 * must approve in the UI, where they are executed under the clinician's own
 * session (so RLS applies) and written to the patient action log.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const VITAL_TYPES = [
  "weight", "blood_pressure", "heart_rate", "oxygen_saturation", "temperature",
  "glucose", "hba1c", "urea", "creatinine", "gfr", "cholesterol_total", "ldl",
  "hdl", "alt", "ast", "hemoglobin", "wbc", "potassium", "sodium",
];

const ACTION_BY_TOOL: Record<string, string> = {
  propose_send_message: "send_message",
  propose_create_guidance: "create_guidance",
  propose_set_alert_rule: "set_alert_rule",
};

const BASE_PROMPT = `You are the OneCare Clinical Assistant, working alongside a licensed clinician inside their OneCare workspace. Speak like a competent colleague: brief, concrete, no filler.

WHAT YOU DO
1. Answer questions about the clinician's own panel using the snapshot below (patients, recent vitals, open guidance, unread messages).
2. Draft work for the clinician: patient messages, care guidance, vital alert thresholds.
3. Help them navigate the workspace (route map below).

HOW TOOLS WORK (critical)
- Tools NEVER send or save anything. They queue a draft the clinician reviews and approves in the app.
- Never say something was sent, set, saved or created. Say "I've drafted this — approve it below and it will be sent/saved."
- Only treat something as done when a SYSTEM NOTE says the clinician approved it and it succeeded. If a SYSTEM NOTE says FAILED, say so plainly.
- Always pass patient_user_id exactly as it appears in the snapshot. If the patient is not in the snapshot, say you don't have access to them instead of guessing.
- For a cohort request ("all my hypertensive patients"), queue one action per patient so the clinician sees a per-patient preview, and only for patients in the snapshot.

CLINICAL BOUNDARIES
- No diagnosis, no prescribing, no dose changes, no treatment recommendations. You draft communication and monitoring settings only.
- Never invent readings, dates or history. The snapshot is the only source of truth.
- Flag red-flag values you can see (e.g. very high BP, low SpO2) but leave the clinical decision to the clinician.

ROUTE MAP:
- Today / triage inbox → /clinician/today
- Patients → /clinician/patients
- Messages → /clinician/messages
- Guidance → /clinician/guidance
- Alerts → /clinician/alerts
- Templates → /clinician/templates
- Dictations → /clinician/dictations
- Reports → /clinician/reports
- Practice → /clinician/practice
- Settings → /clinician/settings

To offer a navigation button, include [NAVIGATE:/path] anywhere in your reply.`;

const tools = [
  {
    type: "function",
    function: {
      name: "propose_send_message",
      description:
        "Draft a secure message to one of the clinician's patients. Queued for approval — nothing is sent until the clinician approves.",
      parameters: {
        type: "object",
        properties: {
          patient_user_id: { type: "string", description: "Exact patient id from the snapshot" },
          patient_name: { type: "string", description: "Patient name, for the approval preview" },
          body: { type: "string", description: "Message text, written in the clinician's voice" },
        },
        required: ["patient_user_id", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_guidance",
      description:
        "Draft a care instruction / guidance item for a patient. Queued for the clinician's approval.",
      parameters: {
        type: "object",
        properties: {
          patient_user_id: { type: "string" },
          patient_name: { type: "string" },
          title: { type: "string" },
          instruction: { type: "string" },
          category: { type: "string", description: "e.g. medication, lifestyle, monitoring, appointment" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          due_date: { type: "string", description: "YYYY-MM-DD, optional" },
        },
        required: ["patient_user_id", "title", "instruction"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_set_alert_rule",
      description:
        "Draft a vital threshold alert rule for a patient. Queued for the clinician's approval.",
      parameters: {
        type: "object",
        properties: {
          patient_user_id: { type: "string" },
          patient_name: { type: "string" },
          vital_type: { type: "string", enum: VITAL_TYPES },
          condition: { type: "string", enum: ["above", "below"] },
          threshold_value: { type: "number" },
          threshold_secondary: { type: "number", description: "Diastolic threshold, blood pressure only" },
        },
        required: ["patient_user_id", "vital_type", "condition", "threshold_value"],
        additionalProperties: false,
      },
    },
  },
];

async function callGateway(key: string, messages: unknown[], withTools: boolean) {
  return await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(withTools ? { tools, tool_choice: "auto" } : {}),
    }),
  });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) return json({ error: "AI service not configured" }, 503);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Clinician gate: must have a clinician profile.
    const { data: clinician } = await supabase
      .from("clinician_profiles")
      .select("user_id, first_name, last_name, title, practice_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!clinician) return json({ error: "Clinician access required" }, 403);

    const body = await req.json();
    const messages = body?.messages;
    const allowActions = body?.allowActions !== false;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }
    const recentMessages = messages.slice(-10);

    // ---- Snapshot: only patients this clinician actually has access to ----
    let snapshot = "";
    try {
      const { data: shares } = await supabase
        .from("provider_shares")
        .select("id, user_id, permissions, is_active, expires_at")
        .or(`clinician_user_id.eq.${user.id},provider_email.eq.${user.email ?? ""}`)
        .eq("is_active", true)
        .limit(40);

      const patientIds = [...new Set((shares ?? []).map((s: any) => s.user_id))];

      let names = new Map<string, string>();
      if (patientIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name, email")
          .in("user_id", patientIds);
        names = new Map((profiles ?? []).map((p: any) => [p.user_id, p.name || p.email || "Patient"]));
      }

      const [{ data: vitals }, { data: guidance }, { data: unread }] = await Promise.all([
        patientIds.length
          ? supabase
              .from("vitals")
              .select("user_id, type, value, secondary_value, unit, recorded_at")
              .in("user_id", patientIds)
              .order("recorded_at", { ascending: false })
              .limit(60)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("clinician_guidance")
          .select("patient_user_id, title, status, due_date")
          .eq("clinician_user_id", user.id)
          .in("status", ["sent", "acknowledged"])
          .limit(40),
        supabase
          .from("messages")
          .select("patient_user_id, body, created_at, sender_user_id, read_at")
          .eq("clinician_user_id", user.id)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const patientLines = patientIds
        .map((id) => `- ${names.get(id) ?? "Patient"} — patient_user_id: ${id}`)
        .join("\n");

      const vitalLines = (vitals ?? [])
        .map(
          (v: any) =>
            `- ${names.get(v.user_id) ?? "Patient"}: ${v.type} ${v.value}${v.secondary_value ? `/${v.secondary_value}` : ""} ${v.unit ?? ""} on ${String(v.recorded_at).slice(0, 16).replace("T", " ")}`,
        )
        .join("\n");

      const guidanceLines = (guidance ?? [])
        .map(
          (g: any) =>
            `- ${names.get(g.patient_user_id) ?? "Patient"}: "${g.title}" (${g.status}${g.due_date ? `, due ${g.due_date}` : ""})`,
        )
        .join("\n");

      const unreadLines = (unread ?? [])
        .filter((m: any) => m.sender_user_id !== user.id)
        .map(
          (m: any) =>
            `- ${names.get(m.patient_user_id) ?? "Patient"}: ${String(m.body).slice(0, 120)} (${String(m.created_at).slice(0, 16).replace("T", " ")})`,
        )
        .join("\n");

      snapshot = `

=== YOUR PANEL (only these patients are in scope) ===
${patientLines || "(no connected patients yet)"}

=== RECENT VITALS ACROSS THE PANEL (latest 60) ===
${vitalLines || "(none recorded)"}

=== OPEN GUIDANCE YOU SENT ===
${guidanceLines || "(none open)"}

=== UNREAD PATIENT MESSAGES ===
${unreadLines || "(none)"}`;
    } catch (e) {
      console.warn("clinician snapshot failed", e);
    }

    const convo: any[] = [
      { role: "system", content: BASE_PROMPT + snapshot },
      ...recentMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const first = await callGateway(lovableApiKey, convo, allowActions);
    if (!first.ok) {
      const text = await first.text();
      console.error("gateway error", first.status, text);
      if (first.status === 429) return json({ error: "Too many requests right now — try again shortly." }, 429);
      if (first.status === 402) return json({ error: "AI service temporarily unavailable." }, 402);
      return json({ error: "Failed to get AI response" }, 500);
    }

    const data = await first.json();
    let message = data.choices?.[0]?.message ?? {};
    const toolCalls = message.tool_calls ?? [];
    const proposedActions: Array<{ id: string; type: string; params: Record<string, unknown> }> = [];

    if (allowActions && toolCalls.length > 0) {
      const toolResults: any[] = [];
      for (const call of toolCalls) {
        const actionType = ACTION_BY_TOOL[call.function?.name];
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(call.function?.arguments || "{}");
        } catch {
          params = {};
        }
        if (actionType) proposedActions.push({ id: crypto.randomUUID(), type: actionType, params });
        toolResults.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            actionType
              ? { queued: true, note: "Awaiting the clinician's approval. Nothing sent or saved yet." }
              : { queued: false, note: "Unknown tool" },
          ),
        });
      }

      const followUp = await callGateway(lovableApiKey, [...convo, message, ...toolResults], false);
      if (followUp.ok) {
        const followData = await followUp.json();
        const followMessage = followData.choices?.[0]?.message;
        if (followMessage?.content) message = followMessage;
      }
    }

    const content: string =
      message.content ||
      (proposedActions.length > 0
        ? "I've drafted the items below — review them and approve when they look right."
        : "I couldn't generate a response. Please try again.");

    const routeMatch = content.match(/\[NAVIGATE:(\/[^\]]+)\]/);
    return json({
      content: content.replace(/\[NAVIGATE:\/[^\]]+\]/g, "").trim(),
      suggestedRoute: routeMatch ? routeMatch[1] : null,
      proposedActions,
    });
  } catch (error) {
    console.error("clinician-ai-chat error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
