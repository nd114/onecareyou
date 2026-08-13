import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';

export interface AdminSignup {
  user_id: string;
  email: string | null;
  name: string | null;
  is_clinician: boolean;
  created_at: string;
}

export interface AdminAccessLogRow {
  id: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

/** Newest accounts on the platform, for admin oversight. Admin-gated server-side. */
export function useAdminSignups(limit = 20) {
  const { isAdmin } = useAdminRole();

  const query = useQuery({
    queryKey: ['admin-recent-signups', limit],
    enabled: isAdmin,
    queryFn: async (): Promise<AdminSignup[]> => {
      const { data, error } = await supabase.rpc('admin_recent_signups', { _limit: limit });
      if (error) throw error;
      return (data || []) as AdminSignup[];
    },
  });

  return { signups: query.data ?? [], isLoading: query.isLoading };
}

/** Cross-tenant access-log search (action, actor email, patient email). Admin-gated server-side. */
export function useAdminAccessLog(search: string) {
  const { isAdmin } = useAdminRole();
  const term = search.trim();

  const query = useQuery({
    queryKey: ['admin-access-log', term],
    enabled: isAdmin,
    queryFn: async (): Promise<AdminAccessLogRow[]> => {
      const { data, error } = await supabase.rpc('admin_access_log_search', {
        _search: term || null,
        _limit: 200,
      });
      if (error) throw error;
      return (data || []) as AdminAccessLogRow[];
    },
  });

  return { entries: query.data ?? [], isLoading: query.isLoading, isFetching: query.isFetching };
}
