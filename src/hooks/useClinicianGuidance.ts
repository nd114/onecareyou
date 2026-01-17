import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ClinicianGuidance {
  id: string;
  clinician_user_id: string;
  patient_user_id: string;
  share_id: string | null;
  title: string;
  instruction: string;
  category: 'medication' | 'lifestyle' | 'monitoring' | 'appointment' | 'general';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  due_date: string | null;
  status: 'pending' | 'acknowledged' | 'completed' | 'dismissed';
  acknowledged_at: string | null;
  completed_at: string | null;
  auto_resend_enabled: boolean;
  resend_interval_hours: number;
  last_resent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGuidanceData {
  patient_user_id: string;
  share_id?: string;
  title: string;
  instruction: string;
  category?: string;
  priority?: string;
  due_date?: string;
  auto_resend_enabled?: boolean;
  resend_interval_hours?: number;
}

export const useClinicianGuidance = (patientUserId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch guidance created by clinician (for clinician view)
  const { data: clinicianGuidance = [], isLoading: isLoadingClinician } = useQuery({
    queryKey: ['clinician-guidance', 'clinician', user?.id, patientUserId],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('clinician_guidance')
        .select('*')
        .eq('clinician_user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (patientUserId) {
        query = query.eq('patient_user_id', patientUserId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ClinicianGuidance[];
    },
    enabled: !!user,
  });

  // Fetch guidance for patient (for patient view)
  const { data: patientGuidance = [], isLoading: isLoadingPatient } = useQuery({
    queryKey: ['clinician-guidance', 'patient', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('clinician_guidance')
        .select('*')
        .eq('patient_user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ClinicianGuidance[];
    },
    enabled: !!user,
  });

  const createGuidance = useMutation({
    mutationFn: async (data: CreateGuidanceData) => {
      if (!user) throw new Error('Not authenticated');

      const { data: newGuidance, error } = await supabase
        .from('clinician_guidance')
        .insert({
          clinician_user_id: user.id,
          patient_user_id: data.patient_user_id,
          share_id: data.share_id || null,
          title: data.title,
          instruction: data.instruction,
          category: data.category || 'general',
          priority: data.priority || 'normal',
          due_date: data.due_date || null,
          auto_resend_enabled: data.auto_resend_enabled || false,
          resend_interval_hours: data.resend_interval_hours || 24,
        })
        .select()
        .single();

      if (error) throw error;
      return newGuidance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-guidance'] });
      toast.success('Guidance sent to patient');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send guidance');
    },
  });

  const updateGuidance = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ClinicianGuidance> & { id: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: updated, error } = await supabase
        .from('clinician_guidance')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-guidance'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update guidance');
    },
  });

  // Patient acknowledges guidance
  const acknowledgeGuidance = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: updated, error } = await supabase
        .from('clinician_guidance')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('patient_user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-guidance'] });
      toast.success('Guidance acknowledged');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to acknowledge guidance');
    },
  });

  // Patient completes guidance
  const completeGuidance = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: updated, error } = await supabase
        .from('clinician_guidance')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('patient_user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-guidance'] });
      toast.success('Guidance marked as completed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete guidance');
    },
  });

  const deleteGuidance = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_guidance')
        .delete()
        .eq('id', id)
        .eq('clinician_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-guidance'] });
      toast.success('Guidance removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove guidance');
    },
  });

  const pendingGuidance = patientGuidance.filter(g => g.status === 'pending');
  const pendingCount = pendingGuidance.length;

  return {
    clinicianGuidance,
    patientGuidance,
    pendingGuidance,
    pendingCount,
    isLoading: isLoadingClinician || isLoadingPatient,
    createGuidance,
    updateGuidance,
    acknowledgeGuidance,
    completeGuidance,
    deleteGuidance,
  };
};
