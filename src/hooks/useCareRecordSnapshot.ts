import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Care record snapshots — the Health Vault as system of record.
 *
 * The record is built and filed by the server
 * (20261010110000_care_record_snapshots_server_side.sql and the
 * care-record-snapshots edge function), never in the browser. The database
 * queues one whenever a share ends — whoever ends it — when a share expires,
 * and quarterly for live relationships; this hook only lets the patient ask for
 * one now and nudges the worker so it appears while they are still looking.
 *
 * There is no browser fallback, on purpose. A record the browser writes is the
 * patient's own upload, which is exactly what a permanent record must not be:
 * the database now refuses a client insert that claims to be a care record.
 * The fallback is the queue — a job survives a closed tab, and the hourly run
 * files it.
 */

export const CARE_RECORD_SOURCE = 'care_record_snapshot';
export const CARE_RECORD_FUNCTION = 'care-record-snapshots';

/** filed: in the Vault now. queued: accepted, and the worker will file it. */
export type CareRecordOutcome = 'filed' | 'queued';

interface SnapshotInput {
  /** The provider share or hospital share the record is for. */
  shareId: string;
  /** Suppress toasts. */
  silent?: boolean;
}

interface WorkerResult {
  job_id: string;
  status: string;
}

/**
 * Ask the worker to file this patient's queued records now. Never throws: if
 * the call fails the job is still queued, and saying "being prepared" is true.
 */
export async function fileQueuedCareRecords(jobId?: string): Promise<CareRecordOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke(CARE_RECORD_FUNCTION, {
      body: jobId ? { job_id: jobId } : {},
    });
    if (error || !jobId) return 'queued';
    const results = ((data as { results?: WorkerResult[] } | null)?.results ?? []);
    return results.find((r) => r.job_id === jobId)?.status === 'filed' ? 'filed' : 'queued';
  } catch {
    return 'queued';
  }
}

export function useCareRecordSnapshot() {
  const queryClient = useQueryClient();

  const generate = useMutation({
    mutationFn: async ({ shareId }: SnapshotInput): Promise<CareRecordOutcome> => {
      const { data: jobId, error } = await supabase.rpc('request_care_record_snapshot', {
        _share_id: shareId,
      });
      if (error) throw error;
      if (!jobId) throw new Error('The request was not accepted');
      return fileQueuedCareRecords(jobId);
    },
    onSuccess: (outcome, vars) => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      if (vars.silent) return;
      if (outcome === 'filed') {
        toast.success('Care record saved to your Health Vault');
      } else {
        toast.info('Your care record is being prepared. It will appear in your Health Vault shortly.');
      }
    },
    onError: (error: Error & { code?: string }, vars) => {
      if (vars?.silent) return;
      // P0002 from request_care_record_snapshot: nobody ever held the invitation.
      if (error.code === 'P0002') {
        toast.info('This provider has not joined yet, so there is no record to file.');
      } else {
        toast.error(`Could not save the care record: ${error.message}`);
      }
    },
  });

  /**
   * A share just ended and the database has already queued its record. Ask the
   * worker to file it now rather than on the next hourly run.
   */
  const fileQueued = () => {
    void fileQueuedCareRecords().then(() =>
      queryClient.invalidateQueries({ queryKey: ['health-documents'] }),
    );
  };

  return { generate, fileQueued };
}
