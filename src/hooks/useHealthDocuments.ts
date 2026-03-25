import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
  source_context: string;
  created_at: string;
  updated_at: string;
}

export function useHealthDocuments() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['health-documents', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('health_documents')
        .select('*')
        .eq('user_id', user.id)
        .order('document_date', { ascending: false, nullsFirst: false });
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
    }: {
      file: File;
      title: string;
      category: DocumentCategory;
      documentDate?: string;
      notes?: string;
      aiSummarize?: boolean;
      sourceContext?: string;
      familyMemberId?: string | null;
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
          tags: [],
          source_context: sourceContext,
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

  const getDownloadUrl = async (filePath: string) => {
    const { data } = await supabase.storage
      .from('health-documents')
      .createSignedUrl(filePath, 3600);
    return data?.signedUrl;
  };

  return {
    documents,
    isLoading,
    uploadDocument,
    deleteDocument,
    updateDocument,
    triggerSummarize,
    getDownloadUrl,
  };
}
