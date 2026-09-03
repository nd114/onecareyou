import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { supabaseExtra } from '@/integrations/supabase/types-extra';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveFamilyMember } from '@/contexts/FamilyContext';
import { toast } from 'sonner';

export type DocumentCategory = 
  | 'lab_result'
  | 'prescription'
  | 'discharge_summary'
  | 'imaging'
  | 'insurance'
  | 'vaccination'
  | 'referral'
  | 'visit_note'
  | 'care_record'
  | 'other';

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string; color: string }[] = [
  { value: 'lab_result', label: 'Lab Result', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { value: 'prescription', label: 'Prescription', color: 'bg-green-500/10 text-green-700 dark:text-green-300' },
  { value: 'discharge_summary', label: 'Discharge Summary', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { value: 'imaging', label: 'Imaging Report', color: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  { value: 'insurance', label: 'Insurance', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300' },
  { value: 'vaccination', label: 'Vaccination', color: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  { value: 'referral', label: 'Referral', color: 'bg-pink-500/10 text-pink-700 dark:text-pink-300' },
  { value: 'visit_note', label: 'Visit Note', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  { value: 'care_record', label: 'Care Record', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { value: 'other', label: 'Other', color: 'bg-muted text-muted-foreground' },
];

export interface HealthDocument {
  id: string;
  user_id: string;
  family_member_id: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  category: DocumentCategory;
  tags: string[];
  title: string | null;
  notes: string | null;
  ai_summary: string | null;
  ai_category: string | null;
  ai_tags: string[] | null;
  document_date: string | null;
  folder: string | null;
  source_context: string;
  /** Set when a clinician put this in the Vault; null when the patient did. */
  uploaded_by_user_id: string | null;
  /** When the patient put this away. Null means active. Archiving destroys nothing. */
  archived_at: string | null;
  archived_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function useHealthDocuments() {
  const { user, session } = useAuth();
  const { activeMemberId } = useActiveFamilyMember();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['health-documents', user?.id, activeMemberId],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from('health_documents')
        .select('*')
        .eq('user_id', user.id);

      if (activeMemberId) {
        query = query.eq('family_member_id', activeMemberId);
      } else {
        query = query.is('family_member_id', null);
      }

      const { data, error } = await query.order('document_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as unknown as HealthDocument[];
    },
    enabled: !!user,
  });

  const uploadDocument = useMutation({
    mutationFn: async ({
      file,
      title,
      category,
      documentDate,
      notes,
      aiSummarize = false,
      sourceContext = 'direct',
      familyMemberId,
      folder,
      tags,
    }: {
      file: File;
      title: string;
      category: DocumentCategory;
      documentDate?: string;
      notes?: string;
      aiSummarize?: boolean;
      sourceContext?: string;
      familyMemberId?: string | null;
      folder?: string | null;
      /** The patient's own words for finding this again later. */
      tags?: string[];
    }) => {
      if (!user) throw new Error('Not authenticated');
      
      // Validate session is still active
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) throw new Error('Your session has expired. Please sign in again.');

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('health-documents')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('health_documents')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          title: title || file.name,
          category,
          document_date: documentDate || null,
          notes: notes || null,
          tags: tags ?? [],
          source_context: sourceContext,
          folder: folder?.trim() || null,
          family_member_id: familyMemberId !== undefined ? familyMemberId : activeMemberId,
        })
        .select()
        .single();
      if (error) throw error;

      // Only trigger AI summarization if user opted in
      if (aiSummarize) {
        supabase.functions.invoke('summarize-health-document', {
          body: { documentId: data.id },
        }).catch(console.error);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Document uploaded successfully');
    },
    onError: (error) => {
      const msg = error.message;
      if (msg.includes('session') || msg.includes('authenticated')) {
        toast.error('Session expired. Please sign in again.');
      } else {
        toast.error('Failed to upload document: ' + msg);
      }
    },
  });

  const triggerSummarize = useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await supabase.functions.invoke('summarize-health-document', {
        body: { documentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('AI summary generated');
    },
    onError: (error) => {
      toast.error('Failed to generate summary: ' + error.message);
    },
  });

  /**
   * Put a document away.
   *
   * Archive rather than delete: a document a clinician has already been given
   * should not be able to vanish from under them, and a patient tidying their
   * shelf is not the same act as withdrawing a file somebody was handed. The
   * row and the file both stay exactly where they are.
   *
   * Whole-vault sharing stops at an archived document — that rule is in the
   * RLS policies, not here, so it holds however the row is read.
   */
  const archiveDocument = useMutation({
    mutationFn: async ({ doc, reason }: { doc: HealthDocument; reason?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabaseExtra
        .from('health_documents')
        .update({
          archived_at: new Date().toISOString(),
          archived_reason: reason?.trim() ? reason.trim().slice(0, 500) : null,
        })
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Moved to your archive');
    },
    onError: (e: unknown) => {
      console.error('Archive failed', e);
      toast.error('Could not archive that document');
    },
  });

  const restoreDocument = useMutation({
    mutationFn: async (doc: HealthDocument) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabaseExtra
        .from('health_documents')
        .update({ archived_at: null, archived_reason: null })
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Restored to your Vault');
    },
    onError: (e: unknown) => {
      console.error('Restore failed', e);
      toast.error('Could not restore that document');
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (doc: HealthDocument) => {
      if (!user) throw new Error('Not authenticated');

      await supabase.storage.from('health-documents').remove([doc.file_path]);

      const { error } = await supabase
        .from('health_documents')
        .delete()
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Document deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete document: ' + error.message);
    },
  });

  const updateDocument = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      title?: string;
      category?: DocumentCategory;
      notes?: string;
      document_date?: string;
      tags?: string[];
      folder?: string | null;
    }) => {
      const { error } = await supabase
        .from('health_documents')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success('Document updated');
    },
    onError: (error) => {
      toast.error('Failed to update: ' + error.message);
    },
  });

  const folders = Array.from(
    new Set(documents.map((d) => d.folder).filter((f): f is string => !!f && f.trim().length > 0)),
  ).sort((a, b) => a.localeCompare(b));

  const moveToFolder = useMutation({
    mutationFn: async ({ ids, folder }: { ids: string[]; folder: string | null }) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('health_documents')
        .update({ folder: folder?.trim() || null })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['health-documents'] });
      toast.success(vars.folder ? `Moved to "${vars.folder}"` : 'Moved out of folder');
    },
    onError: (error: Error) => {
      toast.error('Could not move document: ' + error.message);
    },
  });

  const getDownloadUrl = async (filePath: string) => {
    const { data } = await supabase.storage
      .from('health-documents')
      .createSignedUrl(filePath, 3600);
    return data?.signedUrl;
  };

  return {
    documents,
    folders,
    isLoading,
    moveToFolder,
    uploadDocument,
    archiveDocument,
    restoreDocument,
    deleteDocument,
    updateDocument,
    triggerSummarize,
    getDownloadUrl,
  };
}
