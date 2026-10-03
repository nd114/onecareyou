import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionError } from "@/lib/edge-function-error";

export interface ScribeDraftResult {
  transcript: string;
  draft: Record<string, unknown>;
}

export interface PipelineInput {
  userId: string;
  encounterId: string;
  /** Stable per recording, so a retried upload overwrites rather than duplicates. */
  recordingId: string;
  blob: Blob;
  ext: string;
  noteStyle: string;
  liveTranscript?: string;
  durationSeconds?: number;
  onStage?: (stage: "uploading" | "processing") => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const UPLOAD_BACKOFF_MS = [1000, 3000];

/**
 * Upload then draft. Only the upload is retried automatically: it is
 * idempotent (same path, upsert). The draft call is not, because each call
 * costs a gateway run, so a failure there is surfaced for a deliberate retry.
 * Errors carry no clinical content.
 */
export async function uploadAndDraft(input: PipelineInput): Promise<ScribeDraftResult> {
  const path = `${input.userId}/encounters/${input.encounterId}-${input.recordingId}.${input.ext}`;
  input.onStage?.("uploading");
  let lastErr = "Upload failed";
  for (let attempt = 0; attempt <= UPLOAD_BACKOFF_MS.length; attempt += 1) {
    const { error } = await supabase.storage
      .from("clinician-dictations")
      .upload(path, input.blob, { contentType: input.blob.type || "audio/webm", upsert: true });
    if (!error) {
      lastErr = "";
      break;
    }
    lastErr = error.message;
    if (attempt < UPLOAD_BACKOFF_MS.length) await sleep(UPLOAD_BACKOFF_MS[attempt]);
  }
  if (lastErr) throw new Error(lastErr);

  input.onStage?.("processing");
  const { data, error } = await supabase.functions.invoke("encounter-scribe", {
    body: {
      encounterId: input.encounterId,
      audioPath: path,
      noteStyle: input.noteStyle,
      liveTranscript: input.liveTranscript ?? "",
      // One id per recording, reused on every retry: the server returns the
      // stored draft for a repeat instead of re-running (and re-billing) it.
      requestId: input.recordingId,
      ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
    },
  });
  if (data?.error) throw new Error(data.error);
  if (error) throw new Error((await edgeFunctionError(error)).message);
  return { transcript: data.transcript ?? "", draft: data.draft ?? {} };
}
