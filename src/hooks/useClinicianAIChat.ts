import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  ClinicianProposedAction,
  ClinicianActionOutcome,
  executeClinicianAction,
} from '@/lib/clinician-ai-actions';

export interface ClinicianChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedRoute?: string | null;
  timestamp: Date;
  proposedActions?: ClinicianProposedAction[];
  actionState?: 'pending' | 'applying' | 'applied' | 'discarded';
  actionOutcomes?: ClinicianActionOutcome[];
}

export type ClinicianAIError = { kind: 'forbidden' | 'rate_limit' | 'unavailable' | 'unknown'; message: string };

const PERSIST_KEY = 'onecare.clinician-assistant.v1';
const MAX_PERSISTED = 60;

function loadPersisted(): ClinicianChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((m: ClinicianChatMessage) => ({
      ...m,
      timestamp: new Date(m.timestamp),
      // Never restore an un-actioned draft — it may no longer be valid.
      proposedActions: m.actionState === 'pending' ? undefined : m.proposedActions,
      actionState: m.actionState === 'pending' ? undefined : m.actionState,
    }));
  } catch {
    return [];
  }
}

export function useClinicianAIChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ClinicianChatMessage[]>(() => loadPersisted());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ClinicianAIError | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify(messages.slice(-MAX_PERSISTED)));
    } catch {
      /* best-effort persistence */
    }
  }, [messages]);

  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return null;
    setError(null);

    const userMsg: ClinicianChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = [...messages, userMsg].map(m => {
        let content = m.content;
        if (m.role === 'assistant' && m.proposedActions?.length) {
          const status =
            m.actionState === 'applied'
              ? `SYSTEM NOTE: the clinician approved your previous draft. Results: ${(m.actionOutcomes ?? [])
                  .map(o => `${o.ok ? 'done' : 'FAILED'} — ${o.message}`)
                  .join('; ')}`
              : m.actionState === 'discarded'
                ? 'SYSTEM NOTE: the clinician discarded your previous draft — nothing was sent or saved.'
                : 'SYSTEM NOTE: your previous draft is still awaiting approval — nothing has been sent or saved.';
          content = `${content}\n\n${status}`;
        }
        return { role: m.role, content };
      });

      const { data, error: fnError } = await supabase.functions.invoke('clinician-ai-chat', {
        body: { messages: history },
      });

      if (data?.error) {
        const raw: string = data.error;
        const lower = raw.toLowerCase();
        const kind: ClinicianAIError['kind'] = lower.includes('clinician access')
          ? 'forbidden'
          : lower.includes('too many') || lower.includes('rate')
            ? 'rate_limit'
            : lower.includes('unavailable') || lower.includes('not configured')
              ? 'unavailable'
              : 'unknown';
        setError({ kind, message: raw });
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: raw,
          timestamp: new Date(),
        }]);
        return { kind, message: raw } as ClinicianAIError;
      }

      if (fnError) throw new Error(fnError.message || 'Failed to get response');

      const proposed: ClinicianProposedAction[] = Array.isArray(data.proposedActions)
        ? data.proposedActions
        : [];

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        suggestedRoute: data.suggestedRoute,
        timestamp: new Date(),
        proposedActions: proposed.length > 0 ? proposed : undefined,
        actionState: proposed.length > 0 ? 'pending' : undefined,
      }]);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError({ kind: 'unknown', message: msg });
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I couldn't respond right now. ${msg}`,
        timestamp: new Date(),
      }]);
      return { kind: 'unknown', message: msg } as ClinicianAIError;
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const approveActions = useCallback(async (messageId: string) => {
    if (!user?.id) return;
    const target = messages.find(m => m.id === messageId);
    if (!target?.proposedActions || target.actionState !== 'pending') return;

    setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, actionState: 'applying' } : m)));

    const outcomes: ClinicianActionOutcome[] = [];
    for (const action of target.proposedActions) {
      outcomes.push(await executeClinicianAction(action, { id: user.id, email: user.email }));
    }

    const touched = [
      'messages', 'clinician-messages', 'clinician-guidance', 'guidance',
      'clinician-alert-rules', 'alert-rules', 'triage-inbox', 'patient-action-log',
    ];
    queryClient.invalidateQueries({
      predicate: (query) => touched.includes(String(query.queryKey[0])),
    });

    setMessages(prev => prev.map(m => (
      m.id === messageId ? { ...m, actionState: 'applied', actionOutcomes: outcomes } : m
    )));

    return outcomes;
  }, [messages, user?.id, user?.email, queryClient]);

  const discardActions = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m => (
      m.id === messageId && m.actionState === 'pending' ? { ...m, actionState: 'discarded' } : m
    )));
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearChat, approveActions, discardActions };
}
