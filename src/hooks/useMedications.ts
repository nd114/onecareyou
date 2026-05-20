import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveFamilyMember } from '@/contexts/FamilyContext';
import { toast } from 'sonner';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

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

      let query = supabase
        .from('medications')
        .select('*')
        .eq('user_id', user.id);

      if (activeMemberId) {
        query = query.eq('family_member_id', activeMemberId);
      } else {
        query = query.is('family_member_id', null);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data as Medication[];
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

  const updateMedication = useMutation({
    mutationFn: async ({ id, ...updates }: MedicationUpdate & { id: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

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
    onError: (error) => {
      console.error('Error updating medication:', error);
      toast.error('Failed to update medication');
    },
  });

  const deleteMedication = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      // First delete related schedule entries
      await supabase
        .from('schedule_entries')
        .delete()
        .eq('medication_id', id)
        .eq('user_id', user.id);

      const { error } = await supabase
        .from('medications')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications', user?.id] });
      toast.success('Medication deleted successfully!');
    },
    onError: (error) => {
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
