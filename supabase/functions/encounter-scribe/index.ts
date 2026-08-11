/**
 * Edge function: encounter-scribe
 *
 * Ambient clinical scribe. Takes visit audio already uploaded to the
 * clinician-dictations bucket plus an encounter id, transcribes the audio and
 * drafts a structured SOAP note. NOTHING is written onto the encounter's
 * clinical fields here — the draft lands in `scribe_draft` and the clinician
 * reviews, edits and signs in the UI.
 *
 * Auth: requires a JWT. Caller must own the encounter (clinician_user_id).
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

const SOAP_SYSTEM = `You are a clinical scribe drafting a visit note from a transcript of a real consultation.

Rules:
- Use ONLY what the transcript supports. Never invent findings, vitals, doses or diagnoses.
- If a section has no support in the transcript, return an empty string for it.
- Write in concise clinical prose or short bullet lines.
- Respond with JSON only, no markdown fences, matching exactly:
{
  "chief_complaint": string,
  "subjective": string,
  "objective": string,
  "assessment": string,
  "plan": string,
  "mentioned_vitals": [{ "type": string, "value": string, "note": string }],
  "mentioned_medications": [{ "name": string, "dose": string, "change": string }],
  "follow_up_in_days": number | null
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("AI gateway not configured");
    const body = await req.json().catch(() => ({}));
    const encounterId = typeof body.encounterId === "string" ? body.encounterId : "";
    const audioPath = typeof body.audioPath === "string" ? body.audioPath : "";
    if (!encounterId || !audioPath) return json({ error: "encounterId and audioPath are required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: enc, error: encErr } = await admin
      .from("encounters")
      .select("id, clinician_user_id, patient_user_id, status")
      .eq("id", encounterId)
      .single();
    if (encErr || !enc) return json({ error: "Encounter not found" }, 404);
    if (enc.clinician_user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (enc.status === "signed") return json({ error: "Encounter is already signed" }, 409);
    // Audio must live under the caller's own folder in the dictations bucket.
    if (!audioPath.startsWith(`${userId}/`)) return json({ error: "Forbidden" }, 403);

    const { data: file, error: dlErr } = await admin.storage
      .from("clinician-dictations")
      .download(audioPath);
    if (dlErr || !file) throw new Error(`Could not download audio: ${dlErr?.message}`);

    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength === 0) return json({ error: "Recording is empty" }, 400);
    const b64 = base64(buf);
    const format = audioPath.endsWith(".mp4") || audioPath.endsWith(".m4a") ? "m4a" : "webm";

    const transcript = await callGateway([
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe this clinical visit recording verbatim. Label speakers as Clinician: and Patient: when it is clear. Plain text only.",
          },
          { type: "input_audio", input_audio: { data: b64, format } },
        ],
      },
    ]);
    if (!transcript) throw new Error("Transcription returned nothing");

    const raw = await callGateway([
      { role: "system", content: SOAP_SYSTEM },
      { role: "user", content: transcript },
    ]);

    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    } catch {
      draft = { chief_complaint: "", subjective: transcript, objective: "", assessment: "", plan: "" };
    }

    const generatedAt = new Date().toISOString();
    const { error: upErr } = await admin
      .from("encounters")
      .update({
        scribe_transcript: transcript,
        scribe_audio_path: audioPath,
        scribe_draft: draft,
        scribe_generated_at: generatedAt,
      })
      .eq("id", encounterId);
    if (upErr) throw upErr;

    await admin.from("patient_action_log").insert({
      patient_user_id: enc.patient_user_id,
      clinician_user_id: userId,
      action: "scribe_draft_generated",
      summary: "Generated an AI scribe draft from visit audio (unsigned)",
      ref_table: "encounters",
      ref_id: encounterId,
    });

    return json({ transcript, draft, generatedAt });
  } catch (e) {
    console.error("encounter-scribe error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function base64(bytes: Uint8Array): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

async function callGateway(messages: unknown[]): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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
