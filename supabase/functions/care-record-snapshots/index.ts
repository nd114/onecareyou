import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallerUser, isInternalCall } from "../_shared/auth.ts";

/**
 * Files care record snapshots into patients' Vaults.
 *
 * The database decides what is owed and what goes in it: triggers queue a job
 * when a share ends, the hourly sweep (enqueue_due_care_record_snapshots, run
 * by pg_cron) queues expiries and quarterly records, and
 * compile_care_record_snapshot builds the HTML as the definer, so no client
 * read rule is involved. This function only does the part SQL cannot: put the
 * bytes in storage, then hand the path back to file_care_record_snapshot.
 *
 * Two callers:
 *   - pg_cron (x-cron-secret) or the service role: works through the queue.
 *   - a signed-in patient, straight after asking for a record or ending a
 *     share: works through that patient's own jobs only, so the record appears
 *     while they are still looking. If they close the tab first, the job stays
 *     queued and the next hourly run files it. Nothing is lost by a browser.
 *
 * Deploy with verify_jwt = false (config.toml): the scheduler has no JWT, and
 * the caller is checked here instead.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "health-documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Job {
  id: string;
  patient_user_id: string;
}

interface Compiled {
  html: string;
  sha256: string;
  title: string;
  file_name: string;
  notes: string;
  document_date: string;
  patient_user_id: string;
}

interface Outcome {
  job_id: string;
  status: "filed" | "pending" | "processing" | "failed";
  document_id?: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fileOne(admin: SupabaseClient, job: Job): Promise<Outcome> {
  try {
    const { data, error: compileError } = await admin.rpc("compile_care_record_snapshot", {
      _job_id: job.id,
    });
    if (compileError || !data) throw new Error(`compile: ${compileError?.message ?? "no record returned"}`);
    const compiled = data as Compiled;

    // The digest stored with the record is computed by the database over the
    // HTML's UTF-8 bytes. Upload exactly those bytes, and refuse if they are
    // not what the database hashed — a stored digest that does not match the
    // file would make an untouched record look tampered with.
    const bytes = new TextEncoder().encode(compiled.html);
    if ((await sha256Hex(bytes)) !== compiled.sha256) {
      throw new Error("digest mismatch between database and worker");
    }

    // A fresh, unguessable name per attempt. A patient can see their own job
    // ids, and may write anywhere in their own folder until a row claims the
    // path, so a name derived from the job id could be pre-created by them.
    const path = `${job.patient_user_id}/care-records/${crypto.randomUUID()}.html`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "text/html; charset=utf-8", upsert: false });
    if (uploadError) throw new Error(`upload: ${uploadError.message}`);

    const { html: _html, ...meta } = compiled;
    const { data: documentId, error: fileError } = await admin.rpc("file_care_record_snapshot", {
      _job_id: job.id,
      _file_path: path,
      _file_size: bytes.byteLength,
      _compiled: meta,
    });
    if (fileError || !documentId) throw new Error(`file: ${fileError?.message ?? "no document returned"}`);

    return { job_id: job.id, status: "filed", document_id: documentId as string };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Deliberately no clean-up of the uploaded file. If the filing call failed
    // only on the way back, the row exists and points at that file; removing
    // it would destroy the very record this function exists to keep. An
    // orphaned upload in the patient's own folder is theirs to remove.
    // fail_care_record_snapshot_job only touches a job still 'processing', so
    // a job that did get filed stays filed.
    await admin.rpc("fail_care_record_snapshot_job", { _job_id: job.id, _error: message });
    console.error("care-record-snapshots: job not filed", job.id, message);
    return { job_id: job.id, status: "pending" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internal = await isInternalCall(req);
    const user = internal ? null : await getCallerUser(req);
    if (!internal && !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId: string | null = typeof body?.job_id === "string" ? body.job_id : null;
    if (jobId !== null && !UUID.test(jobId)) return json({ error: "job_id must be a uuid" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // A patient's call is scoped to their own jobs by the claim itself, not by
    // anything this function checks afterwards.
    const { data: claimed, error: claimError } = await admin.rpc("claim_care_record_snapshot_jobs", {
      _limit: internal ? 25 : 5,
      _job_id: jobId,
      _patient: user?.id ?? null,
    });
    if (claimError) {
      console.error("care-record-snapshots: claim failed", claimError.message);
      return json({ error: "Could not reach the care record queue" }, 500);
    }

    const results: Outcome[] = [];
    for (const job of (claimed ?? []) as Job[]) {
      results.push(await fileOne(admin, job));
    }

    // Asked about one job that another worker already has, or already filed:
    // report where it stands so the patient is told the truth, not "failed".
    if (jobId && !results.some((r) => r.job_id === jobId)) {
      let lookup = admin
        .from("care_record_snapshot_jobs")
        .select("id, status, document_id")
        .eq("id", jobId);
      if (user) lookup = lookup.eq("patient_user_id", user.id);
      const { data: row } = await lookup.maybeSingle();
      if (row) results.push({ job_id: row.id, status: row.status, document_id: row.document_id });
    }

    if (internal) {
      return json({
        claimed: results.length,
        filed: results.filter((r) => r.status === "filed").length,
        requeued: results.filter((r) => r.status !== "filed").length,
      });
    }
    return json({ results });
  } catch (e) {
    console.error("care-record-snapshots failed", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
