import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionError } from "@/lib/edge-function-error";
import { UPLOAD_BACKOFF_MS } from "@/lib/scribe-pipeline";

/** Fired whenever a memo is created or changes, so the inbox refetches. */
export const VOICE_MEMOS_CHANGED = "onecare:voice-memos-changed";
export const notifyVoiceMemosChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(VOICE_MEMOS_CHANGED));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const memoAudioPath = (userId: string, memoId: string) => `${userId}/memos/${memoId}.wav`;

/** Ask the server to transcribe (and, with an assigned patient, draft) a memo. */
export async function processMemo(memoId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("voice-memo-process", { body: { memoId } });
  if (data?.error && !data?.status) throw new Error(String(data.error));
  if (error) {
    // A 4xx/5xx whose body carries a failed status is already recorded on the row.
    if (data?.status === "failed") return;
    throw new Error((await edgeFunctionError(error)).message);
  }
}

/**
 * Upload the audio, create the memo row, then start processing.
 *
 * Idempotent per memo id: the object path is stable (upsert) and a duplicate
 * row is treated as success, so a retry after a half-finished attempt never
 * makes a second memo. If the row cannot be created the uploaded object is
 * removed, so no audio is left behind without a memo that owns it. A
 * processing failure is not thrown: the audio and row are safe, and the inbox
 * offers Retry.
 */
export async function uploadMemo(input: {
  userId: string;
  memoId: string;
  blob: Blob;
  durationMs: number;
}): Promise<void> {
  const path = memoAudioPath(input.userId, input.memoId);
  let lastErr = "";
  for (let attempt = 0; attempt <= UPLOAD_BACKOFF_MS.length; attempt += 1) {
    const { error } = await supabase.storage
      .from("clinician-dictations")
      .upload(path, input.blob, { contentType: "audio/wav", upsert: true });
    if (!error) {
      lastErr = "";
      break;
    }
    lastErr = error.message || "Upload failed";
    if (attempt < UPLOAD_BACKOFF_MS.length) await sleep(UPLOAD_BACKOFF_MS[attempt]);
  }
  if (lastErr) throw new Error(lastErr);

  const { error: rowErr } = await supabase.from("voice_memos").insert({
    id: input.memoId,
    clinician_user_id: input.userId,
    audio_path: path,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
  });
  if (rowErr && rowErr.code !== "23505") {
    await supabase.storage.from("clinician-dictations").remove([path]);
    throw new Error("Could not save the memo");
  }
  notifyVoiceMemosChanged();
  try {
    await processMemo(input.memoId);
  } catch {
    /* the memo exists; the inbox shows it and offers Retry */
  }
}
