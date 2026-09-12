import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export type AccountKind = 'all' | 'tenant' | 'clinician' | 'patient';

export interface DirectoryRow {
  kind: 'tenant' | 'clinician' | 'patient';
  id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  detail: string | null;
  tenant_name: string | null;
  connections: number;
  storage_bytes: number;
  last_seen: string | null;
  created_at: string;
  total_count: number;
}

export interface AccountDetail {
  kind: string;
  id: string;
  user_id?: string;
  name?: string;
  email?: string;
  slug?: string;
  tenant_type?: string;
  tier?: string;
  status?: string;
  ends_at?: string | null;
  is_active?: boolean;
  location?: string | null;
  specialty?: string | null;
  is_verified?: boolean | null;
  onboarding_completed?: boolean | null;
  email_confirmed?: boolean;
  last_seen?: string | null;
  created_at?: string;
  members?: number;
  departments?: number;
  connections?: number | { clinician_shares: number; institution_shares: number; revoked: number };
  storage_bytes?: number;
  storage_limit_gb?: number;
  revenue_share_pct?: number;
  pending_invitations?: number;
  roles?: string[];
  tenants?: Array<{ id: string; name: string; role: string; status: string }>;
  record_counts?: { documents: number; medications: number; vitals: number };
  recent_activity?: Array<{ action: string; resource_type?: string; at: string }>;
}

const PAGE_SIZE = 20;

/** The unified people-and-organisations directory. Paged and searched server-side. */
export function useAdminAccounts() {
  const { isAdmin } = useAdminRole();
  const [kind, setKind] = useState<AccountKind>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ['admin-accounts', kind, debouncedSearch, page],
    enabled: isAdmin,
    staleTime: 30_000,
    // Holding the previous page while the next one loads stops the table
    // collapsing to a spinner on every keystroke.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DirectoryRow[]> => {
      const { data, error } = await supabase.rpc('admin_accounts_directory', {
        _kind: kind,
        _search: debouncedSearch.trim() || undefined,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data || []) as DirectoryRow[];
    },
  });

  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;

  const changeKind = (next: AccountKind) => {
    setKind(next);
    setPage(0);
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(0);
  };

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    setPage,
    kind,
    setKind: changeKind,
    search,
    setSearch: changeSearch,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

/** The drawer behind a row. Counts and states; never the record itself. */
export function useAccountDetail(kind: string | null, id: string | null) {
  const { isAdmin } = useAdminRole();

  const query = useQuery({
    queryKey: ['admin-account-detail', kind, id],
    enabled: isAdmin && !!kind && !!id,
    queryFn: async (): Promise<AccountDetail | null> => {
      const { data, error } = await supabase.rpc('admin_account_detail', {
        _kind: kind as string,
        _id: id as string,
      });
      if (error) throw error;
      return (data ?? null) as unknown as AccountDetail | null;
    },
  });

  return { detail: query.data ?? null, isLoading: query.isLoading };
}
