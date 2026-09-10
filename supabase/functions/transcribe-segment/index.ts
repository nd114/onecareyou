/**
 * Edge function: transcribe-segment
 *
 * Live transcription for the clinical scribe. The browser sends a short,
 * complete WAV of the last few seconds of the consultation; this returns the
 * words in it. Nothing is stored and nothing touches a patient's record — the
 * running transcript lives in the clinician's screen until the visit ends and
 * the full recording is drafted by encounter-scribe.
 *
 * Auth: requires a signed-in clinician JWT.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MAX_BYTES = 8 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return json({ error: "An audio file is required" }, 400);
    if (file.size === 0) return json({ error: "That segment was empty" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "That segment is too large" }, 413);

    const upstream = new FormData();
    upstream.append("model", "google/gemini-3.5-transcribe");
    upstream.append("file", file, "segment.wav");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: upstream,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("transcribe-segment gateway error", res.status, detail);
      const message =
        res.status === 429
          ? "Transcription is busy — the next few seconds will catch up."
          : res.status === 402
            ? "AI credits are exhausted. Ask the workspace owner to top up."
            : "Transcription failed for that segment.";
      return json({ error: message }, res.status);
    }

    const data = await res.json().catch(() => ({}));
    return json({ text: typeof data?.text === "string" ? data.text.trim() : "" });
  } catch (e) {
    console.error("transcribe-segment error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
