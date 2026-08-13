import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PracticeTenantInfo {
  id: string;
  slug: string | null;
  tenant_type: string | null;
  storage_limit_gb: number | null;
  revenue_share_pct: number | null;
  subscription_tier: string | null;
}

/** Tenant-level settings (hospital code, tenant type, revenue share) for a practice. */
export function usePracticeTenant(practiceId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['practice-tenant-info', practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<PracticeTenantInfo | null> => {
      if (!practiceId) return null;
      const { data, error } = await supabase.rpc('get_practice_tenant_info', {
        _practice_id: practiceId,
      });
      if (error) throw error;
      return ((data || []) as PracticeTenantInfo[])[0] ?? null;
    },
  });

  const checkAvailability = async (slug: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('is_institution_slug_available', {
      _slug: slug,
      _practice_id: practiceId ?? undefined,
    });
    if (error) throw error;
    return data === true;
  };

  const setSlug = useMutation({
    mutationFn: async (slug: string) => {
      if (!practiceId) throw new Error('No practice');
      const { data, error } = await supabase.rpc('set_institution_slug', {
        _practice_id: practiceId,
        _slug: slug,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success('Hospital code saved');
      queryClient.invalidateQueries({ queryKey: ['practice-tenant-info'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the hospital code'),
  });

  return {
    tenant: query.data ?? null,
    isLoading: query.isLoading,
    checkAvailability,
    setSlug: setSlug.mutateAsync,
    isSaving: setSlug.isPending,
  };
}
