import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { parseOffboardingImpact, type OffboardingImpact } from '@/lib/offboarding';

/**
 * What ending this membership would leave behind. Read-only; fetched when the
 * confirmation opens, so the numbers are the ones at the moment of deciding.
 */
export function useOffboardingImpact(practiceId: string | null | undefined, userId: string | null | undefined) {
  return useQuery({
    queryKey: ['offboarding-impact', practiceId, userId],
    enabled: !!practiceId && !!userId,
    staleTime: 0,
    queryFn: async (): Promise<OffboardingImpact> => {
      const { data, error } = await supabase.rpc('offboarding_impact', {
        _practice_id: practiceId!,
        _user_id: userId!,
      });
      if (error) throw error;
      return parseOffboardingImpact(data);
    },
  });
}

export type HandoverKind = 'patient' | 'draft' | 'dictation' | 'task' | 'appointment' | 'proposal';

export interface HandoverItem {
  kind: HandoverKind;
  itemId: string;
  patientUserId: string | null;
  patientName: string | null;
  departedUserId: string | null;
  departedName: string | null;
  detail: string;
  since: string | null;
}

/**
 * The needs-cover list: what people who have left this practice left open.
 * The server scopes it — owners and admins see all of it, a department lead
 * the patients and drafts in their departments.
 */
export function usePracticeHandoverQueue(practiceId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['practice-handover-queue', practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<HandoverItem[]> => {
      const { data, error } = await supabase.rpc('practice_handover_queue', { _practice_id: practiceId! });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        kind: row.kind as HandoverKind,
        itemId: row.item_id,
        patientUserId: row.patient_user_id ?? null,
        patientName: row.patient_name ?? null,
        departedUserId: row.departed_user_id ?? null,
        departedName: row.departed_name ?? null,
        detail: row.detail,
        since: row.since ?? null,
      }));
    },
  });
  return { items: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

export type DepartedDraftAction = 'cosign' | 'entered_in_error' | 'archive';

/** A lead or manager decides about a departed author's draft or dictation. */
export function useResolveDepartedDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: 'encounter' | 'dictation';
      id: string;
      action: DepartedDraftAction;
      note?: string | null;
    }) => {
      const { error } = await supabase.rpc('resolve_departed_draft', {
        _kind: input.kind,
        _id: input.id,
        _action: input.action,
        _note: input.note ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['practice-handover-queue'] });
      queryClient.invalidateQueries({ queryKey: ['clinician-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      toast.success(
        vars.action === 'cosign'
          ? vars.kind === 'encounter'
            ? 'Signed off under your name; the note stays its author’s'
            : 'Written up as a draft note under your name — review and sign it from the patient’s record'
          : vars.action === 'archive'
            ? 'Archived. It is kept, not deleted.'
            : 'Marked entered in error. It is kept, not deleted.',
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Could not resolve that'),
  });
}

/** A manager withdraws a pending proposal whose proposer has left. */
export function useWithdrawDepartedProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { error } = await supabase.rpc('withdraw_change_proposal', {
        p_proposal_id: proposalId,
        p_reason: 'Withdrawn by the practice: the clinician who proposed it has left.',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-handover-queue'] });
      toast.success('Proposal withdrawn. The patient sees it as withdrawn.');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not withdraw that proposal'),
  });
}

/**
 * Hand a departed member's open task or future appointment to someone still
 * here. Plain updates under the existing manager policies; a zero-row result
 * means the policy refused, and is reported rather than shown as success.
 */
export function useReassignHandoverItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id, toUserId }: { kind: 'task' | 'appointment'; id: string; toUserId: string }) => {
      const { data, error } =
        kind === 'task'
          ? await supabase.from('practice_tasks').update({ assignee_user_id: toUserId }).eq('id', id).select('id')
          : await supabase.from('fhir_appointments').update({ clinician_user_id: toUserId }).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('You cannot reassign this one');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-handover-queue'] });
      toast.success('Reassigned');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not reassign that'),
  });
}

/** A member leaves a practice of their own accord. */
export function useLeavePractice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ practiceId, reason }: { practiceId: string; reason?: string | null }) => {
      const { error } = await supabase.rpc('leave_practice', {
        _practice_id: practiceId,
        _reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-members'] });
      queryClient.invalidateQueries({ queryKey: ['practice-memberships'] });
      toast.success('You have left the practice');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not leave the practice'),
  });
}

export interface PatientNotice {
  id: string;
  practiceId: string | null;
  /**
   * care_handed_over, guidance_withdrawn or document_received
   * (patient_notices_notice_type_check); each screen shows its own.
   */
  noticeType: string;
  relatedId: string | null;
  message: string;
  createdAt: string;
  seenAt: string | null;
}

/** Things the patient is told about their care that they did not do themselves. */
export function usePatientNotices() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['patient-notices', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<PatientNotice[]> => {
      const { data, error } = await supabase
        .from('patient_notices')
        .select('id, practice_id, notice_type, related_id, message, created_at, seen_at')
        .eq('patient_user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((n) => ({
        id: n.id,
        practiceId: n.practice_id,
        noticeType: n.notice_type,
        relatedId: n.related_id,
        message: n.message,
        createdAt: n.created_at,
        seenAt: n.seen_at,
      }));
    },
  });

  const markSeen = useMutation({
    mutationFn: async (noticeId: string) => {
      const { error } = await supabase.rpc('mark_patient_notice_seen', { _notice_id: noticeId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patient-notices'] }),
  });

  return { notices: query.data ?? [], isLoading: query.isLoading, markSeen };
}
