/**
 * Edge function: transcribe-recording
 *
 * Turns a patient's own recording of an appointment into text.
 *
 * This is the one step in the feature where audio leaves the patient's
 * storage, so the checks here are the checks that matter:
 *
 *   - the caller must own the recording;
 *   - the audio must live under the caller's own folder in the bucket, which
 *     is checked against the path rather than trusted from the request;
 *   - the patient must have turned on AI processing, because that is the
 *     switch that says a third party may be given their content.
 *
 * Nothing is written to the clinical record. The transcript goes back on the
 * recording row and nowhere else.
 *
 * Auth: requires a JWT (verify_jwt defaults to true).
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

/**
 * The audio is base64'd into a JSON request, which is roughly a third bigger
 * than the file. Past this the gateway starts rejecting the body, and a clear
 * "too long" beats a 30-second wait ending in an opaque failure.
 *
 * 20 MB of Opus is several hours of speech, so this is a guard rail rather
 * than a limit anyone will meet in a consultation.
 */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const TRANSCRIBE_PROMPT =
  "Transcribe this recording of a medical appointment verbatim into plain text. " +
  "Label speakers as Clinician: and Patient: when it is clear who is talking, and leave them " +
  "unlabelled when it is not. Do not summarise, correct, or add anything that was not said. " +
  "If a passage is inaudible write [inaudible] rather than guessing — a guessed drug name or " +
  "dose is worse than a gap.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let recordingId = "";

  try {
    if (!LOVABLE_API_KEY) throw new Error("Transcription is not configured");

    const body = await req.json().catch(() => ({}));
    recordingId = typeof body.recordingId === "string" ? body.recordingId : "";
    if (!recordingId) return json({ error: "recordingId is required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { data: recording, error: recErr } = await admin
      .from("patient_recordings")
      .select("id, user_id, audio_document_id, title")
      .eq("id", recordingId)
      .single();
    if (recErr || !recording) return json({ error: "Recording not found" }, 404);
    if (recording.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (!recording.audio_document_id) return json({ error: "That recording has no audio" }, 400);

    // Sending someone's consultation to a third party is exactly what this
    // switch governs. Refuse rather than ask forgiveness.
    const { data: profile } = await admin
      .from("profiles")
      .select("ai_processing_consent")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.ai_processing_consent) {
      return json(
        {
          error:
            "Transcribing sends the audio to a transcription service. Turn on AI processing in " +
            "Settings first if you want that.",
        },
        403,
      );
    }

    const { data: doc, error: docErr } = await admin
      .from("health_documents")
      .select("file_path, mime_type, file_size, user_id")
      .eq("id", recording.audio_document_id)
      .single();
    if (docErr || !doc) return json({ error: "The audio file is missing" }, 404);
    // Belt and braces: the row says who owns it, the path says where it lives,
    // and both have to agree with the caller.
    if (doc.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (!doc.file_path.startsWith(`${userId}/`)) return json({ error: "Forbidden" }, 403);

    await admin
      .from("patient_recordings")
      .update({ transcript_status: "pending" })
      .eq("id", recordingId);

    const { data: file, error: dlErr } = await admin.storage
      .from("health-documents")
      .download(doc.file_path);
    if (dlErr || !file) throw new Error(`Could not read the audio: ${dlErr?.message ?? "not found"}`);

    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength === 0) {
      await markFailed(admin, recordingId);
      return json({ error: "That recording is empty" }, 400);
    }
    if (buf.byteLength > MAX_AUDIO_BYTES) {
      await markFailed(admin, recordingId);
      return json(
        { error: "That recording is too long to transcribe in one go. You can still play and download it." },
        413,
      );
    }

    const transcript = await callGateway([
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_PROMPT },
          {
            type: "input_audio",
            input_audio: { data: base64(buf), format: formatFor(doc.file_path, doc.mime_type) },
          },
        ],
      },
    ]);

    if (!transcript) {
      await markFailed(admin, recordingId);
      // 'ready' with nothing in it would be a failure wearing the wrong label,
      // and the patient would trust it. The table refuses that too.
      return json({ error: "Nothing could be made out in that recording" }, 422);
    }

    const { error: upErr } = await admin
      .from("patient_recordings")
      .update({ transcript, transcript_status: "ready" })
      .eq("id", recordingId);
    if (upErr) throw upErr;

    return json({ transcript });
  } catch (e) {
    console.error("transcribe-recording error", e);
    if (recordingId) await markFailed(admin, recordingId).catch(() => {});
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function markFailed(admin: ReturnType<typeof createClient>, recordingId: string) {
  await admin
    .from("patient_recordings")
    .update({ transcript_status: "failed" })
    .eq("id", recordingId);
}

/** What the gateway calls the container, which is not always what we called the file. */
function formatFor(path: string, mime: string | null): string {
  const hay = `${path} ${mime ?? ""}`.toLowerCase();
  if (hay.includes("mp4") || hay.includes("m4a")) return "m4a";
  if (hay.includes("ogg")) return "ogg";
  if (hay.includes("wav")) return "wav";
  return "webm";
}

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
    throw new Error(`Transcription service returned ${res.status}: ${t.slice(0, 300)}`);
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
