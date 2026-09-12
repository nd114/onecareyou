import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { toast } from 'sonner';

export type AdminRange = '1' | '7' | '30' | '90';

export interface MovementMetric {
  metric_key: string;
  label: string;
  current_value: number;
  previous_value: number;
  total_value: number;
}

export interface MetricPoint {
  metric_key: string;
  day: string;
  value: number;
}

export interface AttentionItem {
  item_key: string;
  kind: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string | null;
  target_type: string | null;
  target_id: string | null;
  occurred_at: string;
}

export interface LivePulse {
  sync_failures: number;
  signin_throttles: number;
  signin_partner_failures: number;
  new_accounts: number;
  documents_added: number;
  assistant_conversations: number;
  messages_sent: number;
  checked_at: string;
}

/** Movement for the chosen window, with the window before it for comparison. */
export function useAdminMovement(range: AdminRange) {
  const { isAdmin } = useAdminRole();
  const days = Number(range);

  const metrics = useQuery({
    queryKey: ['admin-movement', days],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<MovementMetric[]> => {
      const { data, error } = await supabase.rpc('admin_movement_metrics', { _days: days });
      if (error) throw error;
      return (data || []) as MovementMetric[];
    },
  });

  // The sparkline always shows at least a week so a 24h view still has shape.
  const seriesDays = Math.max(days, 14);
  const series = useQuery({
    queryKey: ['admin-metric-series', seriesDays],
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MetricPoint[]> => {
      const { data, error } = await supabase.rpc('admin_metric_series', { _days: seriesDays });
      if (error) throw error;
      return (data || []) as MetricPoint[];
    },
  });

  const seriesByKey = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const p of series.data ?? []) {
      (map[p.metric_key] ||= []).push(Number(p.value));
    }
    return map;
  }, [series.data]);

  return {
    metrics: metrics.data ?? [],
    seriesByKey,
    isLoading: metrics.isLoading,
  };
}

/** The attention queue, plus dismiss and restore. */
export function useAdminAttention() {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-attention-queue'],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<AttentionItem[]> => {
      const { data, error } = await supabase.rpc('admin_attention_queue', { _for_admin: undefined });
      if (error) throw error;
      return (data || []) as AttentionItem[];
    },
  });

  const dismissals = useQuery({
    queryKey: ['admin-attention-dismissals'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_attention_dismissals')
        .select('item_key, dismissed_at')
        .order('dismissed_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-attention-queue'] });
    queryClient.invalidateQueries({ queryKey: ['admin-attention-dismissals'] });
  };

  const dismiss = useMutation({
    mutationFn: async (itemKey: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');
      const { error } = await supabase
        .from('admin_attention_dismissals')
        .upsert({ admin_user_id: uid, item_key: itemKey }, { onConflict: 'admin_user_id,item_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cleared from your queue');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not clear that item'),
  });

  const restore = useMutation({
    mutationFn: async (itemKey: string) => {
      const { error } = await supabase
        .from('admin_attention_dismissals')
        .delete()
        .eq('item_key', itemKey);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Back in your queue');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore that item'),
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    dismissedCount: dismissals.data?.length ?? 0,
    dismissedKeys: (dismissals.data ?? []).map((d) => d.item_key),
    dismiss: dismiss.mutate,
    restore: restore.mutate,
    isDismissing: dismiss.isPending,
  };
}

/** Last 24 hours across the signals we already store. */
export function useAdminPulse() {
  const { isAdmin } = useAdminRole();

  const query = useQuery({
    queryKey: ['admin-live-pulse'],
    enabled: isAdmin,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<LivePulse | null> => {
      const { data, error } = await supabase.rpc('admin_live_pulse');
      if (error) throw error;
      return (data ?? null) as unknown as LivePulse | null;
    },
  });

  return { pulse: query.data ?? null, isLoading: query.isLoading };
}

export interface DigestPreference {
  enabled: boolean;
  send_hour: number;
  last_sent_at: string | null;
}

/** The morning digest preference for the signed-in admin. */
export function useAdminDigest() {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-digest-preference'],
    enabled: isAdmin,
    queryFn: async (): Promise<DigestPreference> => {
      const { data, error } = await supabase
        .from('admin_digest_preferences')
        .select('enabled, send_hour, last_sent_at')
        .maybeSingle();
      if (error) throw error;
      // No row yet means the default: on, 07:00 UTC.
      return (
        (data as DigestPreference | null) ?? { enabled: true, send_hour: 7, last_sent_at: null }
      );
    },
  });

  const save = useMutation({
    mutationFn: async (input: { enabled?: boolean; send_hour?: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');
      const current = query.data ?? { enabled: true, send_hour: 7, last_sent_at: null };
      const { error } = await supabase.from('admin_digest_preferences').upsert(
        {
          user_id: uid,
          enabled: input.enabled ?? current.enabled,
          send_hour: input.send_hour ?? current.send_hour,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Digest settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-digest-preference'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the digest settings'),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-admin-digest', {
        body: { test: true },
      });
      if (error) throw error;
      return data as { sent: number };
    },
    onSuccess: (data) => {
      if (data?.sent) toast.success('Digest sent to your inbox');
      else toast.warning('Nothing was sent — check the email setup');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not send the digest'),
  });

  return {
    preference: query.data ?? { enabled: true, send_hour: 7, last_sent_at: null },
    isLoading: query.isLoading,
    save: save.mutate,
    isSaving: save.isPending,
    sendTest: sendTest.mutate,
    isSending: sendTest.isPending,
  };
}
