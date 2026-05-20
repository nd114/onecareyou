import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Message {
  id: string;
  patient_user_id: string;
  clinician_user_id: string;
  sender_user_id: string;
  body: string;
  attachment_path: string | null;
  read_at: string | null;
  created_at: string;
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
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('patient_user_id', patientId)
        .eq('clinician_user_id', clinicianId)
        .order('created_at', { ascending: true });
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
          if (row && row.clinician_user_id === clinicianId) {
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
    mutationFn: async (body: string) => {
      if (!user?.id || !patientId || !clinicianId) throw new Error('Missing thread participants');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Message is empty');
      const { data, error } = await supabase
        .from('messages')
        .insert({
          patient_user_id: patientId,
          clinician_user_id: clinicianId,
          sender_user_id: user.id,
          body: trimmed,
        })
        .select()
        .single();
      if (error) throw error;
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const unreadCount = messages.filter((m) => m.sender_user_id !== user?.id && !m.read_at).length;

  return { messages, isLoading, send, markRead, unreadCount };
}

/**
 * Lists threads for the current user (across all counterparties).
 * Returns latest-message-per-counterparty with unread count.
 */
export function useMessageThreads(role: 'patient' | 'clinician') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['message-threads', user?.id, role],
    queryFn: async () => {
      if (!user?.id) return [];
      const selfField = role === 'patient' ? 'patient_user_id' : 'clinician_user_id';
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq(selfField, user.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const byCounterparty = new Map<
        string,
        { counterpartyId: string; latest: Message; unread: number }
      >();
      for (const m of (data || []) as Message[]) {
        const counterpartyId =
          role === 'patient' ? m.clinician_user_id : m.patient_user_id;
        const existing = byCounterparty.get(counterpartyId);
        const isUnread = m.sender_user_id !== user.id && !m.read_at;
        if (!existing) {
          byCounterparty.set(counterpartyId, {
            counterpartyId,
            latest: m,
            unread: isUnread ? 1 : 0,
          });
        } else if (isUnread) {
          existing.unread += 1;
        }
      }
      return Array.from(byCounterparty.values());
    },
    enabled: !!user?.id,
  });
}
