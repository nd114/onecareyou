import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type PracticeRole = 'owner' | 'admin' | 'provider' | 'staff';

export interface Practice {
  id: string;
  name: string;
  npi: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  logo_url: string | null;
  primary_color: string | null;
  subscription_tier: string;
  subscription_status: string;
  subscription_ends_at: string | null;
  patient_limit: number;
  member_limit: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface PracticeMember {
  id: string;
  practice_id: string;
  user_id: string;
  role: PracticeRole;
  can_invite_patients: boolean;
  can_invite_members: boolean;
  can_manage_billing: boolean;
  can_view_all_patients: boolean;
  can_manage_settings: boolean;
  status: string;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  // Joined data
  profile?: {
    name: string;
    email: string;
    avatar_url: string | null;
  };
  clinician_profile?: {
    title: string;
    first_name: string;
    last_name: string;
    specialty: string;
  };
}

export interface PracticeInvitation {
  id: string;
  practice_id: string;
  email: string;
  name: string | null;
  role: PracticeRole;
  invite_code: string;
  invited_by: string;
  status: string;
  expires_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  created_at: string;
}

export interface CreatePracticeData {
  name: string;
  npi?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}

export function usePractice() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get user's practice memberships
  const { data: memberships = [], isLoading: loadingMemberships } = useQuery({
    queryKey: ['practice-memberships', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase
        .from('practice_members' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active') as any);
      if (error) throw error;
      return (data || []) as PracticeMember[];
    },
    enabled: !!user,
  });

  // Get practices the user belongs to
  const { data: practices = [], isLoading: loadingPractices } = useQuery({
    queryKey: ['practices', user?.id],
    queryFn: async () => {
      if (!user || memberships.length === 0) return [];
      const practiceIds = memberships.map(m => m.practice_id);
      const { data, error } = await (supabase
        .from('practices' as any)
        .select('*')
        .in('id', practiceIds) as any);
      if (error) throw error;
      return (data || []) as Practice[];
    },
    enabled: !!user && memberships.length > 0,
  });

  // Get the user's current/primary practice (first one for now)
  const currentPractice = practices[0] || null;
  const currentMembership = memberships[0] || null;

  // Get members of a practice
  const usePracticeMembers = (practiceId: string) => {
    return useQuery({
      queryKey: ['practice-members', practiceId],
      queryFn: async () => {
        const { data, error } = await (supabase
          .from('practice_members' as any)
          .select('*')
          .eq('practice_id', practiceId)
          .order('role', { ascending: true }) as any);
        if (error) throw error;
        return (data || []) as PracticeMember[];
      },
      enabled: !!practiceId,
    });
  };

  // Get pending invitations for a practice
  const usePracticeInvitations = (practiceId: string) => {
    return useQuery({
      queryKey: ['practice-invitations', practiceId],
      queryFn: async () => {
        const { data, error } = await (supabase
          .from('practice_invitations' as any)
          .select('*')
          .eq('practice_id', practiceId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }) as any);
        if (error) throw error;
        return (data || []) as PracticeInvitation[];
      },
      enabled: !!practiceId,
    });
  };

  // Get invitations for the current user (by email)
  const { data: myInvitations = [], isLoading: loadingInvitations } = useQuery({
    queryKey: ['my-practice-invitations', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data, error } = await (supabase
        .from('practice_invitations' as any)
        .select('*')
        .eq('email', user.email)
        .eq('status', 'pending') as any);
      if (error) throw error;
      return (data || []) as PracticeInvitation[];
    },
    enabled: !!user?.email,
  });

  // Create a new practice
  const createPractice = useMutation({
    mutationFn: async (data: CreatePracticeData) => {
      if (!user) throw new Error('Not authenticated');
      const { data: practice, error } = await (supabase
        .from('practices' as any)
        .insert({ ...data, created_by: user.id })
        .select()
        .single() as any);
      if (error) throw error;
      return practice as Practice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      queryClient.invalidateQueries({ queryKey: ['practice-memberships'] });
      toast.success('Practice created successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create practice');
    },
  });

  // Update practice details
  const updatePractice = useMutation({
    mutationFn: async ({ practiceId, updates }: { practiceId: string; updates: Partial<Practice> }) => {
      const { error } = await (supabase
        .from('practices' as any)
        .update(updates)
        .eq('id', practiceId) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      toast.success('Practice updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update practice');
    },
  });

  // Invite a team member
  const inviteMember = useMutation({
    mutationFn: async ({ practiceId, email, name, role }: { 
      practiceId: string; 
      email: string; 
      name?: string;
      role: PracticeRole;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await (supabase
        .from('practice_invitations' as any)
        .insert({ 
          practice_id: practiceId, 
          email, 
          name,
          role,
          invited_by: user.id,
        })
        .select()
        .single() as any);
      if (error) throw error;
      return data as PracticeInvitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-invitations'] });
      toast.success('Invitation sent');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send invitation');
    },
  });

  // Accept an invitation
  const acceptInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!user) throw new Error('Not authenticated');
      
      // Get invitation details
      const { data: invitation, error: invError } = await (supabase
        .from('practice_invitations' as any)
        .select('*')
        .eq('id', invitationId)
        .single() as any);
      if (invError) throw invError;

      // Add as practice member
      const { error: memberError } = await (supabase
        .from('practice_members' as any)
        .insert({
          practice_id: invitation.practice_id,
          user_id: user.id,
          role: invitation.role,
          invited_by: invitation.invited_by,
          status: 'active',
          accepted_at: new Date().toISOString(),
        }) as any);
      if (memberError) throw memberError;

      // Update invitation status
      const { error: updateError } = await (supabase
        .from('practice_invitations' as any)
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitationId) as any);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      queryClient.invalidateQueries({ queryKey: ['practice-memberships'] });
      queryClient.invalidateQueries({ queryKey: ['my-practice-invitations'] });
      toast.success('You have joined the practice');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to accept invitation');
    },
  });

  // Decline an invitation
  const declineInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await (supabase
        .from('practice_invitations' as any)
        .update({ status: 'declined', declined_at: new Date().toISOString() })
        .eq('id', invitationId) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-practice-invitations'] });
      toast.success('Invitation declined');
    },
  });

  // Update member permissions
  const updateMember = useMutation({
    mutationFn: async ({ memberId, updates }: { memberId: string; updates: Partial<PracticeMember> }) => {
      const { error } = await (supabase
        .from('practice_members' as any)
        .update(updates)
        .eq('id', memberId) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-members'] });
      toast.success('Member updated');
    },
  });

  // Remove a member
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase
        .from('practice_members' as any)
        .delete()
        .eq('id', memberId) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-members'] });
      toast.success('Member removed');
    },
  });

  // Helper to check permissions
  const canManagePractice = currentMembership?.role === 'owner' || currentMembership?.role === 'admin';
  const isOwner = currentMembership?.role === 'owner';

  return {
    // Data
    practices,
    memberships,
    currentPractice,
    currentMembership,
    myInvitations,
    
    // Loading states
    isLoading: loadingMemberships || loadingPractices,
    loadingInvitations,
    
    // Queries for specific practice
    usePracticeMembers,
    usePracticeInvitations,
    
    // Mutations
    createPractice,
    updatePractice,
    inviteMember,
    acceptInvitation,
    declineInvitation,
    updateMember,
    removeMember,
    
    // Helpers
    hasPractice: practices.length > 0,
    canManagePractice,
    isOwner,
  };
}
