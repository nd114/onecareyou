import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ClinicianProfile {
  id: string;
  user_id: string;
  practice_name: string | null;
  specialty: string | null;
  license_number: string | null;
  country: string | null;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClinicianProfileData {
  practice_name?: string;
  specialty?: string;
  license_number?: string;
  country?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
}

// Professional title prefixes
export const CLINICIAN_TITLES = [
  'Dr.',
  'Prof.',
  'Mr.',
  'Ms.',
  'Mrs.',
  'NP',
  'PA',
  'RN',
  'PharmD',
];

export const useClinicianProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // One query for "which side of the product is this person on", so a single
  // invalidation updates every route guard at once.
  //
  // Being clinician-side is not the same as holding a clinical profile. A
  // hospital's chief admin may never treat a patient, and someone invited to own
  // a tenant has no profile at all until they make one — yet both belong on the
  // clinician side. Deriving this from clinician_profiles alone sent them to the
  // patient dashboard and, worse, blocked /clinician/practice, which is the only
  // place the invitation can be accepted.
  const { data: staff, isLoading, error } = useQuery({
    queryKey: ['clinician-profile', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const [profileRes, membershipRes, inviteRes] = await Promise.all([
        supabase.from('clinician_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('practice_members')
          .select('practice_id, role, status, created_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: true }),
        (supabase as any).rpc('my_tenant_owner_invitations'),
      ]);

      if (profileRes.error) throw profileRes.error;

      const memberships = (membershipRes.data ?? []) as {
        practice_id: string;
        role: string;
      }[];
      const pendingInvites = (inviteRes?.data ?? []) as { practice_id: string }[];

      return {
        profile: profileRes.data as ClinicianProfile | null,
        memberships,
        pendingTenantInvites: pendingInvites,
      };
    },
    enabled: !!user,
  });

  const clinicianProfile = staff?.profile ?? null;
  const memberships = staff?.memberships ?? [];
  const pendingTenantInvites = staff?.pendingTenantInvites ?? [];
  const primaryMembership = memberships[0] ?? null;

  const createClinicianProfile = useMutation({
    mutationFn: async (data: CreateClinicianProfileData) => {
      if (!user) throw new Error('Not authenticated');

      const { data: newProfile, error } = await supabase
        .from('clinician_profiles')
        .insert({
          user_id: user.id,
          practice_name: data.practice_name || null,
          specialty: data.specialty || null,
          license_number: data.license_number || null,
          country: data.country || null,
          title: data.title || 'Dr.',
        })
        .select()
        .single();

      if (error) throw error;
      return newProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-profile'] });
      toast.success('Clinician profile created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create clinician profile');
    },
  });

  const updateClinicianProfile = useMutation({
    mutationFn: async (data: Partial<ClinicianProfile>) => {
      if (!user) throw new Error('Not authenticated');

      const { data: updated, error } = await supabase
        .from('clinician_profiles')
        .update(data)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-profile'] });
      toast.success('Clinician profile updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update clinician profile');
    },
  });

  /** Belongs on the clinician side of the product. */
  const isClinician =
    !!clinicianProfile || memberships.length > 0 || pendingTenantInvites.length > 0;

  /** Runs a hospital rather than a caseload — lands on Practice, not the inbox. */
  const isTenantAdmin =
    primaryMembership?.role === 'owner' ||
    primaryMembership?.role === 'admin' ||
    pendingTenantInvites.length > 0;

  return {
    clinicianProfile,
    isLoading,
    error,
    isClinician,
    isTenantAdmin,
    practiceRole: primaryMembership?.role ?? null,
    practiceId: primaryMembership?.practice_id ?? null,
    hasPendingTenantInvite: pendingTenantInvites.length > 0,
    createClinicianProfile,
    updateClinicianProfile,
  };
};

// Medical specialties list (alphabetically sorted)
export const MEDICAL_SPECIALTIES = [
  'Cardiology',
  'Dermatology',
  'Dietetics/Nutrition',
  'Emergency Medicine',
  'Endocrinology',
  'Family Medicine',
  'Gastroenterology',
  'General Practice',
  'Geriatrics',
  'Internal Medicine',
  'Nephrology',
  'Neurology',
  'Nursing',
  'Obstetrics & Gynecology',
  'Oncology',
  'Ophthalmology',
  'Orthopedics',
  'Pediatrics',
  'Pharmacy',
  'Physical Therapy',
  'Psychiatry',
  'Pulmonology',
  'Rheumatology',
  'Surgery',
  'Urology',
  'Other',
];
