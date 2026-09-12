import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toast } from 'sonner';

export interface TrustOverview {
  shares: {
    clinician_active: number;
    institution_active: number;
    revoked_7d: number;
    granted_7d: number;
    expired_but_active: number;
    suspended_institutions: number;
    share_all: number;
  };
  consent: {
    ai_processing_on: number;
    ai_actions_on: number;
    qhin_consented: number;
    changes_7d: number;
  };
  legal: {
    current_documents: number;
    accounts: number;
    fully_accepted: number;
    accepted_7d: number;
  };
  baa: { signed: number; pending: number };
  audit: { entries_7d: number; access_entries_7d: number; admin_actions_7d: number };
  checked_at: string;
}

export interface AccessReviewRow {
  share_type: 'clinician' | 'institution';
  share_id: string;
  patient_user_id: string;
  patient_name: string;
  viewer_name: string;
  viewer_user_id: string | null;
  permission_count: number;
  share_all: boolean;
  connected_at: string | null;
  last_accessed_at: string | null;
  expires_at: string | null;
  is_suspended: boolean;
  total_count: number;
}

export interface AuditExportRow {
  id: string;
  action: string;
  resource_type: string | null;
  actor_email: string | null;
  patient_email: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;

/**
 * A relationship only surfaces once you already know one of its two parties.
 * Matches the floor admin_access_reviews enforces server-side — this just
 * saves a round trip; the RPC is what actually keeps a direct call honest.
 */
const MIN_SEARCH_LENGTH = 2;

export function useAdminTrust() {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);
  const needsSearch = debouncedSearch.trim().length < MIN_SEARCH_LENGTH;

  const overview = useQuery({
    queryKey: ['admin-trust-overview'],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<TrustOverview | null> => {
      const { data, error } = await supabase.rpc('admin_trust_overview');
      if (error) throw error;
      return (data ?? null) as unknown as TrustOverview | null;
    },
  });

  const reviews = useQuery({
    queryKey: ['admin-access-reviews', debouncedSearch, page],
    enabled: isAdmin && !needsSearch,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AccessReviewRow[]> => {
      const { data, error } = await supabase.rpc('admin_access_reviews', {
        _search: debouncedSearch.trim() || undefined,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data || []) as AccessReviewRow[];
    },
  });

  const revoke = useMutation({
    mutationFn: async (input: { shareType: string; shareId: string; reason: string }) => {
      const { error } = await supabase.rpc('admin_revoke_patient_share', {
        _share_type: input.shareType,
        _share_id: input.shareId,
        _reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Access closed');
      queryClient.invalidateQueries({ queryKey: ['admin-access-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['admin-trust-overview'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not close that access'),
  });

  const rows = needsSearch ? [] : (reviews.data ?? []);
  const total = rows[0]?.total_count ?? 0;

  return {
    overview: overview.data ?? null,
    rows,
    total,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    search,
    setSearch: (next: string) => {
      setSearch(next);
      setPage(0);
    },
    needsSearch,
    minSearchLength: MIN_SEARCH_LENGTH,
    isLoading: overview.isLoading || (needsSearch ? false : reviews.isLoading),
    isFetching: reviews.isFetching,
    revoke: revoke.mutate,
    isRevoking: revoke.isPending,
  };
}

/** Pulls an audit range on demand, for the founder to keep or hand over. */
export function useAuditExport() {
  const exportRange = useMutation({
    mutationFn: async (input: { from?: string; to?: string; action?: string }) => {
      const { data, error } = await supabase.rpc('admin_audit_export', {
        _from: input.from || undefined,
        _to: input.to || undefined,
        _action: input.action || undefined,
        _limit: 5000,
      });
      if (error) throw error;
      return (data || []) as AuditExportRow[];
    },
    onError: (e: Error) => toast.error(e.message || 'Could not export that range'),
  });

  return { exportRange: exportRange.mutateAsync, isExporting: exportRange.isPending };
}
