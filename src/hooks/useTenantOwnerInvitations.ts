import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface MyTenantInvitation {
  id: string;
  practice_id: string;
  practice_name: string;
  tenant_type: string | null;
  expires_at: string;
}

/** Pending invitations for the signed-in user to become owner of a practice or hospital. */
export function useTenantOwnerInvitations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['my-tenant-owner-invitations', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyTenantInvitation[]> => {
      const { data, error } = await supabase.rpc('my_tenant_owner_invitations');
      if (error) throw error;
      return (data || []) as MyTenantInvitation[];
    },
  });

  const accept = useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.rpc('accept_tenant_owner_invitation', {
        _invitation_id: invitationId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success('You now own this institution on OneCare');
      queryClient.invalidateQueries({ queryKey: ['my-tenant-owner-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['practice'] });
      queryClient.invalidateQueries({ queryKey: ['practice-members'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not accept the invitation'),
  });

  return {
    invitations: query.data ?? [],
    isLoading: query.isLoading,
    accept: accept.mutateAsync,
    isAccepting: accept.isPending,
  };
}
