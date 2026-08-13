import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { toast } from 'sonner';

export interface PlatformAdminRow {
  user_id: string;
  email: string;
  created_at: string;
}

export interface TenantInvitationRow {
  id: string;
  practice_id: string;
  practice_name: string;
  email: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface AdminActionRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface TenantContactInput {
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  npi?: string;
}

export interface CreateTenantInput extends TenantContactInput {
  name: string;
  tenant_type: 'practice' | 'hospital';
  subscription_tier?: string;
  storage_limit_gb?: number;
  revenue_share_pct?: number;
  slug?: string;
  patient_limit?: number;
  member_limit?: number;
}

export interface UpdateTenantInput {
  practice_id: string;
  name?: string;
  tenant_type?: 'practice' | 'hospital';
  city?: string;
  country?: string;
  subscription_tier?: string;
  storage_limit_gb?: number;
  revenue_share_pct?: number;
  patient_limit?: number;
  member_limit?: number;
  is_active?: boolean;
}


/** Platform-admin operations: tenant lifecycle, owner invitations, admin delegation, action log. */
export function useAdminOps() {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  const invalidateTenants = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-tenant-overview'] });
    queryClient.invalidateQueries({ queryKey: ['admin-tenant-invitations'] });
    queryClient.invalidateQueries({ queryKey: ['admin-recent-actions'] });
  };

  const admins = useQuery({
    queryKey: ['admin-platform-admins'],
    enabled: isAdmin,
    queryFn: async (): Promise<PlatformAdminRow[]> => {
      const { data, error } = await supabase.rpc('admin_list_platform_admins');
      if (error) throw error;
      return (data || []) as PlatformAdminRow[];
    },
  });

  const invitations = useQuery({
    queryKey: ['admin-tenant-invitations'],
    enabled: isAdmin,
    queryFn: async (): Promise<TenantInvitationRow[]> => {
      const { data, error } = await supabase.rpc('admin_list_tenant_invitations');
      if (error) throw error;
      return (data || []) as TenantInvitationRow[];
    },
  });

  const actions = useQuery({
    queryKey: ['admin-recent-actions'],
    enabled: isAdmin,
    queryFn: async (): Promise<AdminActionRow[]> => {
      const { data, error } = await supabase.rpc('admin_recent_actions', { _limit: 50 });
      if (error) throw error;
      return (data || []) as AdminActionRow[];
    },
  });

  const createTenant = useMutation({
    mutationFn: async (input: CreateTenantInput) => {
      const { data, error } = await supabase.rpc('admin_create_tenant', {
        _name: input.name,
        _tenant_type: input.tenant_type,
        _city: input.city || undefined,
        _country: input.country || undefined,
        _subscription_tier: input.subscription_tier || undefined,
        _storage_limit_gb: input.storage_limit_gb ?? undefined,
        _revenue_share_pct: input.revenue_share_pct ?? undefined,
        _slug: input.slug || undefined,
        _patient_limit: input.patient_limit ?? undefined,
        _member_limit: input.member_limit ?? undefined,
        _address: input.address || undefined,
        _state: input.state || undefined,
        _zip_code: input.zip_code || undefined,
        _phone: input.phone || undefined,
        _email: input.email || undefined,
        _npi: input.npi || undefined,
      } as never);
      if (error) throw error;

      return data as string;
    },
    onSuccess: () => {
      toast.success('Tenant created');
      invalidateTenants();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create the tenant'),
  });

  const updateTenant = useMutation({
    mutationFn: async (input: UpdateTenantInput) => {
      const { error } = await supabase.rpc('admin_update_tenant', {
        _practice_id: input.practice_id,
        _name: input.name || undefined,
        _tenant_type: input.tenant_type || undefined,
        _city: input.city || undefined,
        _country: input.country || undefined,
        _subscription_tier: input.subscription_tier || undefined,
        _storage_limit_gb: input.storage_limit_gb ?? undefined,
        _revenue_share_pct: input.revenue_share_pct ?? undefined,
        _patient_limit: input.patient_limit ?? undefined,
        _member_limit: input.member_limit ?? undefined,
        _is_active: input.is_active ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Tenant updated');
      invalidateTenants();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update the tenant'),
  });
  /** Set or change a tenant's hospital code; reuses the availability-checked setter. */
  const setTenantSlug = useMutation({
    mutationFn: async ({ practiceId, slug }: { practiceId: string; slug: string }) => {
      const { data, error } = await supabase.rpc('set_institution_slug', {
        _practice_id: practiceId,
        _slug: slug,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success('Hospital code saved');
      invalidateTenants();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the hospital code'),
  });


  const inviteOwner = useMutation({
    mutationFn: async ({ practiceId, email }: { practiceId: string; email: string }) => {
      const { data, error } = await supabase.rpc('admin_invite_tenant_owner', {
        _practice_id: practiceId,
        _email: email,
      });
      if (error) throw error;
      const invitationId = data as string;

      // Deliver the invitation email; the record already exists if this fails.
      const { error: mailError } = await supabase.functions.invoke(
        'notify-tenant-owner-invite',
        { body: { invitation_id: invitationId } },
      );
      if (mailError) {
        toast.warning('Invitation created, but the email could not be sent');
      }
      return invitationId;
    },
    onSuccess: () => {
      toast.success('Owner invitation sent');
      invalidateTenants();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not send the invitation'),
  });

  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase.rpc('admin_cancel_tenant_invitation', {
        _invitation_id: invitationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Invitation cancelled');
      invalidateTenants();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not cancel the invitation'),
  });

  const grantAdmin = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.rpc('admin_grant_platform_admin', { _email: email });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Platform admin access granted');
      queryClient.invalidateQueries({ queryKey: ['admin-platform-admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-recent-actions'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not grant admin access'),
  });

  const revokeAdmin = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('admin_revoke_platform_admin', { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Platform admin access removed');
      queryClient.invalidateQueries({ queryKey: ['admin-platform-admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-recent-actions'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not remove admin access'),
  });

  return {
    admins: admins.data ?? [],
    isLoadingAdmins: admins.isLoading,
    invitations: invitations.data ?? [],
    isLoadingInvitations: invitations.isLoading,
    actions: actions.data ?? [],
    isLoadingActions: actions.isLoading,
    createTenant: createTenant.mutateAsync,
    isCreating: createTenant.isPending,
    updateTenant: updateTenant.mutateAsync,
    isUpdating: updateTenant.isPending,
    setTenantSlug: setTenantSlug.mutateAsync,
    isSavingSlug: setTenantSlug.isPending,

    inviteOwner: inviteOwner.mutateAsync,
    isInviting: inviteOwner.isPending,
    cancelInvitation: cancelInvitation.mutateAsync,
    grantAdmin: grantAdmin.mutateAsync,
    isGranting: grantAdmin.isPending,
    revokeAdmin: revokeAdmin.mutateAsync,
  };
}
