import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * What the signed-in person's plan allows and how much of it they use, from
 * the database function entitlements_for(). The figures live in the tier_limits
 * table and are enforced by the database; this hook only reads them, so a price
 * or limit change never needs a code change here.
 *
 * null means unlimited. The scribe figures are informational: the scribe is
 * metered, not blocked.
 */
export interface Entitlements {
  tier: string;
  patientLimit: number | null;
  patientCount: number;
  seatLimit: number | null;
  seatCount: number;
  scribeIncluded: boolean;
  scribeMinutesMonthly: number | null;
  storageMb: number | null;
  practiceId: string | null;
  practicePatientLimit: number | null;
  practicePatientCount: number | null;
  atPatientLimit: boolean;
  overPatientLimit: boolean;
  atSeatLimit: boolean;
  overSeatLimit: boolean;
}

interface EntitlementsRow {
  tier: string;
  patient_limit: number | null;
  patient_count: number | null;
  seat_limit: number | null;
  seat_count: number | null;
  scribe_included: boolean | null;
  scribe_minutes_monthly: number | null;
  storage_mb: number | null;
  practice_id: string | null;
  practice_patient_limit: number | null;
  practice_patient_count: number | null;
  at_patient_limit: boolean | null;
  over_patient_limit: boolean | null;
  at_seat_limit: boolean | null;
  over_seat_limit: boolean | null;
}

export function normaliseEntitlements(row: EntitlementsRow): Entitlements {
  return {
    tier: row.tier,
    patientLimit: row.patient_limit,
    patientCount: row.patient_count ?? 0,
    seatLimit: row.seat_limit,
    seatCount: row.seat_count ?? 0,
    scribeIncluded: row.scribe_included === true,
    scribeMinutesMonthly: row.scribe_minutes_monthly,
    storageMb: row.storage_mb,
    practiceId: row.practice_id,
    practicePatientLimit: row.practice_patient_limit,
    practicePatientCount: row.practice_patient_count,
    atPatientLimit: row.at_patient_limit === true,
    overPatientLimit: row.over_patient_limit === true,
    atSeatLimit: row.at_seat_limit === true,
    overSeatLimit: row.over_seat_limit === true,
  };
}

export const ENTITLEMENTS_QUERY_KEY = 'entitlements';

export function useEntitlements() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [ENTITLEMENTS_QUERY_KEY, user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<Entitlements | null> => {
      const { data, error } = await supabase.rpc('entitlements_for');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? normaliseEntitlements(row as EntitlementsRow) : null;
    },
  });

  return {
    entitlements: query.data ?? null,
    /**
     * True once the answer is in. Anything that warns about a limit waits for
     * this, so a default is never drawn as a fact.
     */
    ready: query.isSuccess && !!query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
