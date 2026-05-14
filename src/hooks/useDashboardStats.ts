import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export interface DashboardStats {
  adherenceRate: number | null;
  dailyDoses: number;
  healthMarkers: number;
  activeProviders: number;
  weeklyAdherence: number[];
}

export const useDashboardStats = () => {
  const { user } = useAuth();

  const statsQuery = useQuery({
    queryKey: ['dashboard_stats', user?.id],
    queryFn: async (): Promise<DashboardStats> => {
      if (!user?.id) throw new Error('Not authenticated');

      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();
      const weekAgo = subDays(today, 7);

      // Fetch today's schedule entries
      const { data: todayEntries, error: scheduleError } = await supabase
        .from('schedule_entries')
        .select('status')
        .eq('user_id', user.id)
        .gte('scheduled_time', dayStart)
        .lte('scheduled_time', dayEnd);

      if (scheduleError) throw scheduleError;

      // Fetch last 7 days for adherence tracking
      const { data: weekEntries, error: weekError } = await supabase
        .from('schedule_entries')
        .select('status, scheduled_time')
        .eq('user_id', user.id)
        .gte('scheduled_time', weekAgo.toISOString())
        .lte('scheduled_time', dayEnd);

      if (weekError) throw weekError;

      // Fetch unique vital types recorded
      const { data: vitals, error: vitalsError } = await supabase
        .from('vitals')
        .select('type')
        .eq('user_id', user.id);

      if (vitalsError) throw vitalsError;

      // Fetch active provider shares (matches Care Circle)
      const nowIso = new Date().toISOString();
      const { data: shares, error: sharesError } = await supabase
        .from('provider_shares')
        .select('id, expires_at')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (sharesError) throw sharesError;
      const activeProviders = (shares ?? []).filter(
        (s) => !s.expires_at || s.expires_at > nowIso,
      ).length;

      // Calculate stats
      const dailyDoses = todayEntries?.length || 0;
      const takenToday = todayEntries?.filter(e => e.status === 'taken').length || 0;
      const todayAdherence = dailyDoses > 0 ? Math.round((takenToday / dailyDoses) * 100) : 100;

      // Weekly adherence by day
      const weeklyAdherence: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = subDays(today, i);
        const dayStartTime = startOfDay(day).getTime();
        const dayEndTime = endOfDay(day).getTime();
        
        const dayEntries = weekEntries?.filter(e => {
          const entryTime = new Date(e.scheduled_time).getTime();
          return entryTime >= dayStartTime && entryTime <= dayEndTime;
        }) || [];
        
        const dayTaken = dayEntries.filter(e => e.status === 'taken').length;
        const dayTotal = dayEntries.length;
        weeklyAdherence.push(dayTotal > 0 ? Math.round((dayTaken / dayTotal) * 100) : 100);
      }

      // Calculate overall adherence rate (last 7 days). Null when no scheduled
      // entries exist in the window so the UI can show "—" instead of 0%.
      const totalWeekEntries = weekEntries?.length || 0;
      const totalWeekTaken = weekEntries?.filter(e => e.status === 'taken').length || 0;
      const adherenceRate = totalWeekEntries > 0
        ? Math.round((totalWeekTaken / totalWeekEntries) * 100)
        : null;

      // Unique vital types
      const uniqueVitalTypes = new Set(vitals?.map(v => v.type) || []);

      return {
        adherenceRate,
        dailyDoses,
        healthMarkers: uniqueVitalTypes.size,
        activeProviders,
        weeklyAdherence,
      };
    },
    enabled: !!user?.id,
    staleTime: 30000, // Cache for 30 seconds
  });

  return {
    stats: statsQuery.data || {
      adherenceRate: null,
      dailyDoses: 0,
      healthMarkers: 0,
      activeProviders: 0,
      weeklyAdherence: [0, 0, 0, 0, 0, 0, 0],
    },
    isLoading: statsQuery.isLoading,
    error: statsQuery.error,
    refetch: statsQuery.refetch,
  };
};
