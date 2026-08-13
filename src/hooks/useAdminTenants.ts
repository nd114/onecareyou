import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';

export interface AdminTenantRow {
  id: string;
  name: string;
  slug: string | null;
  tenant_type: string | null;
  city: string | null;
  country: string | null;
  subscription_tier: string | null;
  revenue_share_pct: number | null;
  storage_limit_gb: number | null;
  storage_bytes: number;
  member_count: number;
  active_share_count: number;
  created_at: string;
}

/** Platform-admin oversight: every tenant with team size, connections and storage. */
export function useAdminTenants() {
  const { isAdmin } = useAdminRole();

  const query = useQuery({
    queryKey: ['admin-tenant-overview'],
    enabled: isAdmin,
    queryFn: async (): Promise<AdminTenantRow[]> => {
      const { data, error } = await supabase.rpc('admin_tenant_overview');
      if (error) throw error;
      return (data || []) as AdminTenantRow[];
    },
  });

  const tenants = query.data ?? [];

  return {
    tenants,
    isLoading: query.isLoading,
    totals: {
      tenants: tenants.length,
      hospitals: tenants.filter((t) => t.tenant_type === 'hospital').length,
      members: tenants.reduce((sum, t) => sum + Number(t.member_count || 0), 0),
      connections: tenants.reduce((sum, t) => sum + Number(t.active_share_count || 0), 0),
      storageBytes: tenants.reduce((sum, t) => sum + Number(t.storage_bytes || 0), 0),
    },
  };
}
