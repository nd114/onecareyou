import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PatientInvitation {
  id: string;
  clinician_user_id: string;
  patient_email: string;
  patient_name: string | null;
  invite_code: string;
  status: 'pending' | 'accepted' | 'expired' | 'declined';
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  provider_share_id: string | null;
}

export function usePatientInvitations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch invitations sent by clinician
  const { data: sentInvitations = [], isLoading: loadingSent } = useQuery({
    queryKey: ['patient-invitations', 'sent', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase
        .from('patient_invitations' as any)
        .select('*')
        .eq('clinician_user_id', user.id)
        .order('created_at', { ascending: false }) as any);

      if (error) throw error;
      return (data || []) as PatientInvitation[];
    },
    enabled: !!user,
  });

  // Fetch invitations received by patient (matched by email)
  const { data: receivedInvitations = [], isLoading: loadingReceived } = useQuery({
    queryKey: ['patient-invitations', 'received', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data, error } = await (supabase
        .from('patient_invitations' as any)
        .select('*')
        .eq('patient_email', user.email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }) as any);

      if (error) throw error;
      return (data || []) as PatientInvitation[];
    },
    enabled: !!user?.email,
  });

  // Generate unique invite code
  const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Send invitation to patient
  const sendInvitation = useMutation({
    mutationFn: async ({ email, name }: { email: string; name?: string }) => {
      if (!user) throw new Error('Not authenticated');
      
      const inviteCode = generateInviteCode();
      
      const { data, error } = await (supabase
        .from('patient_invitations' as any)
        .insert({
          clinician_user_id: user.id,
          patient_email: email.toLowerCase().trim(),
          patient_name: name || null,
          invite_code: inviteCode,
        })
        .select()
        .single() as any);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-invitations'] });
      toast.success('Invitation sent successfully');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('An invitation has already been sent to this email');
      } else {
        toast.error('Failed to send invitation');
      }
    },
  });

  // Accept invitation (patient side)
  const acceptInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!user) throw new Error('Not authenticated');

      // First, get the invitation details
      const { data: invitation, error: fetchError } = await (supabase
        .from('patient_invitations' as any)
        .select('*')
        .eq('id', invitationId)
        .single() as any);

      if (fetchError) throw fetchError;
      const inv = invitation as PatientInvitation;

      // Get clinician's profile for provider name
      const { data: clinicianProfile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('user_id', inv.clinician_user_id)
        .single();

      // Create a provider share
      const shareInviteCode = `PS${Date.now().toString(36).toUpperCase()}`;
      const { data: share, error: shareError } = await supabase
        .from('provider_shares')
        .insert({
          user_id: user.id,
          provider_name: clinicianProfile?.name || 'Healthcare Provider',
          provider_email: clinicianProfile?.email,
          clinician_user_id: inv.clinician_user_id,
          invite_code: shareInviteCode,
          permissions: { vitals: true, meds: true, adherence: true, profile: false },
          is_active: true,
        })
        .select()
        .single();

      if (shareError) throw shareError;

      // Update invitation status
      const { error: updateError } = await (supabase
        .from('patient_invitations' as any)
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          provider_share_id: share.id,
        })
        .eq('id', invitationId) as any);

      if (updateError) throw updateError;

      // Log the action
      await (supabase.from('access_audit_logs' as any).insert({
        action: 'invitation_accepted',
        actor_user_id: user.id,
        target_user_id: inv.clinician_user_id,
        share_id: share.id,
        metadata: { invitation_id: invitationId },
      }) as any);

      return share;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['provider-shares'] });
      toast.success('Invitation accepted! Your data is now shared with this provider.');
    },
    onError: () => {
      toast.error('Failed to accept invitation');
    },
  });

  // Decline invitation
  const declineInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase
        .from('patient_invitations' as any)
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
        }) as any)
        .eq('id', invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-invitations'] });
      toast.success('Invitation declined');
    },
    onError: () => {
      toast.error('Failed to decline invitation');
    },
  });

  // Cancel invitation (clinician side)
  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase
        .from('patient_invitations' as any)
        .update({ status: 'expired' })
        .eq('id', invitationId) as any)
        .eq('clinician_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-invitations'] });
      toast.success('Invitation cancelled');
    },
    onError: () => {
      toast.error('Failed to cancel invitation');
    },
  });

  return {
    sentInvitations,
    receivedInvitations,
    isLoading: loadingSent || loadingReceived,
    sendInvitation,
    acceptInvitation,
    declineInvitation,
    cancelInvitation,
  };
}
