import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AlertRule {
  id: string;
  clinician_user_id: string;
  patient_user_id: string;
  share_id: string | null;
  vital_type: string;
  condition: 'above' | 'below' | 'outside_range';
  threshold_value: number;
  threshold_secondary: number | null;
  alert_method: 'email' | 'sms' | 'push';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertRuleData {
  patient_user_id: string;
  share_id?: string;
  vital_type: string;
  condition: string;
  threshold_value: number;
  threshold_secondary?: number;
  alert_method?: string;
}

export interface AlertLog {
  id: string;
  rule_id: string | null;
  vital_id: string | null;
  patient_user_id: string;
  clinician_user_id: string;
  alert_type: string;
  message: string | null;
  sent_at: string;
  acknowledged_at: string | null;
  created_at: string;
}

export const useAlertRules = (patientUserId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch alert rules created by clinician
  const { data: alertRules = [], isLoading: isLoadingRules } = useQuery({
    queryKey: ['alert-rules', user?.id, patientUserId],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('clinician_alert_rules')
        .select('*')
        .eq('clinician_user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (patientUserId) {
        query = query.eq('patient_user_id', patientUserId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as AlertRule[];
    },
    enabled: !!user,
  });

  // Fetch alert logs
  const { data: alertLogs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['alert-logs', user?.id, patientUserId],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('alert_logs')
        .select('*')
        .or(`clinician_user_id.eq.${user.id},patient_user_id.eq.${user.id}`)
        .order('sent_at', { ascending: false })
        .limit(50);
      
      if (patientUserId) {
        query = query.eq('patient_user_id', patientUserId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as AlertLog[];
    },
    enabled: !!user,
  });

  const createAlertRule = useMutation({
    mutationFn: async (data: CreateAlertRuleData) => {
      if (!user) throw new Error('Not authenticated');

      const { data: newRule, error } = await supabase
        .from('clinician_alert_rules')
        .insert({
          clinician_user_id: user.id,
          patient_user_id: data.patient_user_id,
          share_id: data.share_id || null,
          vital_type: data.vital_type,
          condition: data.condition,
          threshold_value: data.threshold_value,
          threshold_secondary: data.threshold_secondary || null,
          alert_method: data.alert_method || 'email',
        })
        .select()
        .single();

      if (error) throw error;
      return newRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Alert rule created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create alert rule');
    },
  });

  const updateAlertRule = useMutation({
    mutationFn: async ({ id, ...data }: Partial<AlertRule> & { id: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: updated, error } = await supabase
        .from('clinician_alert_rules')
        .update(data)
        .eq('id', id)
        .eq('clinician_user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Alert rule updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update alert rule');
    },
  });

  const deleteAlertRule = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('clinician_alert_rules')
        .delete()
        .eq('id', id)
        .eq('clinician_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Alert rule removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove alert rule');
    },
  });

  const toggleAlertRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: updated, error } = await supabase
        .from('clinician_alert_rules')
        .update({ is_active })
        .eq('id', id)
        .eq('clinician_user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success(variables.is_active ? 'Alert rule enabled' : 'Alert rule disabled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle alert rule');
    },
  });

  const acknowledgeAlertLog = useMutation({
    mutationFn: async (logId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('alert_logs')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', logId)
        .eq('clinician_user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-logs'] });
      toast.success('Alert acknowledged');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to acknowledge alert');
    },
  });

  return {
    alertRules,
    alertLogs,
    isLoading: isLoadingRules || isLoadingLogs,
    createAlertRule,
    updateAlertRule,
    deleteAlertRule,
    toggleAlertRule,
    acknowledgeAlertLog,
  };
};
