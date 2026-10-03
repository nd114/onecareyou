import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall } from "../_shared/auth.ts";

/**
 * Daily sweep of voice memo audio. The database decides what is due
 * (voice_memo_audio_due: 24 hours after the clinician filed or discarded the
 * transcript, or 30 days after upload, unless the clinician chose to keep
 * audio). This function removes the bytes through the storage API, so no
 * orphaned objects are left, then marks the rows. Transcripts are not touched.
 *
 * Internal callers only (pg_cron with x-cron-secret). Logs counts only.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    if (!(await isInternalCall(req))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: due, error } = await admin.rpc("voice_memo_audio_due", { _limit: 200 });
    if (error) throw error;
    const rows = (due ?? []) as { id: string; audio_path: string }[];
    if (rows.length === 0) return respond({ removed: 0 });

    const { error: rmErr } = await admin.storage.from("clinician-dictations").remove(rows.map((r) => r.audio_path));
    if (rmErr) throw rmErr;
    const { error: markErr } = await admin.rpc("voice_memo_mark_audio_deleted", { _ids: rows.map((r) => r.id) });
    if (markErr) throw markErr;
    console.log("voice-memo-retention removed", rows.length);
    return respond({ removed: rows.length });
  } catch (e) {
    console.error("voice-memo-retention error", e instanceof Error ? e.name : "unknown");
    return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
  }
});

function respond(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}
