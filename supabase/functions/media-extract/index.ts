/**
 * Edge function: media-extract
 *
 * Handles two Simple Mode inputs:
 *  - mode: "voice"  → transcribes audio (base64) to text via Lovable AI Gateway
 *  - mode: "image"  → extracts structured candidate (medication or vital)
 *                     from a photo and returns transcript + structured JSON
 *
 * Returns plain text (transcript) or JSON ({ transcript, extracted }).
 * Caller is responsible for storing audio/image in private buckets and
 * passing the base64 payload here. Nothing is persisted server-side — the
 * client decides whether to save the resulting suggestion to the patient
 * record after confirmation.
 *
 * Auth: requires a valid JWT (verify_jwt = true is default).
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ExtractRequest {
  mode: "voice" | "image";
  // base64 (no data: prefix)
  data: string;
  mimeType: string;
  // optional context — e.g. "patient is logging a vital" vs medication
  intent?: "medication" | "vital" | "note" | "auto";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("AI gateway not configured");
    const body = (await req.json()) as ExtractRequest;
    if (!body?.data || !body?.mimeType) {
      return json({ error: "data and mimeType required" }, 400);
    }

    if (body.mode === "voice") {
      const transcript = await transcribe(body.data, body.mimeType);
      return json({ transcript });
    }

    if (body.mode === "image") {
      const result = await extractFromImage(body.data, body.mimeType, body.intent ?? "auto");
      return json(result);
    }

    return json({ error: "unknown mode" }, 400);
  } catch (e) {
    console.error("media-extract error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function transcribe(b64: string, mime: string): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this audio verbatim into plain text. No commentary." },
            { type: "input_audio", input_audio: { data: b64, format: mime.includes("mp4") ? "mp4" : "webm" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Transcription failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function extractFromImage(b64: string, mime: string, intent: string) {
  const sys = `You read a single photo a patient just took of either (a) a medication label/pill bottle or (b) a vitals device readout (blood pressure cuff, glucometer, thermometer, scale). Return ONLY JSON:
{
  "kind": "medication" | "vital" | "unknown",
  "transcript": "<plain text of what you see>",
  "medication"?: { "name": string, "dose"?: string, "frequency"?: string, "notes"?: string },
  "vital"?: { "type": "blood_pressure"|"glucose"|"heart_rate"|"temperature"|"weight"|"spo2", "value": string, "unit": string }
}
Do not invent values. If unsure, kind = "unknown" and explain in transcript. Intent hint: ${intent}.`;
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract from this photo." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Image extract failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(text);
    return { extracted: parsed, transcript: parsed.transcript ?? "" };
  } catch {
    return { extracted: { kind: "unknown", transcript: text }, transcript: text };
  }
}
