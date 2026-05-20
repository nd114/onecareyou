import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMedications } from './useMedications';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';

export interface DailyAdherence {
  date: string;
  dateLabel: string;
  taken: number;
  skipped: number;
  missed: number;
  total: number;
  adherenceRate: number;
}

export interface MedicationAdherence {
  medicationId: string;
  medicationName: string;
  taken: number;
  skipped: number;
  missed: number;
  total: number;
  adherenceRate: number;
}

export interface AdherenceReport {
  overallAdherence: number;
  totalDoses: number;
  takenDoses: number;
  skippedDoses: number;
  missedDoses: number;
  dailyData: DailyAdherence[];
  medicationData: MedicationAdherence[];
  weekOverWeekChange: number;
}

import { useActiveFamilyMember } from '@/contexts/FamilyContext';

export const useAdherenceReport = (days: number = 7) => {
  const { user, profile } = useAuth();
  const { medications } = useMedications();
  const { activeMemberId } = useActiveFamilyMember();

  // Adherence reports are only tracked for the primary account today.
  const isReportEnabled = (profile as any)?.weekly_adherence_report_enabled !== false;
  const familyScopeBlocks = activeMemberId !== null;

  const reportQuery = useQuery({
    queryKey: ['adherence_report', user?.id, activeMemberId, days],
    queryFn: async (): Promise<AdherenceReport> => {
      if (!user?.id) throw new Error('Not authenticated');

      const endDate = new Date();
      const startDate = subDays(endDate, days - 1);
      
      // Fetch all schedule entries for the date range
      const { data: entries, error } = await supabase
        .from('schedule_entries')
        .select('*')
        .eq('user_id', user.id)
        .gte('scheduled_time', startOfDay(startDate).toISOString())
        .lte('scheduled_time', endOfDay(endDate).toISOString());

      if (error) throw error;

      // Calculate daily adherence
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyData: DailyAdherence[] = dateRange.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayEntries = (entries || []).filter(e => 
          format(new Date(e.scheduled_time), 'yyyy-MM-dd') === dateStr
        );

        const taken = dayEntries.filter(e => e.status === 'taken').length;
        const skipped = dayEntries.filter(e => e.status === 'skipped').length;
        const pending = dayEntries.filter(e => e.status === 'pending').length;
        const total = dayEntries.length;
        
        // Consider past pending as missed
        const isPast = date < startOfDay(new Date());
        const missed = isPast ? pending : 0;
        
        return {
          date: dateStr,
          dateLabel: format(date, 'EEE'),
          taken,
          skipped,
          missed,
          total,
          adherenceRate: total > 0 ? Math.round((taken / total) * 100) : 0,
        };
      });

      // Calculate medication-level adherence
      const medicationData: MedicationAdherence[] = medications
        .filter(med => med.is_active || entries?.some(e => e.medication_id === med.id))
        .map(med => {
          const medEntries = (entries || []).filter(e => e.medication_id === med.id);
          const taken = medEntries.filter(e => e.status === 'taken').length;
          const skipped = medEntries.filter(e => e.status === 'skipped').length;
          const pending = medEntries.filter(e => e.status === 'pending').length;
          const total = medEntries.length;
          
          return {
            medicationId: med.id,
            medicationName: med.name,
            taken,
            skipped,
            missed: pending, // Simplification: pending in past = missed
            total,
            adherenceRate: total > 0 ? Math.round((taken / total) * 100) : 0,
          };
        })
        .filter(m => m.total > 0);

      // Calculate overall stats
      const totalDoses = (entries || []).length;
      const takenDoses = (entries || []).filter(e => e.status === 'taken').length;
      const skippedDoses = (entries || []).filter(e => e.status === 'skipped').length;
      const missedDoses = totalDoses - takenDoses - skippedDoses;
      const overallAdherence = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

      // Calculate week-over-week change (compare to previous period)
      const prevStartDate = subDays(startDate, days);
      const { data: prevEntries } = await supabase
        .from('schedule_entries')
        .select('status')
        .eq('user_id', user.id)
        .gte('scheduled_time', startOfDay(prevStartDate).toISOString())
        .lt('scheduled_time', startOfDay(startDate).toISOString());

      const prevTotal = (prevEntries || []).length;
      const prevTaken = (prevEntries || []).filter(e => e.status === 'taken').length;
      const prevAdherence = prevTotal > 0 ? Math.round((prevTaken / prevTotal) * 100) : 0;
      const weekOverWeekChange = overallAdherence - prevAdherence;

      return {
        overallAdherence,
        totalDoses,
        takenDoses,
        skippedDoses,
        missedDoses,
        dailyData,
        medicationData,
        weekOverWeekChange,
      };
    },
    enabled: !!user?.id && isReportEnabled && !familyScopeBlocks,
  });

  return {
    report: reportQuery.data,
    isLoading: reportQuery.isLoading,
    error: reportQuery.error,
    isReportEnabled,
    familyScopeBlocks,
    refetch: reportQuery.refetch,
  };
};
