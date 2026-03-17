import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DocumentShare {
  id: string;
  document_id: string;
  user_id: string;
  provider_share_id: string;
  shared_at: string;
  revoked_at: string | null;
  is_active: boolean;
}

export function useDocumentShares(documentId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get all shares for a specific document (patient side)
  const { data: shares = [], isLoading } = useQuery({
    queryKey: ['document-shares', documentId],
    queryFn: async () => {
      if (!user || !documentId) return [];
      const { data, error } = await supabase
        .from('document_shares')
        .select('*')
        .eq('document_id', documentId)
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []) as unknown as DocumentShare[];
    },
    enabled: !!user && !!documentId,
  });

  // Get share counts for all user documents (for badges)
  const { data: allShareCounts = {} } = useQuery({
    queryKey: ['document-share-counts', user?.id],
    queryFn: async () => {
      if (!user) return {};
      const { data, error } = await supabase
        .from('document_shares')
        .select('document_id, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((s: any) => {
        counts[s.document_id] = (counts[s.document_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  const shareDocument = useMutation({
    mutationFn: async ({ documentId, providerShareId }: { documentId: string; providerShareId: string }) => {
      if (!user) throw new Error('Not authenticated');
      
      // Upsert: if a revoked share exists, reactivate it
      const { data: existing } = await supabase
        .from('document_shares')
        .select('id')
        .eq('document_id', documentId)
        .eq('provider_share_id', providerShareId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('document_shares')
          .update({ is_active: true, revoked_at: null } as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('document_shares')
          .insert({
            document_id: documentId,
            user_id: user.id,
            provider_share_id: providerShareId,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-shares'] });
      queryClient.invalidateQueries({ queryKey: ['document-share-counts'] });
    },
    onError: (error) => {
      toast.error('Failed to share document: ' + error.message);
    },
  });

  const revokeShare = useMutation({
    mutationFn: async ({ documentId, providerShareId }: { documentId: string; providerShareId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('document_shares')
        .update({ is_active: false, revoked_at: new Date().toISOString() } as any)
        .eq('document_id', documentId)
        .eq('provider_share_id', providerShareId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-shares'] });
      queryClient.invalidateQueries({ queryKey: ['document-share-counts'] });
    },
    onError: (error) => {
      toast.error('Failed to revoke share: ' + error.message);
    },
  });

  const activeShares = shares.filter(s => s.is_active);

  return {
    shares,
    activeShares,
    allShareCounts,
    isLoading,
    shareDocument,
    revokeShare,
  };
}
