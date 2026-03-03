import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PatientVitalsSummary {
  patientId: string;
  userId: string;
  vitals: {
    id: string;
    type: string;
    value: number;
    secondary_value?: number;
    unit: string;
    recorded_at: string;
  }[];
  adherenceRate?: number;
}

export function usePatientVitalsSummaries(patientUserIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['patient-vitals-summaries', patientUserIds],
    queryFn: async () => {
      if (!user || patientUserIds.length === 0) return [];

      // Fetch recent vitals for all patients (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: vitalsData, error: vitalsError } = await supabase
        .from('vitals')
        .select('id, user_id, type, value, secondary_value, unit, recorded_at')
        .in('user_id', patientUserIds)
        .gte('recorded_at', ninetyDaysAgo.toISOString())
        .order('recorded_at', { ascending: false });

      if (vitalsError) {
        console.error('Error fetching patient vitals:', vitalsError);
        throw vitalsError;
      }

      // Fetch adherence data (schedule entries for last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: scheduleData, error: scheduleError } = await supabase
        .from('schedule_entries')
        .select('user_id, status')
        .in('user_id', patientUserIds)
        .gte('scheduled_time', sevenDaysAgo.toISOString())
        .lte('scheduled_time', new Date().toISOString());

      if (scheduleError) {
        console.error('Error fetching schedule data:', scheduleError);
        // Non-fatal, continue without adherence data
      }

      // Calculate adherence rates per user
      const adherenceByUser: Record<string, number> = {};
      if (scheduleData) {
        const groupedSchedules: Record<string, { total: number; taken: number }> = {};
        
        scheduleData.forEach(entry => {
          if (!groupedSchedules[entry.user_id]) {
            groupedSchedules[entry.user_id] = { total: 0, taken: 0 };
          }
          groupedSchedules[entry.user_id].total++;
          if (entry.status === 'taken') {
            groupedSchedules[entry.user_id].taken++;
          }
        });

        Object.entries(groupedSchedules).forEach(([userId, data]) => {
          adherenceByUser[userId] = Math.round((data.taken / data.total) * 100);
        });
      }

      // Group vitals by patient
      const summaries: PatientVitalsSummary[] = patientUserIds.map(userId => ({
        patientId: userId,
        userId,
        vitals: (vitalsData || [])
          .filter(v => v.user_id === userId)
          .map(v => ({
            id: v.id,
            type: v.type,
            value: v.value,
            secondary_value: v.secondary_value || undefined,
            unit: v.unit,
            recorded_at: v.recorded_at,
          })),
        adherenceRate: adherenceByUser[userId],
      }));

      return summaries;
    },
    enabled: !!user && patientUserIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
