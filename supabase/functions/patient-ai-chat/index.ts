import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VITAL_TYPES = [
  "weight", "blood_pressure", "heart_rate", "oxygen_saturation", "temperature",
  "glucose", "hba1c", "urea", "creatinine", "gfr", "cholesterol_total", "ldl",
  "hdl", "alt", "ast", "hemoglobin", "wbc", "potassium", "sodium",
];

const BASE_SYSTEM_PROMPT = `You are OneCare Assistant — a warm, practical companion inside the OneCare health platform. Talk like a helpful person, not a policy document. Short paragraphs, plain language, no lecturing.

WHAT YOU CAN DO
1. Answer questions about the user's own record (medications, recent vitals, today's doses) using the snapshot below.
2. Explain general health concepts and what a drug class generally does.
3. Help the user get around the app (route map below).
4. ACT ON THE USER'S BEHALF by proposing changes with the tools below. Tools never save anything — they queue a proposal that the user reviews and approves in the app. Only after they tap Approve does anything get written.

HOW TO USE THE TOOLS
- If the user says something that clearly implies a change ("BP was 128 over 80 this morning", "add metformin 500mg twice a day", "I took my morning dose"), call the matching tool right away instead of telling them where to click. Then say in one line what you have PREPARED for approval.
- Batch related changes into several tool calls in the same turn.
- If a detail you need is genuinely missing or ambiguous (which medication, which value), ask one short question and call NO tools that turn.
- Never invent values, dates or medications. Use exactly what the user told you.
- Reference medications by the exact name shown in the snapshot when the user is talking about an existing one.

TRUTHFULNESS ABOUT CHANGES (critical — never break these)
- A tool call changes NOTHING. Never say a change is done, made, updated, saved, set, removed or "is now …". Say "I've prepared this change — tap Approve below and it will be saved."
- Only describe a change as saved when a SYSTEM NOTE in the conversation says the user approved it and it succeeded. If a SYSTEM NOTE says it FAILED, tell the user plainly that it didn't save and what to do instead — never claim success.
- If the user corrects a proposal you already made, propose the corrected version and say the earlier one still needs approval (or was replaced) — don't imply either was applied.
- Never claim the schedule or medication list "now" shows something; the snapshot is the only source of truth for current state.
- If the medication or vital the user refers to is not in the snapshot, say so and ask, instead of proposing a change against a name you can't see.


BOUNDARIES (state them once, briefly, only when relevant)
- You are not a doctor: no diagnosing, no prescribing, no dose changes, no treatment recommendations. If asked, point them to their prescriber.
- Never propose adding or changing a medication that the user did not explicitly ask for. Recording what a prescriber already told them is fine.
- Red-flag symptoms (chest pain, stroke signs, severe bleeding, suicidal thoughts): tell them to call emergency services now, and skip everything else.

PLATFORM ROUTE MAP:
- Medications → /medications
- Vitals / health metrics → /vitals
- Today's schedule → /schedule
- Care Circle / share with doctor → /care-circle
- Settings → /settings
- Pricing / upgrade → /pricing
- Knowledge Base → /knowledge-base
- Medication info library → /medication-info
- Health Vault / documents → /health-vault
- Family dashboard → /family
- Adherence report → /adherence-report
- Messages with your care team → /messages

To offer a navigation button, include [NAVIGATE:/path] anywhere in your reply.

When your reply contains clinical information (not for pure navigation, small talk, or confirming a queued action), end with:
"⚠️ General information, not medical advice — check with your healthcare provider."`;

const tools = [
  {
    type: "function",
    function: {
      name: "propose_log_vital",
      description:
        "Queue a vital reading for the user to approve. Nothing is saved until they approve. For blood_pressure put systolic in value and diastolic in secondary_value.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: VITAL_TYPES },
          value: { type: "number", description: "Primary reading (systolic for blood pressure)" },
          secondary_value: { type: "number", description: "Diastolic, blood pressure only" },
          notes: { type: "string" },
          recorded_at: { type: "string", description: "ISO timestamp; omit for now" },
        },
        required: ["type", "value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_add_medication",
      description:
        "Queue a new medication for the user to approve. Only use what the user explicitly stated — never invent a drug, dose or schedule.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          dosage: { type: "string", description: "e.g. 500mg" },
          frequency: { type: "string", description: "e.g. Twice daily" },
          times_of_day: {
            type: "array",
            items: { type: "string" },
            description: "24h HH:MM times, e.g. [\"08:00\",\"20:00\"]",
          },
          instructions: { type: "string" },
        },
        required: ["name", "dosage", "frequency"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_mark_dose_taken",
      description:
        "Queue marking one of today's pending doses as taken. Use the exact medication name from the snapshot.",
      parameters: {
        type: "object",
        properties: {
          medication_name: { type: "string" },
          scheduled_time: { type: "string", description: "HH:MM of the dose, if the user named one" },
        },
        required: ["medication_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_medication_times",
      description:
        "Queue a change to the reminder times of an existing medication (timing of reminders only — never the dose).",
      parameters: {
        type: "object",
        properties: {
          medication_name: { type: "string" },
          times_of_day: { type: "array", items: { type: "string" }, description: "24h HH:MM times" },
        },
        required: ["medication_name", "times_of_day"],
        additionalProperties: false,
      },
    },
  },
];

const ACTION_BY_TOOL: Record<string, string> = {
  propose_log_vital: "log_vital",
  propose_add_medication: "add_medication",
  propose_mark_dose_taken: "mark_dose_taken",
  propose_update_medication_times: "update_medication_times",
};

async function callGateway(apiKey: string, messages: unknown[], withTools: boolean) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      ...(withTools ? { tools, tool_choice: "auto" } : {}),
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("ai_processing_consent")
      .eq("user_id", user.id)
      .single();

    if (!profile?.ai_processing_consent) {
      return new Response(
        JSON.stringify({ error: "AI consent required. Please enable AI processing in Settings." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const messages = body?.messages;
    // Read-only surfaces (e.g. Simple Mode) can opt out of action proposals.
    const allowActions = body?.allowActions !== false;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recentMessages = messages.slice(-10);

    // ---- Build a compact snapshot of the user's own record ----
    let snapshot = "";
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const [{ data: meds }, { data: vitals }, { data: entries }] = await Promise.all([
        supabase
          .from("medications")
          .select("id, name, dosage, frequency, times_of_day")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .is("family_member_id", null)
          .limit(20),
        supabase
          .from("vitals")
          .select("type, value, secondary_value, unit, recorded_at")
          .eq("user_id", user.id)
          .is("family_member_id", null)
          .order("recorded_at", { ascending: false })
          .limit(12),
        supabase
          .from("schedule_entries")
          .select("id, status, scheduled_time, medication_id")
          .eq("user_id", user.id)
          .gte("scheduled_time", todayStart.toISOString())
          .lt("scheduled_time", todayEnd.toISOString())
          .limit(30),
      ]);

      const medById = new Map((meds ?? []).map((m: any) => [m.id, m.name]));

      const medList = (meds ?? [])
        .map((m: any) => {
          const times = Array.isArray(m.times_of_day) ? m.times_of_day.join(", ") : "";
          return `- ${m.name}${m.dosage ? ` ${m.dosage}` : ""}${m.frequency ? ` (${m.frequency})` : ""}${times ? ` at ${times}` : ""}`;
        })
        .join("\n");

      const vitalList = (vitals ?? [])
        .map((v: any) =>
          `- ${v.type}: ${v.value}${v.secondary_value ? `/${v.secondary_value}` : ""} ${v.unit ?? ""} on ${String(v.recorded_at).slice(0, 16).replace("T", " ")}`
        )
        .join("\n");

      const doseList = (entries ?? [])
        .map((e: any) =>
          `- ${medById.get(e.medication_id) ?? "medication"} at ${String(e.scheduled_time).slice(11, 16)} → ${e.status}`
        )
        .join("\n");

      snapshot = `

=== ACTIVE MEDICATIONS (context only — never advise dose changes) ===
${medList || "(none on record)"}

=== RECENT VITALS (latest 12) ===
${vitalList || "(none on record)"}

=== TODAY'S DOSES ===
${doseList || "(nothing scheduled today)"}`;
    } catch (e) {
      console.warn("snapshot fetch failed", e);
    }

    const systemPrompt = BASE_SYSTEM_PROMPT + snapshot;
    const convo: any[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    let aiResponse = await callGateway(lovableApiKey, convo, allowActions);

    const gatewayFailure = (status: number) => {
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "I'm receiving too many requests right now. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily unavailable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Failed to get AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    if (!aiResponse.ok) {
      console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      return gatewayFailure(aiResponse.status);
    }

    let aiData = await aiResponse.json();
    let message = aiData.choices?.[0]?.message ?? {};

    // ---- Collect proposed actions (nothing is written server-side) ----
    const proposedActions: Array<{ id: string; type: string; params: Record<string, unknown> }> = [];
    const toolCalls = message.tool_calls ?? [];

    if (allowActions && toolCalls.length > 0) {
      const toolResults: any[] = [];
      for (const call of toolCalls) {
        const name = call.function?.name;
        const actionType = ACTION_BY_TOOL[name];
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(call.function?.arguments || "{}");
        } catch {
          params = {};
        }
        if (actionType) {
          proposedActions.push({ id: crypto.randomUUID(), type: actionType, params });
        }
        toolResults.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            actionType
              ? { queued: true, note: "Awaiting the user's approval in the app. Nothing saved yet." }
              : { queued: false, note: "Unknown tool" }
          ),
        });
      }

      // Second pass: let the model summarise what it queued.
      const followUp = await callGateway(
        lovableApiKey,
        [...convo, message, ...toolResults],
        false
      );
      if (followUp.ok) {
        const followData = await followUp.json();
        const followMessage = followData.choices?.[0]?.message;
        if (followMessage?.content) message = followMessage;
      } else {
        console.error("AI gateway follow-up error:", followUp.status, await followUp.text());
      }
    }

    let content: string =
      message.content ||
      (proposedActions.length > 0
        ? "I've prepared the change below — review it and tap Approve when it looks right."
        : "I'm sorry, I couldn't generate a response. Please try again.");

    const routeMatch = content.match(/\[NAVIGATE:(\/[^\]]+)\]/);
    const suggestedRoute = routeMatch ? routeMatch[1] : null;
    const cleanContent = content.replace(/\[NAVIGATE:\/[^\]]+\]/g, "").trim();

    return new Response(
      JSON.stringify({ content: cleanContent, suggestedRoute, proposedActions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
