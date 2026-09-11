import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveFamilyMember } from '@/contexts/FamilyContext';
import { VitalType, VITAL_CONFIG, resolveVitalType } from '@/types/health';
import { toast } from 'sonner';
import { enqueueWrite, cacheRead, getCachedRead } from '@/lib/offline';
import { summariseVital } from "@/lib/vital-stats";

/**
 * Where a reading came from.
 *
 * `clinician` is written by EncounterScribePanel and FileDictationDialog when a
 * clinician records a measurement during a visit. It was missing from this
 * union for as long as those screens have existed, so every branch downstream
 * fell through to its default: the badge called the reading the patient's own,
 * and refusing to edit it blamed an EHR import that never happened.
 */
export type VitalSource = 'manual' | 'clinician' | 'ehr_import' | 'device';

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
  family_member_id: string | null;
}

// Only the patient's own entries are theirs to change. A reading somebody else
// recorded is that person's record of what they measured.
export function isVitalEditable(vital: { source?: string | null }): boolean {
  return !vital.source || vital.source === 'manual';
}

/**
 * Why a reading cannot be changed, in terms of who recorded it.
 *
 * The single message this replaces said "imported from EHR" whatever the
 * source, so a patient told their own doctor's bedside reading came from a
 * hospital system they had never connected.
 */
export function describeVitalSource(source?: string | null): string {
  switch (source) {
    case 'clinician': return 'your clinician';
    case 'ehr_import': return 'your health provider’s system';
    case 'device': return 'a connected device';
    default: return 'another source';
  }
}

export function useVitals() {
  const { user } = useAuth();
  const { activeMemberId } = useActiveFamilyMember();
  const [vitals, setVitals] = useState<VitalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const cacheKey = () => `vitals:${user?.id}:${activeMemberId ?? 'self'}`;

  const fetchVitals = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('vitals')
        .select('*')
        .eq('user_id', user.id);

      if (activeMemberId) {
        query = query.eq('family_member_id', activeMemberId);
      } else {
        query = query.is('family_member_id', null);
      }

      const { data, error } = await query.order('recorded_at', { ascending: false });

      if (error) throw error;
      const rows = (data as VitalRecord[]) || [];
      setVitals(rows);
      void cacheRead(cacheKey(), rows);
    } catch (error) {
      console.error('Error fetching vitals:', error);
      // Try offline cache before erroring
      const cached = await getCachedRead<VitalRecord[]>(cacheKey());
      if (cached?.payload) {
        setVitals(cached.payload);
      } else {
        toast.error('Failed to load vitals');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeMemberId]);

  const addVital = async (
    type: VitalType,
    value: number,
    secondaryValue?: number,
    notes?: string,
    recordedAt?: Date,
    familyMemberId?: string | null,
    sourceDocumentId?: string | null
  ) => {
    if (!user) {
      toast.error('Please sign in to record vitals');
      return null;
    }

    const config = VITAL_CONFIG[type];
    const payload = {
      user_id: user.id,
      type,
      value,
      secondary_value: secondaryValue || null,
      unit: config.unit,
      recorded_at: recordedAt?.toISOString() || new Date().toISOString(),
      notes: notes || null,
      source: 'manual' as VitalSource,
      family_member_id: familyMemberId !== undefined ? familyMemberId : activeMemberId,
      // The Vault document this value was read from, if any — so a document
      // withdrawn as another patient's stops leaving its numbers behind here.
      source_document_id: sourceDocumentId ?? null,
    };

    // Offline path: optimistically add locally + queue for later sync.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const tempId = globalThis.crypto?.randomUUID?.() ?? `tmp_${Date.now()}`;
      await enqueueWrite({
        id: tempId,
        table: 'vitals',
        op: 'insert',
        payload,
        user_id: user.id,
      });
      const optimistic = {
        id: tempId,
        ...payload,
        external_id: null,
        ehr_connection_id: null,
        created_at: new Date().toISOString(),
      } as VitalRecord;
      setVitals(prev => [optimistic, ...prev]);
      toast.success(`${config.label} saved — will sync when online`);
      return optimistic;
    }

    try {
      const { data, error } = await supabase
        .from('vitals')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      setVitals(prev => [data as VitalRecord, ...prev]);
      toast.success(`${config.label} recorded successfully!`);

      // Trigger vital alert check in background (non-blocking)
      supabase.functions.invoke('check-vital-alerts').catch(err =>
        console.log('Alert check skipped:', err)
      );

      return data;
    } catch (error) {
      console.error('Error adding vital:', error);
      toast.error('Failed to record vital');
      return null;
    }
  };

  const deleteVital = async (id: string) => {
    const vital = vitals.find(v => v.id === id);
    if (vital && !isVitalEditable(vital)) {
      toast.error(`This reading was recorded by ${describeVitalSource(vital.source)}, so it is not yours to delete.`);
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
    const vital = vitals.find(v => v.id === id);
    if (vital && !isVitalEditable(vital)) {
      toast.error(`This reading was recorded by ${describeVitalSource(vital.source)}, so it is not yours to change.`);
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

  // VITAL_TYPE_ALIASES exists because rows carry legacy and imported keys —
  // blood_glucose, bp, spo2, pulse. Selecting with a bare === applied the map
  // at display time only: a blood_glucose reading was listed in the history log
  // under "Blood Glucose" and was simultaneously missing from the glucose card,
  // its chart and its statistics, which read "No readings" with the row sitting
  // in the table.
  const sameType = (rowType: string, wanted: VitalType) =>
    resolveVitalType(rowType) === resolveVitalType(wanted);

  const getLatestVital = (type: VitalType): VitalRecord | undefined => {
    return vitals.find(v => sameType(v.type, type));
  };

  const getVitalHistory = (type: VitalType, days: number = 30): VitalRecord[] => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return vitals
      .filter(v => sameType(v.type, type) && new Date(v.recorded_at) >= cutoff)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  };

  const getVitalStats = (type: VitalType, days: number = 30) => {
    const history = getVitalHistory(type, days);
    // Extracted to src/lib/vital-stats.ts and tested: this used to compare a
    // Fahrenheit temperature against a Celsius band, judge a blood pressure on
    // its systolic half alone, and average readings logged in different units.
    return summariseVital(type, history);
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
