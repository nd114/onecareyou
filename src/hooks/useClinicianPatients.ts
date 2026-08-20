import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInstitutionAssignedPatients } from '@/hooks/usePracticeShares';
import { toast } from 'sonner';

interface SharePermissions {
  vitals: boolean;
  meds: boolean;
  adherence: boolean;
  profile: boolean;
  documents?: boolean;
  guidance?: boolean;
}

interface PatientIdentity {
  user_id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
}


/**
 * Where this relationship came from. Private is the patient's own Care Circle
 * share; hospital is a tenant's assignment. They are parallel and independent —
 * one never implies the other (consent model §2).
 */
export type PatientSource = 'private' | 'hospital';

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
  patient_phone: string | null;
  source: PatientSource;
  /** Set for hospital-assigned patients so panels can label which hospital. */
  hospital_id: string | null;
  hospital_name: string | null;
  /** Hospital relationships stay listed after a patient disconnects, marked. */
  share_active: boolean;
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
    // v3 key: identity now comes from get_patient_identity (name/contact are
    // always available to a connected clinician, per medical record policy).
    queryKey: ['clinician-patients-v3', user?.id],
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

      const shares = data || [];
      const patientUserIds = shares.map((share) => share.user_id).filter(Boolean);

      // Basic identity (name + contact) is always retrievable for a connected
      // patient — a clinician cannot manage a patient whose name or contact
      // details they don't have on file. Granular sharing still governs
      // vitals / medications / adherence.
      const identityMap = new Map<string, PatientIdentity>();
      if (patientUserIds.length > 0) {
        const { data: identities, error: identityError } = await (supabase as any).rpc(
          'get_patient_identity',
          { patient_ids: patientUserIds },
        );
        if (identityError) console.error('Failed to load patient identities', identityError);
        for (const row of (identities || []) as PatientIdentity[]) {
          identityMap.set(row.user_id, row);
        }
      }

      return shares.map((share) => {
        const identity = identityMap.get(share.user_id);
        return {
          ...share,
          permissions: share.permissions as unknown as SharePermissions,
          patient_name: identity?.name || identity?.email || 'Patient (name pending)',
          patient_email: identity?.email || null,
          patient_phone: identity?.phone_number || null,
          source: 'private' as const,
          hospital_id: null,
          hospital_name: null,
          share_active: true,
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
      queryClient.invalidateQueries({ queryKey: ['clinician-patients-v3'] });
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
        queryClient.invalidateQueries({ queryKey: ['clinician-patients-v3'] });
        toast.success(`Connected with ${count} new patient${count > 1 ? 's' : ''}`);
      }
    },
  });

  // Hospital-assigned patients are a second, independent pathway into the same
  // panel. They carry no provider_shares row, so they are shaped to match and
  // tagged by source rather than being folded in invisibly.
  const { assignedPatients, isLoading: isLoadingAssigned } = useInstitutionAssignedPatients();

  const institutionPatients: PatientShare[] = useMemo(
    () =>
      assignedPatients.map((a) => ({
        id: a.assignmentId,
        user_id: a.patientUserId,
        provider_name: a.practiceName,
        provider_email: null,
        // Synthetic, stable routing key — the detail page resolves patients out
        // of this same list, and an assignment has no invite code of its own.
        invite_code: `inst-${a.assignmentId}`,
        permissions: {
          vitals: a.shareAll || a.permissions.vitals === true,
          meds: a.shareAll || a.permissions.medications === true,
          // Adherence is dose history behind the medications the patient
          // shared, so it follows that category rather than a separate one.
          adherence: a.shareAll || a.permissions.medications === true,
          profile: true,
        },
        is_active: a.shareActive,
        created_at: a.assignedAt,
        last_accessed_at: null,
        expires_at: null,
        clinician_user_id: user?.id ?? null,
        clinician_notes: null,
        patient_name: a.patientName || a.patientEmail || 'Patient (name pending)',
        patient_email: a.patientEmail,
        patient_phone: a.patientPhone,
        source: 'hospital' as const,
        hospital_id: a.practiceId,
        hospital_name: a.practiceName,
        share_active: a.shareActive,
      })),
    [assignedPatients, user?.id],
  );

  const allPatients = useMemo(() => {
    // A patient may hold a private share AND be assigned at a hospital. Both
    // rows are kept: they are separate relationships with separate scopes.
    return [...patients, ...institutionPatients];
  }, [patients, institutionPatients]);

  return {
    patients: allPatients,
    privatePatients: patients,
    institutionPatients,
    isLoading: isLoading || isLoadingAssigned,
    error,
    claimShare,
    autoClaimShares,
  };
}
