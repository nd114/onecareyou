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
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClinicianProfileData {
  practice_name?: string;
  specialty?: string;
  license_number?: string;
  country?: string;
}

export const useClinicianProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: clinicianProfile, isLoading, error } = useQuery({
    queryKey: ['clinician-profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('clinician_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as ClinicianProfile | null;
    },
    enabled: !!user,
  });

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

  const isClinician = !!clinicianProfile;

  return {
    clinicianProfile,
    isLoading,
    error,
    isClinician,
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
