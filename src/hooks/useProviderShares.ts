import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface SharePermissions {
  vitals: boolean;
  meds: boolean;
  adherence: boolean;
  profile: boolean;
}

interface ProviderShare {
  id: string;
  user_id: string;
  provider_name: string;
  provider_email: string | null;
  invite_code: string;
  permissions: SharePermissions;
  is_active: boolean;
  created_at: string;
  last_accessed_at: string | null;
  expires_at: string | null;
}

interface CreateShareData {
  providerName: string;
  providerEmail?: string;
  permissions: SharePermissions;
  expiresInDays?: number;
}

// Generate a secure random invite code
const generateInviteCode = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  const randomValues = new Uint8Array(12);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 12; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return code;
};

export function useProviderShares() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: shares = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['provider-shares', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('provider_shares')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion since permissions is JSONB
      return (data || []).map(share => ({
        ...share,
        permissions: share.permissions as unknown as SharePermissions,
      })) as ProviderShare[];
    },
    enabled: !!user,
  });

  const createShare = useMutation({
    mutationFn: async (data: CreateShareData) => {
      if (!user) throw new Error('Not authenticated');

      const inviteCode = generateInviteCode();
      const expiresAt = data.expiresInDays 
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data: newShare, error } = await supabase
        .from('provider_shares')
        .insert({
          user_id: user.id,
          provider_name: data.providerName,
          provider_email: data.providerEmail || null,
          invite_code: inviteCode,
          permissions: data.permissions,
          expires_at: expiresAt,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return { ...newShare, permissions: newShare.permissions as unknown as SharePermissions } as ProviderShare;
    },
    onSuccess: (newShare) => {
      queryClient.invalidateQueries({ queryKey: ['provider-shares'] });
      
      // Copy link to clipboard
      const shareLink = `${window.location.origin}/clinician/patient/${newShare.invite_code}`;
      navigator.clipboard.writeText(shareLink);
      
      toast.success('Share link created and copied to clipboard!');
    },
    onError: (error) => {
      console.error('Error creating share:', error);
      toast.error('Failed to create share link');
    },
  });

  const revokeShare = useMutation({
    mutationFn: async (shareId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Capture share details first so we can log who lost access
      const { data: existing } = await supabase
        .from('provider_shares')
        .select('provider_name, provider_email')
        .eq('id', shareId)
        .eq('user_id', user.id)
        .maybeSingle();

      const { error } = await supabase
        .from('provider_shares')
        .delete()
        .eq('id', shareId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Best-effort HIPAA audit log entry for the revoke event
      try {
        await (supabase.from('hipaa_audit_logs' as any).insert({
          user_id: user.id,
          action: 'provider_share_revoked',
          resource_type: 'provider_share',
          resource_id: shareId,
          patient_user_id: user.id,
          details: {
            provider_name: existing?.provider_name ?? null,
            provider_email: existing?.provider_email ?? null,
          },
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }) as any);
      } catch (err) {
        console.error('Audit log failed for share revoke:', err);
      }

      return existing;
    },
    onSuccess: (existing) => {
      queryClient.invalidateQueries({ queryKey: ['provider-shares'] });
      const name = existing?.provider_name ? `${existing.provider_name}'s` : 'Provider';
      toast.success(`${name} access revoked`, {
        description: 'They can no longer view your data. We recorded this in your audit log.',
      });
    },
    onError: (error) => {
      console.error('Error revoking share:', error);
      toast.error('Failed to revoke access');
    },
  });

  const updateShare = useMutation({
    mutationFn: async ({ shareId, permissions, isActive }: { 
      shareId: string; 
      permissions?: SharePermissions; 
      isActive?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const updates: Record<string, unknown> = {};
      if (permissions !== undefined) updates.permissions = permissions as unknown as Record<string, unknown>;
      if (isActive !== undefined) updates.is_active = isActive;

      const { error } = await supabase
        .from('provider_shares')
        .update(updates as never)
        .eq('id', shareId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-shares'] });
      toast.success('Share updated successfully');
    },
    onError: (error) => {
      console.error('Error updating share:', error);
      toast.error('Failed to update share');
    },
  });

  return {
    shares,
    isLoading,
    error,
    createShare,
    revokeShare,
    updateShare,
  };
}
