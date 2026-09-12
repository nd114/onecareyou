import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { toast } from 'sonner';

export interface ReliabilityOverview {
  record_exchange: {
    connections: number;
    connections_in_error: number;
    failures_24h: number;
    failures_7d: number;
    successes_24h: number;
    never_synced: number;
  };
  export_queue: {
    pending: number;
    failed: number;
    stuck: number;
    oldest_pending_at: string | null;
  };
  assistant: {
    conversations_24h: number;
    conversations_7d: number;
    messages_24h: number;
    messages_7d: number;
  };
  dictation: {
    failed_24h: number;
    failed_7d: number;
    awaiting_review: number;
  };
  sign_in: {
    throttled_24h: number;
    throttled_7d: number;
    partner_failures_24h: number;
    top_buckets: Array<{ bucket: string; count: number }>;
  };
  alerts: {
    vital_alerts_24h: number;
    unacknowledged: number;
    caregiver_alerts_7d: number;
  };
  checked_at: string;
}

export interface SyncFailure {
  connection_id: string;
  provider_name: string | null;
  provider_type: string | null;
  sync_status: string;
  last_sync_at: string | null;
  failures_7d: number;
  last_error: string | null;
  last_failed_at: string | null;
  queued_exports: number;
}

export function useAdminReliability() {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ['admin-reliability-overview'],
    enabled: isAdmin,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<ReliabilityOverview | null> => {
      const { data, error } = await supabase.rpc('admin_reliability_overview');
      if (error) throw error;
      return (data ?? null) as unknown as ReliabilityOverview | null;
    },
  });

  const failures = useQuery({
    queryKey: ['admin-sync-failures'],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<SyncFailure[]> => {
      const { data, error } = await supabase.rpc('admin_sync_failures', { _limit: 25 });
      if (error) throw error;
      return (data || []) as SyncFailure[];
    },
  });

  const requeue = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.rpc('admin_requeue_ehr_exports', {
        _connection_id: connectionId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (count) => {
      toast.success(
        count > 0
          ? `${count} export${count === 1 ? '' : 's'} back in the queue`
          : 'Nothing was waiting to be requeued',
      );
      queryClient.invalidateQueries({ queryKey: ['admin-sync-failures'] });
      queryClient.invalidateQueries({ queryKey: ['admin-reliability-overview'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not requeue those exports'),
  });

  return {
    overview: overview.data ?? null,
    failures: failures.data ?? [],
    isLoading: overview.isLoading || failures.isLoading,
    requeue: requeue.mutate,
    isRequeueing: requeue.isPending,
  };
}
