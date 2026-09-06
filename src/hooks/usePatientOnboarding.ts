import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  patientOnboardingSteps,
  patientOnboardingProgress,
  shouldShowGettingStarted,
  type PatientOnboardingFacts,
} from '@/lib/patient-onboarding';

/**
 * What the patient has actually done, asked cheaply.
 *
 * Four head-only counts rather than four full lists: this runs on the
 * dashboard of every patient on every load, and it only needs to know whether
 * each thing exists at all.
 */
export function usePatientOnboarding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['patient-getting-started', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const id = user!.id;

      // Untyped on purpose: a union of table names makes the generated
      // Supabase types expand past the compiler's instantiation limit, and all
      // this needs is a count.
      const exists = async (table: string, activeOnly = false) => {
        const client = supabase as unknown as {
          from: (t: string) => {
            select: (c: string, o: { count: 'exact'; head: true }) => {
              eq: (col: string, v: unknown) => Promise<{ count: number | null }> & {
                eq: (col: string, v: unknown) => Promise<{ count: number | null }>;
              };
            };
          };
        };
        const q = client.from(table).select('id', { count: 'exact', head: true }).eq('user_id', id);
        // A revoked share does not count: the step is "share with your
        // doctor", and someone who shared and then stopped has not got a
        // doctor looking at their record.
        const { count } = activeOnly ? await q.eq('is_active', true) : await q;
        return (count ?? 0) > 0;
      };

      const [profile, hasLoggedVital, hasMedication, hasShared] = await Promise.all([
        // Cast: getting_started_dismissed_at is newer than the generated
        // types file, which Supabase tooling regenerates and nobody edits.
        (supabase.from('profiles') as unknown as {
          select: (c: string) => {
            eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
          };
        })
          .select(
            'date_of_birth, health_conditions, allergies, emergency_contact_name, getting_started_dismissed_at',
          )
          .eq('user_id', id)
          .maybeSingle(),
        exists('vitals'),
        exists('medications'),
        exists('provider_shares', true),
      ]);

      const p = profile.data as
        | {
            date_of_birth: string | null;
            health_conditions: unknown;
            allergies: unknown;
            emergency_contact_name: string | null;
            getting_started_dismissed_at: string | null;
          }
        | null;

      const filled = (v: unknown) => Array.isArray(v) && v.length > 0;

      const facts: PatientOnboardingFacts = {
        // Enough of a profile to be worth a clinician reading — a date of
        // birth on its own is identity, not health.
        hasHealthProfile: !!(
          p?.date_of_birth &&
          (filled(p.health_conditions) || filled(p.allergies) || p.emergency_contact_name)
        ),
        hasLoggedVital,
        hasMedication,
        hasShared,
      };

      return { facts, dismissedAt: p?.getting_started_dismissed_at ?? null };
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase.from('profiles') as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, v: string) => Promise<{ error: Error | null }>;
        };
      })
        .update({ getting_started_dismissed_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-getting-started'] });
    },
  });

  const facts = data?.facts ?? {
    hasHealthProfile: false,
    hasLoggedVital: false,
    hasMedication: false,
    hasShared: false,
  };

  return {
    isLoading,
    steps: patientOnboardingSteps(facts),
    progress: patientOnboardingProgress(facts),
    // Nothing renders until the answer is known, so a fresh account does not
    // flash a checklist of four undone things at someone who has done them.
    shouldShow: !isLoading && !!data && shouldShowGettingStarted(facts, data.dismissedAt),
    dismiss,
  };
}
