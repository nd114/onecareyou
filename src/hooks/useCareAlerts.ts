import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CareAlertSetting {
  id: string;
  user_id: string;
  family_member_id: string | null;
  alert_recipient_email: string;
  alert_recipient_name: string;
  missed_dose_threshold: number;
  is_active: boolean;
  notify_by_email: boolean;
  notify_by_push: boolean;
  last_alert_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CareAlertLog {
  id: string;
  setting_id: string;
  user_id: string;
  recipient_email: string;
  missed_count: number;
  message: string | null;
  sent_at: string;
}

export function useCareAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: alertSettings = [], isLoading: loadingSettings } = useQuery({
    queryKey: ['care-alert-settings'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('care_alert_settings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CareAlertSetting[];
    },
    enabled: !!user,
  });

  const { data: alertLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['care-alert-logs'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('care_alert_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as CareAlertLog[];
    },
    enabled: !!user,
  });

  const createAlertSetting = useMutation({
    mutationFn: async (setting: Omit<CareAlertSetting, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_alert_sent_at'>) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('care_alert_settings')
        .insert({
          ...setting,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['care-alert-settings'] });
      toast.success('Care alert created');
    },
    onError: (error) => {
      console.error('Create alert error:', error);
      toast.error('Failed to create care alert');
    },
  });

  const updateAlertSetting = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CareAlertSetting> & { id: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('care_alert_settings')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['care-alert-settings'] });
      toast.success('Care alert updated');
    },
    onError: (error) => {
      console.error('Update alert error:', error);
      toast.error('Failed to update care alert');
    },
  });

  const deleteAlertSetting = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('care_alert_settings')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['care-alert-settings'] });
      toast.success('Care alert deleted');
    },
    onError: (error) => {
      console.error('Delete alert error:', error);
      toast.error('Failed to delete care alert');
    },
  });

  const toggleAlertSetting = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('care_alert_settings')
        .update({ is_active: isActive })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['care-alert-settings'] });
    },
    onError: (error) => {
      console.error('Toggle alert error:', error);
      toast.error('Failed to toggle care alert');
    },
  });

  return {
    alertSettings,
    alertLogs,
    loadingSettings,
    loadingLogs,
    createAlertSetting,
    updateAlertSetting,
    deleteAlertSetting,
    toggleAlertSetting,
  };
}
