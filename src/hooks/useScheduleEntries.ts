import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useMedications, Medication } from './useMedications';
import { startOfDay, endOfDay, format, parseISO, isToday } from 'date-fns';

export type ScheduleEntry = Tables<'schedule_entries'>;
export type ScheduleEntryInsert = TablesInsert<'schedule_entries'>;
export type ScheduleEntryUpdate = TablesUpdate<'schedule_entries'>;

export interface ScheduleEntryWithMedication extends ScheduleEntry {
  medication: Medication | null;
}

export const useScheduleEntries = (date?: Date) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { medications } = useMedications();

  const targetDate = date || new Date();

  const scheduleQuery = useQuery({
    queryKey: ['schedule_entries', user?.id, format(targetDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const dayStart = startOfDay(targetDate).toISOString();
      const dayEnd = endOfDay(targetDate).toISOString();

      const { data, error } = await supabase
        .from('schedule_entries')
        .select('*')
        .eq('user_id', user.id)
        .gte('scheduled_time', dayStart)
        .lte('scheduled_time', dayEnd)
        .order('scheduled_time', { ascending: true });

      if (error) throw error;
      return data as ScheduleEntry[];
    },
    enabled: !!user?.id,
  });

  // Merge schedule entries with medication data
  const entriesWithMedications: ScheduleEntryWithMedication[] = (scheduleQuery.data || []).map(entry => ({
    ...entry,
    medication: medications.find(m => m.id === entry.medication_id) || null,
  }));

  const markAsTaken = useMutation({
    mutationFn: async (entryId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('schedule_entries')
        .update({
          status: 'taken',
          taken_at: new Date().toISOString(),
        })
        .eq('id', entryId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_entries', user?.id] });
      toast.success('Marked as taken!');
    },
    onError: (error) => {
      console.error('Error marking as taken:', error);
      toast.error('Failed to update');
    },
  });

  const markAsSkipped = useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason?: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('schedule_entries')
        .update({
          status: 'skipped',
          skipped_reason: reason || null,
        })
        .eq('id', entryId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_entries', user?.id] });
      toast.success('Marked as skipped');
    },
    onError: (error) => {
      console.error('Error marking as skipped:', error);
      toast.error('Failed to update');
    },
  });

  const addScheduleEntry = useMutation({
    mutationFn: async (entry: Omit<ScheduleEntryInsert, 'user_id'>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('schedule_entries')
        .insert({
          ...entry,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_entries', user?.id] });
    },
    onError: (error) => {
      console.error('Error adding schedule entry:', error);
      toast.error('Failed to add schedule entry');
    },
  });

  // Calculate statistics
  const pending = entriesWithMedications.filter(e => e.status === 'pending');
  const taken = entriesWithMedications.filter(e => e.status === 'taken');
  const skipped = entriesWithMedications.filter(e => e.status === 'skipped');
  const total = entriesWithMedications.length;
  const adherenceRate = total > 0 ? Math.round((taken.length / total) * 100) : 0;

  return {
    entries: entriesWithMedications,
    pending,
    taken,
    skipped,
    total,
    adherenceRate,
    isLoading: scheduleQuery.isLoading,
    error: scheduleQuery.error,
    markAsTaken,
    markAsSkipped,
    addScheduleEntry,
    refetch: scheduleQuery.refetch,
  };
};
