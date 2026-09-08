/**
 * Changes a clinician proposes and the patient decides on.
 *
 * The distinction this hook exists to hold: a clinician's account of care —
 * an encounter, a note, a reading they took — is written directly and the
 * patient sees it. A change to the patient's *own* data is proposed, and
 * nothing happens until they answer. The medication list is theirs; a
 * prescriber's opinion about it is a request, not a write.
 *
 * Every status transition goes through a database function rather than an
 * UPDATE, so "accepted" cannot come to mean anything other than "the patient
 * accepted and the change was applied".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ProposalKind = 'medication_start' | 'medication_change' | 'medication_stop';
export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

/** The medication fields a proposal is allowed to touch. */
export interface ProposalPayload {
  name?: string;
  dosage?: string;
  frequency?: string;
  type?: string;
  instructions?: string;
  start_date?: string;
  end_date?: string;
  refill_date?: string;
  quantity?: number;
  prescriber?: string;
  pharmacy?: string;
  times_of_day?: string[];
}

export interface ChangeProposal {
  id: string;
  patient_user_id: string;
  proposed_by_user_id: string;
  kind: ProposalKind;
  medication_id: string | null;
  payload: ProposalPayload;
  rationale: string | null;
  status: ProposalStatus;
  responded_at: string | null;
  response_note: string | null;
  applied_medication_id: string | null;
  created_at: string;
}

/** The generated types predate this table; the shape is asserted here instead. */
const proposals = () =>
  (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          order: (col: string, o: { ascending: boolean }) => Promise<{
            data: ChangeProposal[] | null;
            error: { message: string } | null;
          }>;
        };
      };
      insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    };
  }).from('record_change_proposals');

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  }).rpc(fn, args);

/**
 * Plain English for what is being asked.
 *
 * A proposal that renders as "medication_change" is a proposal nobody can
 * answer. The dose belongs in the summary line rather than a detail row
 * because it is the entire decision.
 */
export function describeProposal(p: ChangeProposal, medicationName?: string): { title: string; detail: string | null } {
  const named = medicationName ?? p.payload.name ?? 'a medication';

  if (p.kind === 'medication_start') {
    const strength = [p.payload.dosage, p.payload.frequency].filter(Boolean).join(', ');
    return {
      title: `Start ${p.payload.name ?? 'a new medication'}`,
      detail: strength || null,
    };
  }

  if (p.kind === 'medication_stop') {
    return { title: `Stop ${named}`, detail: null };
  }

  // A change lists only what it changes, because that is what is being agreed
  // to. Showing unchanged fields alongside makes the reader hunt for the edit.
  const changes: string[] = [];
  if (p.payload.dosage) changes.push(`dose to ${p.payload.dosage}`);
  if (p.payload.frequency) changes.push(`frequency to ${p.payload.frequency}`);
  if (p.payload.instructions) changes.push('instructions');
  if (p.payload.name) changes.push(`name to ${p.payload.name}`);
  if (p.payload.quantity !== undefined) changes.push(`quantity to ${p.payload.quantity}`);
  if (p.payload.refill_date) changes.push(`refill date to ${p.payload.refill_date}`);

  return {
    title: `Change ${named}`,
    detail: changes.length ? changes.join(', ') : 'Details in the note below',
  };
}

/**
 * The patient's side: what has been proposed about their record.
 *
 * Answered proposals stay in the list. A declined change is as much a part of
 * the history as an accepted one — the patient should be able to point at the
 * moment they said no, and so should the clinic.
 */
export function useChangeProposals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['change-proposals', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await proposals()
        .select('*')
        .eq('patient_user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!user,
  });

  const respond = useMutation({
    mutationFn: async ({ id, accept, note }: { id: string; accept: boolean; note?: string }) => {
      const { error } = await rpc('respond_to_change_proposal', {
        p_proposal_id: id,
        p_accept: accept,
        p_note: note?.trim() || null,
      });
      if (error) throw new Error(error.message);
      return accept;
    },
    onSuccess: (accepted) => {
      queryClient.invalidateQueries({ queryKey: ['change-proposals'] });
      // The medication list changed underneath, and so did everything derived
      // from it — the schedule, adherence, the interaction check.
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      toast.success(accepted ? 'Change applied to your record' : 'Declined');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Could not record your answer');
    },
  });

  return {
    proposals: data,
    pending: data.filter((p) => p.status === 'pending'),
    isLoading,
    respond,
  };
}

/**
 * The clinician's side: propose a change, or take one back.
 *
 * There is no accept here on purpose. A clinician who could answer their own
 * proposal would have write access to the patient's medication list with an
 * extra step, which is the thing this replaced.
 */
export function useProposeChange(patientUserId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['proposals-made', user?.id, patientUserId],
    queryFn: async () => {
      if (!user || !patientUserId) return [];
      const { data, error } = await proposals()
        .select('*')
        .eq('patient_user_id', patientUserId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      // RLS already limits this to proposals either side of, but a clinician
      // reading a patient's list should see their own, not a colleague's.
      return (data ?? []).filter((p) => p.proposed_by_user_id === user.id);
    },
    enabled: !!user && !!patientUserId,
  });

  const propose = useMutation({
    mutationFn: async ({
      kind,
      medicationId,
      payload,
      rationale,
    }: {
      kind: ProposalKind;
      medicationId?: string | null;
      payload: ProposalPayload;
      rationale?: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      if (!patientUserId) throw new Error('No patient selected');

      const { error } = await proposals().insert({
        patient_user_id: patientUserId,
        proposed_by_user_id: user.id,
        kind,
        medication_id: kind === 'medication_start' ? null : medicationId ?? null,
        payload,
        rationale: rationale?.trim() || null,
      });
      // The insert policy checks for a live medications share, so the common
      // failure here is a patient who has revoked access since this screen
      // loaded — worth saying plainly rather than as a policy error.
      if (error) {
        throw new Error(
          /row-level security|policy/i.test(error.message)
            ? 'This patient is not currently sharing their medications with you.'
            : error.message,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals-made'] });
      toast.success('Sent to the patient to accept');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await rpc('withdraw_change_proposal', {
        p_proposal_id: id,
        p_reason: reason?.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals-made'] });
      toast.success('Withdrawn');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not withdraw that'),
  });

  return { proposalsMade: data, isLoading, propose, withdraw };
}
