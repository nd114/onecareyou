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
  /** Soft delete: archived rules stop firing but stay on the record. */
  archived_at: string | null;
  /** Optional human name, e.g. "Post-discharge BP watch". */
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkAlertRuleResult {
  created: number;
  replaced: number;
  failed: { patientUserId: string; message: string }[];
}

export interface CreateAlertRuleData {
  patient_user_id: string;
  share_id?: string;
  vital_type: string;
  condition: string;
  threshold_value: number;
  threshold_secondary?: number;
  alert_method?: string;
  label?: string;
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
          label: data.label?.trim() || null,
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

  /**
   * One threshold across a group of patients.
   *
   * A clinician watching thirty hypertensives wants "tell me if any systolic
   * goes over 150", not thirty visits to the same dialog. Creating them one at
   * a time is how thresholds end up inconsistent across a panel — which is
   * worse than having none, because the gaps are invisible.
   *
   * Applying to a patient who already has a rule for that vital replaces it
   * rather than adding a second. Two thresholds on one measurement is not a
   * refinement, it is two alerts firing for the same reading.
   *
   * One patient failing does not abandon the rest — a partial result is
   * reported, naming who was missed, so the clinician can see the gap rather
   * than assume the panel is covered.
   */
  const createAlertRulesForPatients = useMutation({
    mutationFn: async (
      input: Omit<CreateAlertRuleData, 'patient_user_id' | 'share_id'> & {
        patients: { user_id: string; share_id?: string | null }[];
      },
    ): Promise<BulkAlertRuleResult> => {
      if (!user) throw new Error('Not authenticated');
      const result: BulkAlertRuleResult = { created: 0, replaced: 0, failed: [] };

      for (const patient of input.patients) {
        try {
          const { data: existing, error: findError } = await supabase
            .from('clinician_alert_rules')
            .select('id')
            .eq('clinician_user_id', user.id)
            .eq('patient_user_id', patient.user_id)
            .eq('vital_type', input.vital_type);
          if (findError) throw findError;

          const payload = {
            clinician_user_id: user.id,
            patient_user_id: patient.user_id,
            share_id: patient.share_id || null,
            vital_type: input.vital_type,
            condition: input.condition,
            threshold_value: input.threshold_value,
            threshold_secondary: input.threshold_secondary ?? null,
            alert_method: input.alert_method || 'email',
            is_active: true,
          };

          if (existing && existing.length > 0) {
            const { error } = await supabase
              .from('clinician_alert_rules')
              .update(payload)
              .eq('id', existing[0].id);
            if (error) throw error;
            result.replaced += 1;
          } else {
            const { error } = await supabase.from('clinician_alert_rules').insert(payload);
            if (error) throw error;
            result.created += 1;
          }
        } catch (error) {
          result.failed.push({
            patientUserId: patient.user_id,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      const applied = result.created + result.replaced;
      if (result.failed.length === 0) {
        toast.success(
          `Alert set for ${applied} patient${applied === 1 ? '' : 's'}` +
            (result.replaced ? ` (${result.replaced} replaced an existing threshold)` : ''),
        );
      } else {
        // Naming the shortfall matters more than the success count: a clinician
        // who thinks the panel is covered will not go looking.
        toast.warning(
          `Set for ${applied}, failed for ${result.failed.length}. The ones that failed have no threshold.`,
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to set alerts');
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

  /**
   * Archiving, not deleting.
   *
   * A threshold that fired is part of how a patient was managed; erasing it
   * erases the reason an alert exists in the log. Archiving stops the rule
   * firing and takes it out of the working list while keeping it recoverable.
   */
  const archiveAlertRule = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('clinician_alert_rules')
        .update({
          archived_at: archived ? new Date().toISOString() : null,
          // An archived rule must not keep firing.
          ...(archived ? { is_active: false } : {}),
        })
        .eq('id', id)
        .eq('clinician_user_id', user.id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success(variables.archived ? 'Rule archived' : 'Rule restored');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to archive rule');
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
      // Today's queue reads the same rows under its own key. Without this it
      // kept showing an alert that had just been acknowledged until its own
      // sixty-second poll came round — so the thing you had just dealt with
      // was still sitting there asking to be dealt with.
      queryClient.invalidateQueries({ queryKey: ['triage-alerts'] });
      toast.success('Alert acknowledged');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to acknowledge alert');
    },
  });

  const activeRules = alertRules.filter((r) => !r.archived_at);
  const archivedRules = alertRules.filter((r) => !!r.archived_at);

  return {
    /** Working set — archived rules excluded. */
    alertRules: activeRules,
    /** Every rule including archived ones, for management views. */
    allAlertRules: alertRules,
    archivedRules,
    alertLogs,
    isLoading: isLoadingRules || isLoadingLogs,
    createAlertRule,
    createAlertRulesForPatients,
    updateAlertRule,
    deleteAlertRule,
    toggleAlertRule,
    archiveAlertRule,
    acknowledgeAlertLog,
  };
};
