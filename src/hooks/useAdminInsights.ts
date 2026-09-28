import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export interface AdminSignup {
  user_id: string;
  email: string | null;
  name: string | null;
  is_clinician: boolean;
  created_at: string;
}

export interface AdminAccessLogRow {
  id: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

/**
 * People surface only once named. Matches the floor admin_recent_signups and
 * admin_access_log_search enforce server-side (20261009050000) — this just
 * saves a round trip; the RPC is what keeps a direct call honest.
 */
export const MIN_PERSON_SEARCH_LENGTH = 2;

/** Newest accounts matching a name or email, for admin oversight. Admin-gated server-side. */
export function useAdminSignups(search: string, limit = 20) {
  const { isAdmin } = useAdminRole();
  const term = useDebouncedValue(search, 300).trim();
  const needsSearch = term.length < MIN_PERSON_SEARCH_LENGTH;

  const query = useQuery({
    queryKey: ['admin-recent-signups', term, limit],
    enabled: isAdmin && !needsSearch,
    queryFn: async (): Promise<AdminSignup[]> => {
      const { data, error } = await supabase.rpc('admin_recent_signups', {
        _search: term,
        _limit: limit,
      });
      if (error) throw error;
      return (data || []) as AdminSignup[];
    },
  });

  return {
    signups: needsSearch ? [] : (query.data ?? []),
    isLoading: needsSearch ? false : query.isLoading,
    needsSearch,
  };
}

/** Cross-tenant access-log search by clinician or patient. Admin-gated server-side. */
export function useAdminAccessLog(search: string) {
  const { isAdmin } = useAdminRole();
  const term = useDebouncedValue(search, 300).trim();
  const needsSearch = term.length < MIN_PERSON_SEARCH_LENGTH;

  const query = useQuery({
    queryKey: ['admin-access-log', term],
    enabled: isAdmin && !needsSearch,
    queryFn: async (): Promise<AdminAccessLogRow[]> => {
      const { data, error } = await supabase.rpc('admin_access_log_search', {
        _search: term,
        _limit: 200,
      });
      if (error) throw error;
      return (data || []) as AdminAccessLogRow[];
    },
  });

  return {
    entries: needsSearch ? [] : (query.data ?? []),
    isLoading: needsSearch ? false : query.isLoading,
    isFetching: query.isFetching,
    needsSearch,
  };
}
