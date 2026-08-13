import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { toast } from 'sonner';

export interface AdminTenantDetail {
  id: string;
  name: string;
  slug: string | null;
  tenant_type: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  email: string | null;
  npi: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
  storage_limit_gb: number | null;
  revenue_share_pct: number | null;
  patient_limit: number | null;
  member_limit: number | null;
  is_active: boolean | null;
  logo_url: string | null;
  primary_color: string | null;
  brand_logo_url: string | null;
  brand_accent_color: string | null;
  storage_bytes: number;
  member_count: number;
  active_share_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminTenantMember {
  user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface TenantBrandingInput {
  logo_url?: string;
  primary_color?: string;
  accent_color?: string;
}

/** Full tenant profile, roster and branding controls for platform admins. */
export function useAdminTenantDetail(practiceId?: string) {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['admin-tenant-detail', practiceId],
    enabled: isAdmin && !!practiceId,
    queryFn: async (): Promise<AdminTenantDetail | null> => {
      const { data, error } = await supabase.rpc('admin_tenant_detail', {
        _practice_id: practiceId!,
      });
      if (error) throw error;
      return ((data || []) as AdminTenantDetail[])[0] ?? null;
    },
  });

  const members = useQuery({
    queryKey: ['admin-tenant-members', practiceId],
    enabled: isAdmin && !!practiceId,
    queryFn: async (): Promise<AdminTenantMember[]> => {
      const { data, error } = await supabase.rpc('admin_tenant_members', {
        _practice_id: practiceId!,
      });
      if (error) throw error;
      return (data || []) as AdminTenantMember[];
    },
  });

  const setBranding = useMutation({
    mutationFn: async (input: TenantBrandingInput) => {
      if (!practiceId) throw new Error('No tenant selected');
      const { error } = await supabase.rpc('admin_set_tenant_branding', {
        _practice_id: practiceId,
        _logo_url: input.logo_url ?? undefined,
        _primary_color: input.primary_color ?? undefined,
        _accent_color: input.accent_color ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Branding saved');
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', practiceId] });
      queryClient.invalidateQueries({ queryKey: ['admin-recent-actions'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the branding'),
  });

  return {
    tenant: detail.data ?? null,
    isLoading: detail.isLoading,
    members: members.data ?? [],
    isLoadingMembers: members.isLoading,
    setBranding: setBranding.mutateAsync,
    isSavingBranding: setBranding.isPending,
  };
}
