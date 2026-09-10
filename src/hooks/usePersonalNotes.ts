import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveFamilyMember } from '@/contexts/FamilyContext';
import { sanitizeNoteHtml } from '@/lib/sanitize-html';

export interface PersonalNote {
  id: string;
  user_id: string;
  family_member_id: string | null;
  title: string;
  body_html: string;
  note_date: string;
  folder: string | null;
  tags: string[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A note the patient writes themselves.
 *
 * Kept apart from documents on purpose: there is no file, nobody else wrote it,
 * and it is never swept up by whole-Vault sharing. It is labelled "Personal
 * note" everywhere it appears so it can never be mistaken for something a
 * clinician recorded.
 */
export function usePersonalNotes() {
  const { user } = useAuth();
  const { activeMemberId } = useActiveFamilyMember();
  const queryClient = useQueryClient();
  const db = supabase as any;

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['personal-notes', user?.id, activeMemberId],
    queryFn: async () => {
      if (!user) return [] as PersonalNote[];
      let query = db.from('personal_notes').select('*').eq('user_id', user.id);
      query = activeMemberId
        ? query.eq('family_member_id', activeMemberId)
        : query.is('family_member_id', null);
      const { data, error } = await query.order('note_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((n: any) => ({
        ...n,
        tags: Array.isArray(n.tags) ? n.tags : [],
      })) as PersonalNote[];
    },
    enabled: !!user,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['personal-notes'] });

  const saveNote = useMutation({
    mutationFn: async (input: {
      id?: string;
      title: string;
      bodyHtml: string;
      noteDate: string;
      folder?: string | null;
      tags?: string[];
    }) => {
      if (!user) throw new Error('Not authenticated');
      const row = {
        title: input.title.trim().slice(0, 200),
        body_html: sanitizeNoteHtml(input.bodyHtml),
        note_date: input.noteDate,
        folder: input.folder?.trim() || null,
        tags: input.tags ?? [],
      };
      if (input.id) {
        const { error } = await db.from('personal_notes').update(row).eq('id', input.id);
        if (error) throw error;
        return;
      }
      const { error } = await db.from('personal_notes').insert({
        ...row,
        user_id: user.id,
        family_member_id: activeMemberId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(vars.id ? 'Note saved' : 'Note created');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save that note'),
  });

  const archiveNote = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await db
        .from('personal_notes')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(vars.archived ? 'Moved to your archive' : 'Restored to your Vault');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not change that note'),
  });

  /** Their own words, so their own to remove. */
  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.from('personal_notes').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('That note could not be removed');
    },
    onSuccess: () => {
      invalidate();
      toast.success('Note deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { notes, isLoading, saveNote, archiveNote, deleteNote };
}
