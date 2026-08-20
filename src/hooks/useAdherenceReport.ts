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
import { summariseAdherence } from '@/lib/adherence';

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

      // One clock for the whole calculation, so the daily rows, the totals and
      // the previous-period comparison all agree about what has come due.
      const now = new Date();
      const endDate = now;
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

        // Scored on the doses that have come due. Dividing by every dose of
        // the day made today's bar start at zero each morning and climb, which
        // reads as a patient failing and recovering daily.
        const day = summariseAdherence(dayEntries, now);

        return {
          date: dateStr,
          dateLabel: format(date, 'EEE'),
          taken: day.taken,
          skipped: day.skipped,
          missed: day.missed,
          total: day.due,
          adherenceRate: day.rate ?? 0,
        };
      });

      // Calculate medication-level adherence
      const medicationData: MedicationAdherence[] = medications
        .filter(med => med.is_active || entries?.some(e => e.medication_id === med.id))
        .map(med => {
          const medEntries = (entries || []).filter(e => e.medication_id === med.id);
          // `missed` was every pending dose for this medicine, future ones
          // included, so a drug started yesterday looked mostly missed.
          const summary = summariseAdherence(medEntries, now);

          return {
            medicationId: med.id,
            medicationName: med.name,
            taken: summary.taken,
            skipped: summary.skipped,
            missed: summary.missed,
            total: summary.due,
            adherenceRate: summary.rate ?? 0,
          };
        })
        .filter(m => m.total > 0);

      // Overall, on the doses that have actually come due.
      const overall = summariseAdherence(entries || [], now);
      const totalDoses = overall.due;
      const takenDoses = overall.taken;
      const skippedDoses = overall.skipped;
      const missedDoses = overall.missed;
      const overallAdherence = overall.rate ?? 0;

      // Calculate week-over-week change (compare to previous period)
      const prevStartDate = subDays(startDate, days);
      const { data: prevEntries } = await supabase
        .from('schedule_entries')
        // scheduled_time as well as status: the comparison window is scored by
        // the same function, which needs to know when each dose was due.
        .select('status, scheduled_time')
        .eq('user_id', user.id)
        .gte('scheduled_time', startOfDay(prevStartDate).toISOString())
        .lt('scheduled_time', startOfDay(startDate).toISOString());

      // The previous window is wholly in the past, so every dose in it is due;
      // it goes through the same function anyway so the two halves of the
      // comparison are counted the same way.
      const previous = summariseAdherence(prevEntries || [], now);
      const weekOverWeekChange = overallAdherence - (previous.rate ?? 0);

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
