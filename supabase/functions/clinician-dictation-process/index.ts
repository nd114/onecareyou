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

  // Held outside the try so a failure can be recorded against the right row.
  let dictationId: string | null = null;

  try {
    if (!LOVABLE_API_KEY) throw new Error("AI gateway not configured");
    ({ dictationId } = await req.json());
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
    const b64 = toBase64(buf);
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

    // Pull out the parts of the dictation that belong somewhere in particular.
    // Nothing here is written to a patient's record by this function; it only
    // proposes, and the clinician ticks each item in the filing dialog. That
    // split is deliberate — a misheard "one twenty over eighty" must never
    // reach a chart because a model was confident.
    const extracted = await extractStructured(transcript);

    await admin
      .from("clinician_dictations")
      .update({
        transcript,
        summary,
        status: "transcribed",
        metadata: { ...(row.metadata ?? {}), extracted },
      })
      .eq("id", dictationId);

    return json({ transcript, summary, extracted });
  } catch (e) {
    console.error("clinician-dictation-process error", e);
    // Leave a trace on the row itself. Without this a failed run left the
    // dictation sitting in its previous status with nothing explaining why no
    // transcript ever appeared.
    try {
      if (dictationId) {
        await createClient(SUPABASE_URL, SERVICE_KEY)
          .from("clinician_dictations")
          .update({
            status: "error",
            error_message: e instanceof Error ? e.message : "Unknown error",
          })
          .eq("id", dictationId);
      }
    } catch {
      /* best effort — never mask the original error */
    }
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

/**
 * The dictation, split into the things a record has slots for.
 *
 * Every item carries the phrase it came from, so the clinician reviewing it is
 * checking a claim against the words rather than trusting a number on its own.
 * A parse failure is not fatal: the transcript and summary are the deliverable,
 * and an empty extraction just means nothing is pre-ticked.
 */
async function extractStructured(transcript: string): Promise<Extracted> {
  const empty: Extracted = { vitals: [], guidance: [], note: null, soap: null };
  if (!transcript.trim()) return empty;

  try {
    const raw = await callGateway([
      {
        role: "system",
        content: [
          "Extract structured items from a clinical dictation. Reply with JSON only, no prose, no code fence.",
          "Shape:",
          '{"vitals":[{"type":"blood_pressure|heart_rate|weight|temperature|blood_glucose|oxygen_saturation",',
          '"value":number,"secondary_value":number|null,"unit":string,"source_phrase":string}],',
          '"guidance":[{"title":string,"instruction":string,"source_phrase":string}],',
          '"note":string|null,',
          '"soap":{"chief_complaint":string|null,"subjective":string|null,"objective":string|null,',
          '"assessment":string|null,"plan":string|null,"follow_up_in_days":number|null}}',
          "",
          "Rules. Include a vital ONLY if a number was actually said; never infer or normalise one that was not.",
          "source_phrase must be copied verbatim from the transcript.",
          "guidance is instructions addressed to the patient, in plain language.",
          "note is anything for the care team that is not guidance and not a vital.",
          "Use null and empty arrays freely. Do not invent anything.",
        ].join("\n"),
      },
      { role: "user", content: transcript },
    ]);

    // Models fence JSON despite being asked not to.
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<Extracted>;
    return {
      vitals: Array.isArray(parsed.vitals) ? parsed.vitals.slice(0, 12) : [],
      guidance: Array.isArray(parsed.guidance) ? parsed.guidance.slice(0, 12) : [],
      note: typeof parsed.note === "string" ? parsed.note : null,
      soap: parsed.soap && typeof parsed.soap === "object" ? parsed.soap : null,
    };
  } catch (e) {
    console.error("dictation extraction failed", e);
    return empty;
  }
}

interface Extracted {
  vitals: {
    type: string;
    value: number;
    secondary_value: number | null;
    unit: string;
    source_phrase: string;
  }[];
  guidance: { title: string; instruction: string; source_phrase: string }[];
  note: string | null;
  soap: Record<string, unknown> | null;
}

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

/**
 * Base64-encode audio without blowing the stack.
 *
 * This was `btoa(String.fromCharCode(...buf))`, which spreads every byte of the
 * recording as a separate function argument. A minute of audio is hundreds of
 * thousands of bytes, well past V8's argument limit, so the call threw
 * RangeError: Maximum call stack size exceeded and transcription failed for
 * every dictation longer than a second or two. Chunking keeps each spread small
 * enough to be safe at any recording length.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
