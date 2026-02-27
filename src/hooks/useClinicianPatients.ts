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

interface PatientProfile {
  name: string | null;
  email: string | null;
}

interface PatientShare {
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
  clinician_user_id: string | null;
  clinician_notes: string | null;
  patient_name: string;
  patient_email: string | null;
}

export function useClinicianPatients() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch patients that have shared with this clinician (via email match or claimed)
  const {
    data: patients = [],
    isLoading,
    error,
  } = useQuery({
    // v2 key to force a refetch after adding patient_name/patient_email fields
    queryKey: ['clinician-patients-v2', user?.id],
    queryFn: async () => {
      if (!user?.email) return [];

      // Fetch shares where either:
      // 1. clinician_user_id matches this user
      // 2. provider_email matches this user's email (unclaimed shares)
      const { data, error } = await supabase
        .from('provider_shares')
        .select('*')
        .eq('is_active', true)
        .or(`clinician_user_id.eq.${user.id},provider_email.eq.${user.email}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch patient profiles for each share
      const patientUserIds = (data || []).map(share => share.user_id).filter(Boolean);
      if (patientUserIds.length === 0) {
        return (data || []).map(share => ({
          ...share,
          permissions: share.permissions as unknown as SharePermissions,
          patient_name: 'Unknown Patient',
          patient_email: null,
        })) as PatientShare[];
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, email')
        .in('user_id', patientUserIds);
      
      const profileMap = new Map(
        (profiles || []).map(p => [p.user_id, p])
      );
      
      return (data || []).map(share => {
        const profile = profileMap.get(share.user_id);
        return {
          ...share,
          permissions: share.permissions as unknown as SharePermissions,
          patient_name: profile?.name || 'Unknown Patient',
          patient_email: profile?.email || null,
        };
      }) as PatientShare[];
    },
    enabled: !!user?.email,
  });

  // Claim a share that matches the clinician's email
  const claimShare = useMutation({
    mutationFn: async (shareId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('provider_shares')
        .update({ clinician_user_id: user.id })
        .eq('id', shareId)
        .is('clinician_user_id', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-patients-v2'] });
      toast.success('Patient connected successfully');
    },
    onError: (error) => {
      console.error('Error claiming share:', error);
      toast.error('Failed to connect patient');
    },
  });

  // Auto-claim any unclaimed shares matching the clinician's email
  const autoClaimShares = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('No email found');

      const { data: unclaimed, error: fetchError } = await supabase
        .from('provider_shares')
        .select('id')
        .eq('provider_email', user.email)
        .is('clinician_user_id', null)
        .eq('is_active', true);

      if (fetchError) throw fetchError;

      if (unclaimed && unclaimed.length > 0) {
        for (const share of unclaimed) {
          await supabase
            .from('provider_shares')
            .update({ clinician_user_id: user.id })
            .eq('id', share.id);
        }
        return unclaimed.length;
      }
      return 0;
    },
    onSuccess: (count) => {
      if (count > 0) {
        queryClient.invalidateQueries({ queryKey: ['clinician-patients-v2'] });
        toast.success(`Connected with ${count} new patient${count > 1 ? 's' : ''}`);
      }
    },
  });

  // Update clinician notes for a patient
  const updatePatientNotes = useMutation({
    mutationFn: async ({ shareId, notes }: { shareId: string; notes: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('provider_shares')
        .update({ clinician_notes: notes })
        .eq('id', shareId)
        .eq('clinician_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-patients-v2'] });
      toast.success('Patient notes saved');
    },
    onError: (error) => {
      console.error('Error updating notes:', error);
      toast.error('Failed to save notes');
    },
  });

  return {
    patients,
    isLoading,
    error,
    claimShare,
    autoClaimShares,
    updatePatientNotes,
  };
}
