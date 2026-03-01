import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PendingClinicianRecord {
  id: string;
  clinician_user_id: string;
  patient_name: string;
  data_sharing_model: string;
  allergies: string[];
  health_conditions: string[];
  medications: { name: string; dosage?: string; frequency?: string }[];
  notes: string | null;
  clinician_name?: string;
  clinician_practice?: string;
}

export function usePendingClinicianRecords() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-clinician-records', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];

      // Find clinician_patient_records that match this patient's email
      // and haven't been linked yet
      const { data, error } = await supabase
        .from('clinician_patient_records')
        .select('*')
        .eq('patient_email', user.email)
        .is('linked_user_id', null)
        .in('invitation_status', ['not_invited', 'invited']);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Fetch clinician names
      const clinicianIds = [...new Set(data.map(r => r.clinician_user_id))];
      const { data: clinicians } = await supabase
        .from('clinician_profiles')
        .select('user_id, first_name, last_name, title, practice_name')
        .in('user_id', clinicianIds);

      const clinicianMap = new Map(
        (clinicians || []).map(c => [c.user_id, c])
      );

      return data.map(record => {
        const clinician = clinicianMap.get(record.clinician_user_id);
        return {
          id: record.id,
          clinician_user_id: record.clinician_user_id,
          patient_name: record.patient_name,
          data_sharing_model: record.data_sharing_model,
          allergies: (record.allergies as any) || [],
          health_conditions: (record.health_conditions as any) || [],
          medications: (record.medications as any) || [],
          notes: record.notes,
          clinician_name: clinician
            ? `${clinician.title || ''} ${clinician.first_name || ''} ${clinician.last_name || ''}`.trim()
            : 'A healthcare provider',
          clinician_practice: clinician?.practice_name || undefined,
        } as PendingClinicianRecord;
      });
    },
    enabled: !!user?.email,
  });
}
