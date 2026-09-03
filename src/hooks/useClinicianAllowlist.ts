// practice_clinician_allowlist and the affiliation functions are newer than
// src/integrations/supabase/types.ts, which is generated and must not be
// hand-edited — hence the casts, same as usePracticeDepartments.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { StaffCsvEntry } from '@/lib/staff-csv';

export interface AllowlistEntry {
  id: string;
  email: string;
  full_name: string | null;
  intended_role: string;
  created_at: string;
}

export interface PendingAffiliation {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string;
  requested_at: string;
  on_allowlist: boolean;
  domain_matches: boolean;
}

export function useClinicianAllowlist(practiceId?: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['clinician-allowlist'] });
    queryClient.invalidateQueries({ queryKey: ['pending-affiliations'] });
    queryClient.invalidateQueries({ queryKey: ['practice-staff-overview'] });
    queryClient.invalidateQueries({ queryKey: ['practice-members'] });
  };

  const allowlist = useQuery({
    queryKey: ['clinician-allowlist', practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<AllowlistEntry[]> => {
      const { data, error } = await supabase
        .from('practice_clinician_allowlist')
        .select('id, email, full_name, intended_role, created_at')
        .eq('practice_id', practiceId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AllowlistEntry[];
    },
  });

  const pending = useQuery({
    queryKey: ['pending-affiliations', practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<PendingAffiliation[]> => {
      const { data, error } = await supabase.rpc('practice_pending_affiliations', {
        _practice_id: practiceId,
      });
      if (error) throw error;
      return (data ?? []) as PendingAffiliation[];
    },
  });

  const domainsQuery = useQuery({
    queryKey: ['clinician-allowlist', 'domains', practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('practices')
        .select('allowed_email_domains')
        .eq('id', practiceId!)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.allowed_email_domains ?? []) as string[];
    },
  });

  const addEntries = useMutation({
    mutationFn: async (entries: StaffCsvEntry[]) => {
      if (!practiceId) throw new Error('No hospital selected');
      const { data, error } = await supabase.rpc('bulk_allowlist_clinicians', {
        _practice_id: practiceId,
        _entries: entries,
      });
      if (error) throw error;
      return ((data ?? []) as { added: number; skipped: number }[])[0] ?? { added: 0, skipped: 0 };
    },
    onSuccess: (result) => {
      toast.success(
        result.skipped > 0
          ? `${result.added} added, ${result.skipped} already on the list`
          : `${result.added} added to the staff list`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not import the staff list'),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('practice_clinician_allowlist')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Removed from the staff list');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not remove them'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      if (!practiceId) throw new Error('No hospital selected');
      const { error } = await supabase.rpc('set_practice_affiliation_status', {
        _practice_id: practiceId,
        _user_id: userId,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.status === 'active'
          ? 'Affiliation approved'
          : vars.status === 'rejected'
            ? 'Request rejected'
            : 'Affiliation revoked',
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update the affiliation'),
  });

  const saveDomains = useMutation({
    mutationFn: async (raw: string) => {
      if (!practiceId) throw new Error('No hospital selected');
      const domains = raw
        .split(/[,\s]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);
      const { error } = await supabase
        .from('practices')
        .update({ allowed_email_domains: domains } as never)
        .eq('id', practiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Approved domains saved');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the domains'),
  });

  return {
    allowlist: allowlist.data ?? [],
    pending: pending.data ?? [],
    domains: domainsQuery.data ?? [],
    isLoading: allowlist.isLoading || pending.isLoading,
    addEntries: addEntries.mutateAsync,
    isAdding: addEntries.isPending,
    removeEntry: removeEntry.mutateAsync,
    setStatus: setStatus.mutateAsync,
    saveDomains: saveDomains.mutateAsync,
    isSavingDomains: saveDomains.isPending,
  };
}
