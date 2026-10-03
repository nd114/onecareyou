/**
 * Edge function: voice-memo-process
 *
 * A clinician's own dictated note. The browser has uploaded a WAV to
 * clinician-dictations/<uid>/memos/<id>.wav and created the voice_memos row;
 * this transcribes it. If a patient is assigned AND the clinician's access to
 * that patient is current (checked as the caller, because
 * has_current_clinical_access reads auth.uid()), it also drafts a SOAP-style
 * note. Otherwise transcript only.
 *
 * Writes only the voice_memos row. Never touches encounters. Logs ids and
 * status codes only, never transcript text or patient ids.
 *
 * Auth: JWT, caller must own the memo. Idempotent per memo id: a memo that is
 * already transcribed returns what is stored, and usage is recorded once
 * (scribe_usage kind 'memo', request_id memo:<id>).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { MEMO_STYLE, SOAP_SYSTEM, wavSeconds } from "../_shared/scribe-soap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_BYTES = 40 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let memoId = "";
  try {
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);
    const body = await req.json().catch(() => ({}));
    memoId = typeof body.memoId === "string" ? body.memoId : "";
    if (!/^[0-9a-f-]{36}$/i.test(memoId)) return json({ error: "memoId is required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: memo } = await admin
      .from("voice_memos")
      .select("id, clinician_user_id, practice_id, patient_user_id, audio_path, status, transcript, draft")
      .eq("id", memoId)
      .maybeSingle();
    if (!memo || memo.clinician_user_id !== userId) return json({ error: "Not found" }, 404);

    // Already done: hand back what is stored, spend nothing.
    if (memo.transcript && ["transcribed", "assigned", "filed"].includes(memo.status)) {
      return json({ status: memo.status, repeated: true });
    }
    if (memo.status === "discarded") return json({ error: "Memo was discarded" }, 409);
    if (memo.status === "transcribing") return json({ status: "transcribing", repeated: true }, 202);
    if (!memo.audio_path || memo.audio_path.split("/")[0] !== userId) {
      return await fail(admin, memoId, "bad_path", 400);
    }

    await admin.from("voice_memos").update({ status: "transcribing", error_code: null }).eq("id", memoId);

    const { data: file, error: dlErr } = await admin.storage.from("clinician-dictations").download(memo.audio_path);
    if (dlErr || !file) return await fail(admin, memoId, "audio_missing", 404);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength === 0) return await fail(admin, memoId, "audio_empty", 422);
    if (buf.byteLength > MAX_BYTES) return await fail(admin, memoId, "audio_too_large", 413);
    // The real length comes from the WAV header, never from the client.
    const seconds = wavSeconds(buf);
    if (seconds === null) return await fail(admin, memoId, "not_wav", 422);

    const upstream = new FormData();
    upstream.append("model", "google/gemini-3.5-transcribe");
    upstream.append("file", new Blob([buf], { type: "audio/wav" }), "memo.wav");
    const tr = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: upstream,
    });
    if (!tr.ok) {
      console.error("voice-memo-process transcription", memoId, tr.status);
      const code = tr.status === 402 ? "credits" : tr.status === 429 ? "busy" : "transcribe_failed";
      return await fail(admin, memoId, code, 502);
    }
    const trData = await tr.json().catch(() => ({}));
    const transcript = typeof trData?.text === "string" ? trData.text.trim() : "";
    if (!transcript) return await fail(admin, memoId, "no_speech", 422);

    // Draft only with an assigned patient and current access, checked as the caller.
    let draft: Record<string, unknown> | null = null;
    if (memo.patient_user_id) {
      const { data: ok } = await userClient.rpc("has_current_clinical_access", {
        _patient_user_id: memo.patient_user_id,
        _practice_id: memo.practice_id ?? null,
      });
      if (ok === true) {
        try {
          const gw = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: `${SOAP_SYSTEM}\n\nStyle: ${MEMO_STYLE}` },
                { role: "user", content: transcript },
              ],
            }),
          });
          if (gw.ok) {
            const d = await gw.json();
            const raw = String(d.choices?.[0]?.message?.content ?? "").trim();
            try {
              draft = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
            } catch {
              draft = { chief_complaint: "", subjective: transcript, objective: "", assessment: "", plan: "" };
            }
          } else {
            console.error("voice-memo-process draft", memoId, gw.status);
          }
        } catch {
          console.error("voice-memo-process draft failed", memoId);
        }
      }
    }

    const finalStatus = memo.patient_user_id ? "assigned" : "transcribed";
    const { error: upErr } = await admin
      .from("voice_memos")
      .update({
        status: finalStatus,
        transcript,
        draft,
        duration_ms: Math.round(seconds * 1000),
        error_code: null,
      })
      .eq("id", memoId);
    if (upErr) {
      console.error("voice-memo-process save", memoId, upErr.code);
      return await fail(admin, memoId, "save_failed", 500);
    }

    // Log only. A failure to count must never fail a memo that already exists.
    try {
      const { error: usageErr } = await admin.rpc("record_scribe_usage", {
        _user_id: userId,
        _practice_id: memo.practice_id ?? null,
        _kind: "memo",
        _audio_seconds: seconds,
        _request_id: `memo:${memoId}`,
      });
      if (usageErr) throw usageErr;
    } catch {
      console.error("voice-memo-process usage not recorded", memoId);
    }

    return json({ status: finalStatus, drafted: draft !== null });
  } catch (e) {
    console.error("voice-memo-process error", memoId, e instanceof Error ? e.name : "unknown");
    return json({ error: "Could not process the memo" }, 500);
  }
});

async function fail(admin: ReturnType<typeof createClient>, id: string, code: string, status: number) {
  await admin.from("voice_memos").update({ status: "failed", error_code: code }).eq("id", id);
  return json({ error: code, status: "failed" }, status);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
