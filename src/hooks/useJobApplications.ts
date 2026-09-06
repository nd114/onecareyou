import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const APPLICATION_STATUSES = [
  'pending',
  'reviewing',
  'interview',
  'offer',
  'hired',
  'no_show',
  'no_response',
  'rejected',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Human label for a status value (statuses are stored snake_case). */
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  no_show: 'No-show',
  no_response: 'No response',
  rejected: 'Rejected',
};

export const statusLabel = (status: string) =>
  APPLICATION_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');


export interface JobApplication {
  id: string;
  job_id: string;
  job_title: string;
  full_name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_path: string | null;
  cover_letter: string | null;
  years_experience: string | null;
  how_heard: string | null
  status: string;
  admin_notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** All applications — admin only (RLS enforced). */
export function useJobApplications() {
  return useQuery({
    queryKey: ['job-applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as JobApplication[];
    },
  });
}

export function useApplicationMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['job-applications'] });

  const updateApplication = useMutation({
    mutationFn: async ({
      id,
      status,
      admin_notes,
    }: {
      id: string;
      status?: string;
      admin_notes?: string | null;
    }) => {
      const patch: Record<string, unknown> = {};
      if (status !== undefined) patch.status = status;
      if (admin_notes !== undefined) patch.admin_notes = admin_notes;

      const { error } = await supabase.from('job_applications').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
      onError: (error: Error) => {
      toast.error(error.message || 'Could not update that application');
    },
});

  /** Archiving is reversible and never deletes the application record. */
  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('job_applications')
        .update({ archived_at: archived ? new Date().toISOString() : null } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
      onError: (error: Error) => {
      toast.error(error.message || 'Could not archive that application');
    },
});

  return { updateApplication, setArchived };
}


/** Creates a short-lived signed URL so an admin can open the applicant's resume. */
export async function getResumeUrl(path: string) {
  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(path, 300);

  if (error) throw error;
  return data.signedUrl;
}
