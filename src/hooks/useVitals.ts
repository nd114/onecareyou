import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { toast } from 'sonner';

export type VitalSource = 'manual' | 'ehr_import' | 'device';

export interface VitalRecord {
  id: string;
  user_id: string;
  type: VitalType;
  value: number;
  secondary_value: number | null;
  unit: string;
  recorded_at: string;
  notes: string | null;
  created_at: string;
  source: VitalSource;
  external_id: string | null;
  ehr_connection_id: string | null;
}

// Check if a vital can be edited (only manual entries can be modified)
export function isVitalEditable(vital: VitalRecord): boolean {
  return vital.source === 'manual';
}

export function useVitals() {
  const { user } = useAuth();
  const [vitals, setVitals] = useState<VitalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVitals = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('vitals')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      setVitals((data as VitalRecord[]) || []);
    } catch (error) {
      console.error('Error fetching vitals:', error);
      toast.error('Failed to load vitals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVitals();
  }, [user]);

  const addVital = async (
    type: VitalType,
    value: number,
    secondaryValue?: number,
    notes?: string,
    recordedAt?: Date,
    familyMemberId?: string | null
  ) => {
    if (!user) {
      toast.error('Please sign in to record vitals');
      return null;
    }

    const config = VITAL_CONFIG[type];
    
    try {
      const { data, error } = await supabase
        .from('vitals')
        .insert({
          user_id: user.id,
          type,
          value,
          secondary_value: secondaryValue || null,
          unit: config.unit,
          recorded_at: recordedAt?.toISOString() || new Date().toISOString(),
          notes: notes || null,
          source: 'manual', // Patient-entered vitals are always manual
          family_member_id: familyMemberId || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      setVitals(prev => [data as VitalRecord, ...prev]);
      toast.success(`${config.label} recorded successfully!`);
      return data;
    } catch (error) {
      console.error('Error adding vital:', error);
      toast.error('Failed to record vital');
      return null;
    }
  };

  const deleteVital = async (id: string) => {
    // Check if vital is editable (not from EHR)
    const vital = vitals.find(v => v.id === id);
    if (vital && !isVitalEditable(vital)) {
      toast.error('Cannot delete vitals imported from EHR');
      return;
    }

    try {
      const { error } = await supabase
        .from('vitals')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setVitals(prev => prev.filter(v => v.id !== id));
      toast.success('Vital deleted');
    } catch (error) {
      console.error('Error deleting vital:', error);
      toast.error('Failed to delete vital');
    }
  };

  const updateVital = async (
    id: string,
    updates: {
      value?: number;
      secondaryValue?: number;
      notes?: string;
      recordedAt?: Date;
    }
  ): Promise<boolean> => {
    // Check if vital is editable (not from EHR)
    const vital = vitals.find(v => v.id === id);
    if (vital && !isVitalEditable(vital)) {
      toast.error('Cannot edit vitals imported from EHR');
      return false;
    }

    try {
      const updateData: Record<string, unknown> = {};
      
      if (updates.value !== undefined) updateData.value = updates.value;
      if (updates.secondaryValue !== undefined) updateData.secondary_value = updates.secondaryValue;
      if (updates.notes !== undefined) updateData.notes = updates.notes || null;
      if (updates.recordedAt) updateData.recorded_at = updates.recordedAt.toISOString();

      const { data, error } = await supabase
        .from('vitals')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setVitals(prev => prev.map(v => v.id === id ? (data as VitalRecord) : v));
      toast.success('Vital updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating vital:', error);
      toast.error('Failed to update vital');
      return false;
    }
  };

  const getLatestVital = (type: VitalType): VitalRecord | undefined => {
    return vitals.find(v => v.type === type);
  };

  const getVitalHistory = (type: VitalType, days: number = 30): VitalRecord[] => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return vitals
      .filter(v => v.type === type && new Date(v.recorded_at) >= cutoff)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  };

  const getVitalStats = (type: VitalType, days: number = 30) => {
    const history = getVitalHistory(type, days);
    if (history.length === 0) return null;

    const values = history.map(v => v.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    const config = VITAL_CONFIG[type];
    const trend = history.length >= 2 
      ? (history[history.length - 1].value - history[0].value) / history[0].value * 100
      : 0;

    return {
      average: Math.round(avg * 10) / 10,
      min,
      max,
      count: history.length,
      trend: Math.round(trend * 10) / 10,
      inRange: values.filter(v => v >= config.normalMin && v <= config.normalMax).length,
      outOfRange: values.filter(v => v < config.normalMin || v > config.normalMax).length,
    };
  };

  return {
    vitals,
    loading,
    addVital,
    updateVital,
    deleteVital,
    getLatestVital,
    getVitalHistory,
    getVitalStats,
    refetch: fetchVitals,
  };
}
