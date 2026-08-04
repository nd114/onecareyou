import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Server-verified admin check. Never trust local storage for this.
 */
export function useAdminRole() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['admin-role', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
  });

  return {
    isAdmin: query.data === true,
    isLoading: !!user && query.isLoading,
  };
}
