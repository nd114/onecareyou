import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * The two demo-provisioning edge functions, wired to a button for the first
 * time. Both are idempotent (re-running upserts the same fixed accounts) and
 * already gate on `requireServiceRoleOrAdmin`; this only adds the console
 * surface to trigger what previously had to be curled by hand.
 */
export function useAdminDemoSeed() {
  const seedPatients = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('seed-demo-data', { body: {} });
      if (error) throw error;
      return data as { success?: boolean; message?: string };
    },
    onSuccess: (data) => toast.success(data?.message || 'Demo patient and clinician data seeded'),
    onError: (e: Error) => toast.error(e.message || 'Could not seed demo data'),
  });

  const seedHospital = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('seed-demo-hospital', { body: {} });
      if (error) throw error;
      return data as { ok?: boolean; hospital?: { name: string; code: string } };
    },
    onSuccess: (data) =>
      toast.success(
        data?.hospital ? `${data.hospital.name} (${data.hospital.code}) seeded` : 'Demo hospital seeded',
      ),
    onError: (e: Error) => toast.error(e.message || 'Could not seed the demo hospital'),
  });

  return {
    seedPatients: seedPatients.mutate,
    isSeedingPatients: seedPatients.isPending,
    seedHospital: seedHospital.mutate,
    isSeedingHospital: seedHospital.isPending,
  };
}
