import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface EHRConnection {
  id: string;
  clinician_user_id: string;
  provider_type: string;
  provider_name: string;
  fhir_base_url: string | null;
  last_sync_at: string | null;
  sync_status: 'pending' | 'active' | 'error' | 'syncing';
  error_message: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EHRSyncLog {
  id: string;
  connection_id: string;
  sync_type: 'import' | 'export';
  resource_type: string;
  record_count: number;
  status: 'success' | 'partial' | 'failed';
  error_details: any;
  created_at: string;
}

export const EHR_PROVIDERS = [
  { id: 'veradigm', name: 'Veradigm (Vericlaim)', description: 'Connect via SMART on FHIR', available: true },
  { id: 'healthbridge', name: 'HealthBridge Clinical', description: 'JWT authentication + FHIR R4', available: true },
  { id: 'fhir_generic', name: 'Generic FHIR Server', description: 'Connect any FHIR R4 compatible system', available: true },
  { id: 'manual_import', name: 'Manual Import', description: 'Import patient data from CSV/Excel files', available: true },
];

export function useEHRConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['ehr-connections', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase
        .from('ehr_connections' as any)
        .select('*')
        .eq('clinician_user_id', user.id)
        .order('created_at', { ascending: false }) as any);
      if (error) throw error;
      return (data || []) as EHRConnection[];
    },
    enabled: !!user,
  });

  const useSyncLogs = (connectionId: string) => {
    return useQuery({
      queryKey: ['ehr-sync-logs', connectionId],
      queryFn: async () => {
        const { data, error } = await (supabase
          .from('ehr_sync_logs' as any)
          .select('*')
          .eq('connection_id', connectionId)
          .order('created_at', { ascending: false })
          .limit(20) as any);
        if (error) throw error;
        return (data || []) as EHRSyncLog[];
      },
      enabled: !!connectionId,
    });
  };

  const createConnection = useMutation({
    mutationFn: async ({ providerType, providerName, fhirBaseUrl }: { providerType: string; providerName: string; fhirBaseUrl?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await (supabase
        .from('ehr_connections' as any)
        .insert({ clinician_user_id: user.id, provider_type: providerType, provider_name: providerName, fhir_base_url: fhirBaseUrl || null })
        .select()
        .single() as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ehr-connections'] }); toast.success('EHR connection created'); },
    onError: () => { toast.error('Failed to create connection'); },
  });

  const updateConnection = useMutation({
    mutationFn: async ({ connectionId, updates }: { connectionId: string; updates: Partial<EHRConnection> }) => {
      const { error } = await (supabase.from('ehr_connections' as any).update(updates).eq('id', connectionId) as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ehr-connections'] }); },
  });

  const deleteConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await (supabase.from('ehr_connections' as any).delete().eq('id', connectionId) as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ehr-connections'] }); toast.success('Connection removed'); },
    onError: () => { toast.error('Failed to remove connection'); },
  });

  return { connections, isLoading, useSyncLogs, createConnection, updateConnection, deleteConnection, providers: EHR_PROVIDERS };
}
