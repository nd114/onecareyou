import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface GuidanceItem {
  id: string;
  title: string;
  instruction: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  due_date: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  clinician_user_id: string;
  clinician_name?: string;
  clinician_title?: string;
  clinician_specialty?: string;
  clinician_practice?: string;
}

export function usePatientGuidance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: guidance = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['patient-guidance', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Fetch guidance for this patient
      const { data, error } = await supabase
        .from('clinician_guidance')
        .select('*')
        .eq('patient_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch clinician names from profiles table
      const clinicianIds = [...new Set((data || []).map(g => g.clinician_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', clinicianIds);

      // Fetch clinician profiles for specialty, practice name, and title
      // Use the restricted public view to avoid exposing sensitive data like license numbers
      const { data: clinicianProfiles } = await supabase
        .from('clinician_profiles_public' as any)
        .select('user_id, specialty, practice_name, title')
        .in('user_id', clinicianIds) as unknown as { 
          data: { user_id: string; specialty: string | null; practice_name: string | null; title: string | null }[] | null 
        };

      const profileMap = new Map(
        (profiles || []).map(p => [p.user_id, p.name])
      );

      const clinicianProfileMap = new Map(
        (clinicianProfiles || []).map(p => [p.user_id, { specialty: p.specialty, practice_name: p.practice_name, title: p.title }])
      );

      return (data || []).map(item => {
        const clinicianInfo = clinicianProfileMap.get(item.clinician_user_id);
        return {
          ...item,
          clinician_name: profileMap.get(item.clinician_user_id) || 'Healthcare Provider',
          clinician_title: clinicianInfo?.title || 'Dr.',
          clinician_specialty: clinicianInfo?.specialty || undefined,
          clinician_practice: clinicianInfo?.practice_name || undefined,
        };
      }) as GuidanceItem[];
    },
    enabled: !!user?.id,
  });

  const acknowledgeGuidance = useMutation({
    mutationFn: async (guidanceId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_guidance')
        .update({ 
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', guidanceId)
        .eq('patient_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-guidance'] });
      toast.success('Instruction acknowledged');
    },
    onError: (error) => {
      console.error('Error acknowledging guidance:', error);
      toast.error('Failed to acknowledge instruction');
    },
  });

  const completeGuidance = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_guidance')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('patient_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-guidance'] });
      toast.success('Instruction marked as complete');
    },
    onError: (error) => {
      console.error('Error completing guidance:', error);
      toast.error('Failed to complete instruction');
    },
  });

  return {
    guidance,
    isLoading,
    error,
    acknowledgeGuidance,
    completeGuidance,
  };
}
