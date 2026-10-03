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
 *
 * Usage is recorded (log only, nothing is limited) in scribe_usage after a
 * successful draft. The client may send `requestId`; a repeat of the same
 * requestId for the same encounter returns the stored draft and records
 * nothing, so a retry neither re-spends gateway cost nor double-counts
 * minutes. Without a requestId the server makes one up, so retries cannot be
 * detected for that call.
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
 * Every style writes into the same five fields so the note editor, the signing
 * rules and the audit trail stay exactly as they were — only the voice of the
 * writing changes.
 */
const STYLE_GUIDES: Record<string, string> = {
  soap: "Write a classic SOAP note: concise clinical prose or short bullet lines per section.",
  narrative:
    "Write a flowing narrative consultation note in full sentences. Put the story of the visit in subjective, examination findings in objective, your impression in assessment and what happens next in plan.",
  referral:
    "Write a referral letter to a specialist colleague. Subjective carries the history and reason for referral, objective the findings, assessment the working diagnosis, plan the specific question you are asking of them and what you have already done.",
  discharge:
    "Write a discharge summary for the patient and their next clinician. Subjective covers why they came, objective the course and findings, assessment the final diagnoses, plan the discharge medicines, follow-up and warning signs to return for.",
};

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
    const noteStyle = typeof body.noteStyle === "string" && body.noteStyle in STYLE_GUIDES
      ? body.noteStyle
      : "soap";
    // The browser may already have the words from live transcription. Reusing
    // them keeps the draft quick and avoids paying to transcribe twice.
    const liveTranscript = typeof body.liveTranscript === "string" ? body.liveTranscript.trim() : "";
    const clientRequestId = typeof body.requestId === "string" && body.requestId.length > 0 &&
        body.requestId.length <= 100
      ? body.requestId
      : "";
    const clientDuration = typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.max(0, Math.min(86400, Math.round(body.durationSeconds)))
      : null;
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
      .select("id, clinician_user_id, patient_user_id, status, practice_id, author_departed_at")
      .eq("id", encounterId)
      .single();
    if (encErr || !enc) return json({ error: "Encounter not found" }, 404);
    if (enc.clinician_user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (enc.status === "signed") return json({ error: "Encounter is already signed" }, 409);
    // This function writes with the service role, so the row policies that
    // stop an author who has lost the patient (a share ended, a departure, or
    // an account that was never a clinician) do not apply to it. Ask the same
    // question "Authors update own encounters" asks, as the caller.
    if (enc.author_departed_at) return json({ error: "This note is held for the practice to resolve" }, 409);
    const { data: canWrite, error: accessErr } = await userClient.rpc("has_current_clinical_access", {
      _patient_user_id: enc.patient_user_id,
      _practice_id: enc.practice_id ?? null,
    });
    if (accessErr) throw accessErr;
    if (!canWrite) return json({ error: "You no longer have access to this patient's record" }, 403);
    // Audio must live under the caller's own folder in the dictations bucket.
    if (!audioPath.startsWith(`${userId}/`)) return json({ error: "Forbidden" }, 403);

    // Idempotency: scoped to the encounter so an id cannot surface another
    // encounter's draft. Only a request that already recorded usage (so one
    // that finished) is replayed.
    const usageRequestId = `encounter:${encounterId}:${clientRequestId || crypto.randomUUID()}`;
    if (clientRequestId) {
      const { data: prior } = await admin
        .from("scribe_usage")
        .select("audio_seconds, billed_minutes")
        .eq("request_id", usageRequestId)
        .eq("user_id", userId)
        .maybeSingle();
      if (prior) {
        const { data: done } = await admin
          .from("encounters")
          .select("scribe_transcript, scribe_draft, scribe_generated_at")
          .eq("id", encounterId)
          .single();
        if (done?.scribe_draft) {
          return json({
            transcript: done.scribe_transcript,
            draft: done.scribe_draft,
            generatedAt: done.scribe_generated_at,
            noteStyle,
            usage: { audioSeconds: prior.audio_seconds, billedMinutes: prior.billed_minutes, repeated: true },
          });
        }
      }
    }

    const { data: file, error: dlErr } = await admin.storage
      .from("clinician-dictations")
      .download(audioPath);
    if (dlErr || !file) throw new Error(`Could not download audio: ${dlErr?.message}`);

    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength === 0) return json({ error: "Recording is empty" }, 400);
    const b64 = base64(buf);
    const format = audioPath.endsWith(".wav")
      ? "wav"
      : audioPath.endsWith(".mp4") || audioPath.endsWith(".m4a")
        ? "m4a"
        : "webm";

    const transcript = liveTranscript || await callGateway([
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
      { role: "system", content: `${SOAP_SYSTEM}\n\nStyle: ${STYLE_GUIDES[noteStyle]}` },
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
      summary: `Generated an AI scribe draft from visit audio (${noteStyle}, unsigned)`,
      ref_table: "encounters",
      ref_id: encounterId,
    });

    // Log only. A failure to count must never fail a note that already exists.
    let usage: { audioSeconds: number; billedMinutes: number } | undefined;
    try {
      const seconds = wavSeconds(buf) ?? clientDuration ?? 0;
      const { data: rec, error: usageErr } = await admin.rpc("record_scribe_usage", {
        _user_id: userId,
        _practice_id: enc.practice_id ?? null,
        _kind: "encounter",
        _audio_seconds: seconds,
        _request_id: usageRequestId,
      });
      if (usageErr) throw usageErr;
      const r = Array.isArray(rec) ? rec[0] : rec;
      if (r) usage = { audioSeconds: r.audio_seconds, billedMinutes: r.billed_minutes };
    } catch (usageErr) {
      console.error("encounter-scribe usage not recorded", usageErr);
    }

    return json({ transcript, draft, generatedAt, noteStyle, ...(usage ? { usage } : {}) });
  } catch (e) {
    console.error("encounter-scribe error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

/** Seconds of audio in a canonical PCM WAV, read from its own header; null if not a WAV. */
function wavSeconds(b: Uint8Array): number | null {
  if (b.byteLength < 44) return null;
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12;
  let byteRate = 0;
  while (o + 8 <= b.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(o + 16, true);
    if (id === "data") {
      const bytes = Math.min(size, b.byteLength - (o + 8));
      return byteRate > 0 ? Math.round(bytes / byteRate) : null;
    }
    o += 8 + size + (size % 2);
  }
  return null;
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
