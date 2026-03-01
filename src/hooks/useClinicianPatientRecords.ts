import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ClinicianPatientRecord {
  id: string;
  clinician_user_id: string;
  practice_id: string | null;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  allergies: string[];
  health_conditions: string[];
  blood_type: string | null;
  medications: { name: string; dosage?: string; frequency?: string }[];
  vitals_history: any[];
  notes: string | null;
  tags: string[];
  linked_user_id: string | null;
  provider_share_id: string | null;
  invitation_status: string;
  data_sharing_model: string;
  import_source: string;
  created_at: string;
  updated_at: string;
}

export function useClinicianPatientRecords() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: records = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['clinician-patient-records', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('clinician_patient_records')
        .select('*')
        .eq('clinician_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(record => ({
        ...record,
        allergies: (record.allergies as any) || [],
        health_conditions: (record.health_conditions as any) || [],
        medications: (record.medications as any) || [],
        vitals_history: (record.vitals_history as any) || [],
        tags: (record.tags as any) || [],
      })) as ClinicianPatientRecord[];
    },
    enabled: !!user?.id,
  });

  const addRecord = useMutation({
    mutationFn: async (record: Omit<ClinicianPatientRecord, 'id' | 'clinician_user_id' | 'created_at' | 'updated_at'>) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_patient_records')
        .insert({
          ...record,
          clinician_user_id: user.id,
        } as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-patient-records'] });
      toast.success('Patient record added');
    },
    onError: (error) => {
      console.error('Error adding record:', error);
      toast.error('Failed to add patient record');
    },
  });

  const updateRecord = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ClinicianPatientRecord> & { id: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_patient_records')
        .update(updates as any)
        .eq('id', id)
        .eq('clinician_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-patient-records'] });
      toast.success('Patient record updated');
    },
    onError: (error) => {
      console.error('Error updating record:', error);
      toast.error('Failed to update patient record');
    },
  });

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_patient_records')
        .delete()
        .eq('id', id)
        .eq('clinician_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinician-patient-records'] });
      toast.success('Patient record deleted');
    },
    onError: (error) => {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete patient record');
    },
  });

  const importRecords = useMutation({
    mutationFn: async (payload: {
      records: any[];
      data_sharing_model: string;
      import_source: string;
      practice_id?: string;
      send_invitations?: boolean;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('import-patient-records', {
        body: payload,
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clinician-patient-records'] });
      toast.success(`Imported ${data.imported} patients (${data.duplicates} duplicates skipped)`);
    },
    onError: (error) => {
      console.error('Import error:', error);
      toast.error('Failed to import patient records');
    },
  });

  return {
    records,
    isLoading,
    error,
    addRecord,
    updateRecord,
    deleteRecord,
    importRecords,
  };
}
