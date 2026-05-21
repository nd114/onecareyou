/**
 * Edge function: clinician-dictation-process
 *
 * Takes a clinician-uploaded audio file (storage path in clinician-dictations
 * bucket) and produces transcript + clinical summary. The clinician MUST
 * approve transcript and summary in the UI before the row is considered
 * filed; this function only does the AI work and writes results back to
 * the row.
 *
 * Auth: requires JWT. Caller must own the dictation row (clinician_user_id).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("AI gateway not configured");
    const { dictationId } = await req.json();
    if (!dictationId) return json({ error: "dictationId required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row, error } = await admin
      .from("clinician_dictations")
      .select("*")
      .eq("id", dictationId)
      .single();
    if (error || !row) return json({ error: "Not found" }, 404);
    if (row.clinician_user_id !== userData.user.id) return json({ error: "Forbidden" }, 403);

    // Download audio
    const { data: file, error: dlErr } = await admin.storage
      .from("clinician-dictations")
      .download(row.audio_path);
    if (dlErr || !file) throw new Error(`Could not download audio: ${dlErr?.message}`);

    const buf = new Uint8Array(await file.arrayBuffer());
    const b64 = btoa(String.fromCharCode(...buf));
    const format = (row.audio_path as string).endsWith(".mp4") ? "mp4" : "webm";

    // Transcribe
    const transcript = await callGateway([
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this clinical dictation verbatim. Plain text only." },
          { type: "input_audio", input_audio: { data: b64, format } },
        ],
      },
    ]);

    // Summarize
    const summary = await callGateway([
      {
        role: "system",
        content:
          "You are a clinical scribe. Summarize this dictation as a concise SOAP-style note. Use bullet points. Do NOT invent facts. End with a one-line 'Action items' list. Keep under 250 words.",
      },
      { role: "user", content: transcript },
    ]);

    await admin
      .from("clinician_dictations")
      .update({
        transcript,
        summary,
        status: "transcribed",
      })
      .eq("id", dictationId);

    return json({ transcript, summary });
  } catch (e) {
    console.error("clinician-dictation-process error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function callGateway(messages: unknown[]): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gateway ${res.status}: ${t}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
