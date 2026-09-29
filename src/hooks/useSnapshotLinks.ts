import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { SnapshotCategory } from '@/lib/snapshot-links';

export interface SnapshotLinkRow {
  id: string;
  label: string | null;
  categories: string[];
  document_count: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  has_passcode: boolean;
  locked: boolean;
  view_count: number;
  last_viewed_at: string | null;
}

export interface CreatedSnapshotLink {
  linkId: string;
  token: string;
  passcode: string | null;
  expiresAt: string;
}

export interface ShareableDocument {
  id: string;
  title: string;
  document_date: string | null;
  created_at: string;
}

/** The patient's read-only links, newest first, with view counts. */
export function useSnapshotLinks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['snapshot-links', user?.id];

  const list = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_snapshot_links');
      if (error) throw error;
      return (data ?? []) as SnapshotLinkRow[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: {
      categories: SnapshotCategory[];
      documentIds: string[];
      expiresInHours: number;
      withPasscode: boolean;
      label?: string;
    }): Promise<CreatedSnapshotLink> => {
      const { data, error } = await supabase.rpc('create_snapshot_link', {
        _categories: input.categories,
        _document_ids: input.documentIds,
        _expires_in_hours: input.expiresInHours,
        _with_passcode: input.withPasscode,
        _label: input.label?.trim() || undefined,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      // No row means no link, whatever the status code said.
      if (!row?.token) throw new Error('The link was not created. Please try again.');
      return { linkId: row.link_id, token: row.token, passcode: row.passcode, expiresAt: row.expires_at };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message || 'Could not create the link'),
  });

  const revoke = useMutation({
    mutationFn: async (linkId: string) => {
      const { data, error } = await supabase.rpc('revoke_snapshot_link', { _link_id: linkId });
      if (error) throw error;
      if (!data) throw new Error('The link was not revoked. Please try again.');
      return data;
    },
    onSuccess: () => {
      toast.success('Link revoked. It stops working immediately.');
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not revoke the link'),
  });

  return { links: list.data ?? [], isLoading: list.isLoading, create, revoke };
}

/**
 * Documents the patient may put in a link: their own (not a family member's),
 * neither archived nor retracted — the same rule create_snapshot_link applies.
 */
export function useShareableDocuments(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['snapshot-shareable-documents', user?.id],
    enabled: !!user && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('health_documents')
        .select('id, title, file_name, document_date, created_at')
        .eq('user_id', user!.id)
        .is('family_member_id', null)
        .is('archived_at', null)
        .is('retracted_at', null)
        .order('document_date', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        title: d.title || d.file_name,
        document_date: d.document_date,
        created_at: d.created_at,
      })) as ShareableDocument[];
    },
  });
}
