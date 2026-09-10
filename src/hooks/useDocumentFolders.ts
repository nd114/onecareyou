import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveFamilyMember } from '@/contexts/FamilyContext';

export interface DocumentFolder {
  id: string;
  user_id: string;
  family_member_id: string | null;
  name: string;
  created_at: string;
}

/**
 * Folders that exist whether or not anything is in them yet.
 *
 * A folder used to be nothing but a label on a document, so naming one and
 * refreshing the page lost it, and renaming was impossible. Now the folder is
 * a record of its own; renaming and removing move the documents with it, in
 * the database, so the two can never disagree.
 */
export function useDocumentFolders() {
  const { user } = useAuth();
  const { activeMemberId } = useActiveFamilyMember();
  const queryClient = useQueryClient();
  const db = supabase as any;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['document-folders'] });
    queryClient.invalidateQueries({ queryKey: ['health-documents'] });
  };

  const { data: folders = [], isLoading } = useQuery({
    queryKey: ['document-folders', user?.id, activeMemberId],
    queryFn: async () => {
      if (!user) return [] as DocumentFolder[];
      let query = db.from('document_folders').select('*').eq('user_id', user.id);
      query = activeMemberId
        ? query.eq('family_member_id', activeMemberId)
        : query.is('family_member_id', null);
      const { data, error } = await query.order('name');
      if (error) throw error;
      return (data ?? []) as DocumentFolder[];
    },
    enabled: !!user,
  });

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await db
        .from('document_folders')
        .insert({ user_id: user.id, family_member_id: activeMemberId, name: name.trim() })
        .select()
        .single();
      if (error) {
        if (error.code === '23505' || error.code === '23P01' || error.code === '23000' || error.code === '23514' || error.message?.includes('duplicate')) {
          throw new Error('You already have a folder with that name');
        }
        throw error;
      }
      return data as DocumentFolder;
    },
    onSuccess: (f) => {
      invalidate();
      toast.success(`"${f.name}" created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await db.rpc('rename_document_folder', {
        _folder_id: id,
        _new_name: name.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Folder renamed');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not rename that folder'),
  });

  /** The documents inside go back to Unfiled — the files themselves are untouched. */
  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('delete_document_folder', { _folder_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Folder removed — its documents are back in Unfiled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not remove that folder'),
  });

  return {
    folders,
    folderNames: folders.map((f) => f.name),
    isLoading,
    createFolder,
    renameFolder,
    deleteFolder,
  };
}
