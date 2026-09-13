import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { toast } from 'sonner';

export type BugReportStatus = 'open' | 'archived' | 'all';

export interface BugReportRow {
  id: string;
  category: string;
  description: string;
  page_url: string;
  browser_info: { userAgent?: string; viewport?: string; language?: string; platform?: string } | null;
  status: string;
  created_at: string;
  reporter_user_id: string | null;
  reporter_name: string;
  reporter_email: string | null;
  total_count: number;
}

const PAGE_SIZE = 20;

/** Bug-report triage: full detail, real reporter, archive instead of delete. */
export function useAdminBugReports() {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<BugReportStatus>('open');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ['admin-bug-reports', status, page],
    enabled: isAdmin,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<BugReportRow[]> => {
      const { data, error } = await supabase.rpc('admin_bug_reports', {
        _status: status,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data || []) as BugReportRow[];
    },
  });

  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;

  const changeStatus = (next: BugReportStatus) => {
    setStatus(next);
    setPage(0);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      return allSelected ? new Set() : new Set(rows.map((r) => r.id));
    });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-bug-reports'] });
    queryClient.invalidateQueries({ queryKey: ['admin-attention-queue'] });
  };

  const archive = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc('admin_archive_bug_reports', { _ids: ids });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (n) => {
      if (n > 0) toast.success(n === 1 ? 'Report archived' : `${n} reports archived`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not archive that report'),
  });

  const restore = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc('admin_restore_bug_reports', { _ids: ids });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (n) => {
      if (n > 0) toast.success(n === 1 ? 'Report restored' : `${n} reports restored`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore that report'),
  });

  return {
    rows,
    total,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    status,
    setStatus: changeStatus,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    selected,
    toggleSelected,
    toggleSelectAllOnPage,
    clearSelection: () => setSelected(new Set()),
    archiveSelected: () => archive.mutate(Array.from(selected)),
    restoreSelected: () => restore.mutate(Array.from(selected)),
    archiveOne: (id: string) => archive.mutate([id]),
    restoreOne: (id: string) => restore.mutate([id]),
    isMutating: archive.isPending || restore.isPending,
  };
}
