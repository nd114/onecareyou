import { supabase } from '@/integrations/supabase/client';

/**
 * Where a person belongs after signing in on a tenant's front door.
 *
 * A hospital publishes one address for patients and one for staff, but people
 * use whichever link they have. So the destination follows the account, not the
 * page: anyone with a clinician profile goes to the clinician surface, everyone
 * else to the patient dashboard.
 */
export async function resolveSignedInDestination(): Promise<string> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return '/dashboard';

    const { data } = await supabase
      .from('clinician_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    return data ? '/clinician/today' : '/dashboard';
  } catch {
    return '/dashboard';
  }
}
