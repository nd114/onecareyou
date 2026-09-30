import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { toMessageCounterparty, type MessageCounterparty } from '@/lib/message-thread-status';

export interface Message {
  id: string;
  patient_user_id: string;
  clinician_user_id: string;
  sender_user_id: string;
  body: string;
  attachment_path: string | null;
  read_at: string | null;
  created_at: string;
  /** The practice whose thread this is; null for a private-share thread. */
  practice_id?: string | null;
}

/**
 * 1:1 secure messaging between a patient and a clinician.
 * Pass the OTHER party's user id; the hook figures out which slot you fill.
 */
export function useMessages(otherPartyUserId: string | null, role: 'patient' | 'clinician') {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const patientId = role === 'patient' ? user?.id : otherPartyUserId;
  const clinicianId = role === 'clinician' ? user?.id : otherPartyUserId;
  const enabled = !!user?.id && !!otherPartyUserId;

  const queryKey = ['messages', patientId, clinicianId];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!patientId || !clinicianId) return [];
      // A clinician also sees the hospital threads of colleagues who have left
      // and whose patient they now look after: the conversation belongs to the
      // hospital, not to whoever held the case. Row policies decide which
      // practice rows those are; a private-share thread is never among them.
      const base = supabase.from('messages').select('*').eq('patient_user_id', patientId);
      const scoped =
        role === 'clinician'
          ? base.or(`clinician_user_id.eq.${clinicianId},practice_id.not.is.null`)
          : base.eq('clinician_user_id', clinicianId);
      const { data, error } = await scoped.order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled,
  });

  // Realtime subscription
  useEffect(() => {
    if (!enabled || !patientId || !clinicianId) return;
    const channel = supabase
      .channel(`messages-${patientId}-${clinicianId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `patient_user_id=eq.${patientId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as Message | undefined;
          if (row && (row.clinician_user_id === clinicianId || (role === 'clinician' && row.practice_id))) {
            queryClient.invalidateQueries({ queryKey });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, clinicianId, enabled]);

  const send = useMutation({
    mutationFn: async (input: string | { body: string; file?: File | null }) => {
      if (!user?.id || !patientId || !clinicianId) throw new Error('Missing thread participants');
      const body = typeof input === 'string' ? input : input.body;
      const file = typeof input === 'string' ? null : input.file ?? null;
      const trimmed = body.trim();
      if (!trimmed && !file) throw new Error('Message is empty');

      let attachmentPath: string | null = null;
      if (file) {
        if (file.size > 15 * 1024 * 1024) throw new Error('Attachments must be under 15MB');
        const safeName = file.name.replace(/[^\w.\-]/g, '_').slice(-80);
        attachmentPath = `${patientId}/${clinicianId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('message-attachments')
          .upload(attachmentPath, file, { contentType: file.type || 'application/octet-stream' });
        if (upErr) throw new Error(upErr.message || 'Failed to upload attachment');
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          patient_user_id: patientId,
          clinician_user_id: clinicianId,
          sender_user_id: user.id,
          body: trimmed || (file ? file.name : ''),
          attachment_path: attachmentPath,
        })
        .select()
        .single();
      if (error) {
        // The thread closed while the page was open (a share ended, a
        // clinician left): say so plainly rather than show a policy error.
        if (error.code === '42501') {
          queryClient.invalidateQueries({ queryKey: ['message-counterparties'] });
          throw new Error(
            role === 'patient'
              ? "This conversation has closed, so your message wasn't sent."
              : "You can no longer message this patient, so your message wasn't sent.",
          );
        }
        throw error;
      }
      return data as Message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to send message'),
  });

  const markRead = useMutation({
    mutationFn: async () => {
      if (!user?.id || !patientId || !clinicianId) return;
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('patient_user_id', patientId)
        .eq('clinician_user_id', clinicianId)
        .neq('sender_user_id', user.id)
        .is('read_at', null);
      if (error) throw error;
      // Messages the patient sent into a departed colleague's hospital thread
      // are marked read through the server, which changes only that column.
      if (role === 'clinician') {
        const { error: inherited } = await supabase.rpc('mark_practice_thread_read', {
          _patient_user_id: patientId,
        });
        if (inherited) throw inherited;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // For a clinician only the patient's words are waiting to be read; a
  // departed colleague's messages in an inherited thread are not.
  const unreadCount = messages.filter(
    (m) =>
      m.sender_user_id !== user?.id &&
      (role === 'patient' || m.sender_user_id === patientId) &&
      !m.read_at,
  ).length;

  return { messages, isLoading, send, markRead, unreadCount };
}

/**
 * The patient's conversations: every clinician they have a thread with, have
 * shared with directly, or are assigned to at a hospital, each with whether a
 * message can be sent and, if not, why. The answer is the database's own
 * (`my_message_counterparties()` uses the helper the INSERT policy uses), so a
 * composer is never offered for a thread nobody would read.
 */
export function useMessageCounterparties() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['message-counterparties', user?.id],
    queryFn: async (): Promise<MessageCounterparty[]> => {
      const { data, error } = await supabase.rpc('my_message_counterparties');
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(toMessageCounterparty);
    },
    enabled: !!user?.id,
  });
}

export interface MessageHistoryPatient {
  patientUserId: string;
  patientName: string | null;
  practiceId: string | null;
  practiceName: string | null;
  lastAt: string;
}

/**
 * For a clinician: the patients whose conversations they still read. A
 * conversation is part of the medical record and outlives the relationship
 * (20261010100000), but the Messages screen is built from live relationships,
 * so without this an ended thread the database keeps for them could not be
 * reached. Names only; the row policies decide which threads these are.
 */
export function useMessageHistoryPatients(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['message-history-patients', user?.id],
    queryFn: async (): Promise<MessageHistoryPatient[]> => {
      const { data, error } = await supabase.rpc('my_message_history_patients');
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        patientUserId: String(r.patient_user_id),
        patientName: (r.patient_name as string) ?? null,
        practiceId: (r.practice_id as string) ?? null,
        practiceName: (r.practice_name as string) ?? null,
        lastAt: String(r.last_at ?? ''),
      }));
    },
    enabled: enabled && !!user?.id,
  });
}

export interface MessageThreadSummary {
  counterpartyId: string;
  lastBody: string;
  lastAt: string;
  lastSenderUserId: string;
  lastHasAttachment: boolean;
  unread: number;
  total: number;
}

/**
 * One row per conversation, newest first.
 *
 * This used to fetch the 500 most recent messages and group them in the
 * browser. Past that ceiling a conversation vanished from the inbox and its
 * unread badge read zero — silently, and worst for the busiest clinician.
 * my_message_threads() does the grouping in SQL over the whole table; it is
 * SECURITY INVOKER, so the row policies still decide what is countable.
 */
export function useMessageThreads(role: 'patient' | 'clinician') {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['message-threads', user?.id, role];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user?.id) return [] as MessageThreadSummary[];
      const { data, error } = await supabase.rpc('my_message_threads', { _role: role });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        counterpartyId: r.counterparty_id as string,
        lastBody: (r.last_body ?? '') as string,
        lastAt: r.last_at as string,
        lastSenderUserId: r.last_sender_user_id as string,
        lastHasAttachment: !!r.last_has_attachment,
        unread: Number(r.unread ?? 0),
        total: Number(r.total ?? 0),
      })) as MessageThreadSummary[];
    },
    enabled: !!user?.id,
  });

  // The list itself needs to move when a message arrives in a conversation the
  // reader is not currently looking at. Without this the badge and the ordering
  // only caught up on a refetch, so a new message from another patient was
  // invisible until you navigated away and back.
  useEffect(() => {
    if (!user?.id) return;
    const selfField = role === 'patient' ? 'patient_user_id' : 'clinician_user_id';
    const channel = supabase
      .channel(`message-threads-${role}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `${selfField}=eq.${user.id}`,
        },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role]);

  return query;
}
