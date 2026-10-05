import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { patientHasPlus } from '../../supabase/functions/_shared/plan-gates';

/**
 * Whether the signed-in patient is on Plus, for deciding what to offer.
 *
 * The edge functions behind patient AI (assistant, lab-report reading,
 * document summaries) refuse a Free account, and they read profiles.
 * subscription_tier to do it. This reads the same row, so the screen and the
 * server agree. The decision itself is in supabase/functions/_shared/
 * plan-gates.ts, shared with the functions.
 *
 * That row is only written when check-subscription runs, so a stored "free"
 * is not trusted on its own: it is confirmed with check-subscription (which
 * asks Stripe and corrects the row) before anyone is told to upgrade. Someone
 * who pays on another device is not shown an upsell for what they already own.
 *
 * 'unknown' means the check could not be completed. Nothing is offered or
 * hidden on it; the screen behaves as it did and the server has the final say.
 */
export type PlusState = 'loading' | 'plus' | 'free' | 'unknown';

export const PATIENT_PLUS_QUERY_KEY = 'patient-plus';

export function usePatientPlus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [PATIENT_PLUS_QUERY_KEY, user?.id],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<'plus' | 'free' | 'unknown'> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) return 'unknown';
      if (patientHasPlus((data as { subscription_tier?: string | null } | null)?.subscription_tier)) return 'plus';

      try {
        const { data: checked, error: checkErr } = await supabase.functions.invoke('check-subscription');
        if (checkErr) return 'unknown';
        return patientHasPlus((checked as { tier?: string } | null)?.tier) ? 'plus' : 'free';
      } catch {
        return 'unknown';
      }
    },
  });

  const state: PlusState = !user ? 'unknown' : query.isLoading ? 'loading' : (query.data ?? 'unknown');

  return {
    state,
    hasPlus: state === 'plus',
    /** Only true when we positively know the plan is Free. */
    isFree: state === 'free',
    /** Called when the server said plus_required although we thought otherwise. */
    markFree: () => queryClient.setQueryData([PATIENT_PLUS_QUERY_KEY, user?.id], 'free'),
  };
}
