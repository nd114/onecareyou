import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/** Storage consumed by the signed-in account (documents, transcripts, images). */
export function useMyStorageUsage() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['storage-usage', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase.rpc('get_user_storage_bytes', {
        _user_id: user.id,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { bytes: query.data ?? 0, isLoading: query.isLoading };
}

/** Pooled storage consumed by a practice / hospital tenant. */
export function usePracticeStorageUsage(practiceId?: string | null) {
  const query = useQuery({
    queryKey: ['practice-storage-usage', practiceId],
    queryFn: async () => {
      if (!practiceId) return 0;
      const { data, error } = await supabase.rpc('get_practice_storage_bytes', {
        _practice_id: practiceId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!practiceId,
    staleTime: 5 * 60 * 1000,
  });

  return { bytes: query.data ?? 0, isLoading: query.isLoading };
}
