import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveFamilyMember } from '@/contexts/FamilyContext';
import { toast } from 'sonner';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { cacheRead, getCachedRead } from '@/lib/offline';
import { isMedicationEditable } from '@/types/health';

export type Medication = Tables<'medications'>;
export type MedicationInsert = TablesInsert<'medications'>;
export type MedicationUpdate = TablesUpdate<'medications'>;

export const useMedications = () => {
  const { user } = useAuth();
  const { activeMemberId } = useActiveFamilyMember();
  const queryClient = useQueryClient();

  const medicationsQuery = useQuery({
    queryKey: ['medications', user?.id, activeMemberId],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const cacheKey = `medications:${user.id}:${activeMemberId ?? 'self'}`;

      let query = supabase
        .from('medications')
        .select('*')
        .eq('user_id', user.id);

      if (activeMemberId) {
        query = query.eq('family_member_id', activeMemberId);
      } else {
        query = query.is('family_member_id', null);
      }

      try {
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        const rows = (data as Medication[]) || [];
        void cacheRead(cacheKey, rows);
        return rows;
      } catch (err) {
        const cached = await getCachedRead<Medication[]>(cacheKey);
        if (cached?.payload) return cached.payload;
        throw err;
      }
    },
    enabled: !!user?.id,
  });

  const addMedication = useMutation({
    mutationFn: async (medication: Omit<MedicationInsert, 'user_id'>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('medications')
        .insert({
          family_member_id: activeMemberId,
          ...medication,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Create schedule entries for today based on times_of_day
      if (data && medication.times_of_day && Array.isArray(medication.times_of_day)) {
        const today = new Date().toISOString().split('T')[0];
        const scheduleEntries = (medication.times_of_day as string[]).map(time => ({
          user_id: user.id,
          medication_id: data.id,
          scheduled_time: `${today}T${time}:00`,
          status: 'pending' as const,
        }));
        
        if (scheduleEntries.length > 0) {
          await supabase.from('schedule_entries').insert(scheduleEntries);
        }
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule_entries', user?.id] });
      toast.success('Medication added successfully!');
    },
    onError: (error) => {
      console.error('Error adding medication:', error);
      toast.error('Failed to add medication');
    },
  });

  /**
   * The same rule vitals have had all along: a row that came from a hospital's
   * system is that system's record of what it prescribed, and editing it here
   * would make the two disagree with no way to tell which is right.
   *
   * The guard is in the mutation rather than only on the button, because the
   * button is not the only caller — the assistant can change a medication too.
   */
  const guardImported = (id: string, verb: 'change' | 'remove'): boolean => {
    const existing = medicationsQuery.data?.find((m) => m.id === id);
    if (existing && !isMedicationEditable(existing)) {
      toast.error(
        `This medication came from ${existing.source}, so you cannot ${verb} it here. ` +
          'Ask them to change it and it will update on the next sync.',
      );
      return false;
    }
    return true;
  };

  const updateMedication = useMutation({
    mutationFn: async ({ id, ...updates }: MedicationUpdate & { id: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      if (!guardImported(id, 'change')) throw new Error('IMPORTED_MEDICATION');

      const { data, error } = await supabase
        .from('medications')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications', user?.id] });
      toast.success('Medication updated successfully!');
    },
    onError: (error: Error) => {
      if (error.message === 'IMPORTED_MEDICATION') return; // The guard already said why.
      console.error('Error updating medication:', error);
      toast.error('Failed to update medication');
    },
  });

  const deleteMedication = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      if (!guardImported(id, 'remove')) throw new Error('IMPORTED_MEDICATION');

      // Upcoming reminders go; doses that have already come round do not. The
      // schedule policy enforces that too — this is just the tidy-up, and it is
      // deliberately not a blanket delete: erasing the doses that were due
      // would rewrite adherence to look as though nothing was missed.
      await supabase
        .from('schedule_entries')
        .delete()
        .eq('medication_id', id)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .gte('scheduled_time', new Date().toISOString());

      const { data, error } = await supabase
        .from('medications')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id');

      if (error) throw error;
      // Deleting is for something entered by mistake and never taken. Once a
      // dose has come round the row carries an adherence record, the policy
      // refuses, and a DELETE that matches nothing returns no error at all —
      // so without this the toast says "Deleted" over a medication still there.
      if (!data || data.length === 0) throw new Error('HAS_HISTORY');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications', user?.id] });
      toast.success('Medication deleted successfully!');
    },
    onError: (error: Error) => {
      if (error.message === 'IMPORTED_MEDICATION') return; // The guard already said why.
      if (error.message === 'HAS_HISTORY') {
        toast.error(
          'This medication has doses recorded against it, so it stays in your history. ' +
            'Stop it instead — it moves out of your current list and keeps the record of what you took.',
        );
        return;
      }
      console.error('Error deleting medication:', error);
      toast.error('Failed to delete medication');
    },
  });

  const discontinueMedication = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('medications')
        .update({
          is_active: false,
          end_date: today,
          discontinued_at: new Date().toISOString(),
          discontinuation_reason: reason || null,
        } as any)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['schedule_entries', user?.id] });
      toast.success('Medication discontinued. History preserved.');
    },
    onError: (error) => {
      console.error('Error discontinuing medication:', error);
      toast.error('Failed to discontinue medication');
    },
  });

  const getMedicationById = async (id: string) => {
    if (!user?.id) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('medications')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  return {
    medications: medicationsQuery.data || [],
    isLoading: medicationsQuery.isLoading,
    error: medicationsQuery.error,
    addMedication,
    updateMedication,
    deleteMedication,
    discontinueMedication,
    getMedicationById,
    refetch: medicationsQuery.refetch,
  };
};
