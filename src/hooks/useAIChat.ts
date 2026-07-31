import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { ProposedAction, ActionOutcome, executeAction } from '@/lib/ai-actions';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedRoute?: string | null;
  timestamp: Date;
  /** Actions the assistant wants to take — nothing happens until approved. */
  proposedActions?: ProposedAction[];
  /** Set once the user approves or discards the proposal. */
  actionState?: 'pending' | 'applying' | 'applied' | 'discarded';
  actionOutcomes?: ActionOutcome[];
}

export type AIChatError = { kind: 'consent_required' | 'rate_limit' | 'unavailable' | 'unknown'; message: string };

interface UseAIChatOptions {
  /** Set false for read-only surfaces (e.g. Simple Mode). */
  allowActions?: boolean;
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const allowActions = options.allowActions !== false;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AIChatError | null>(null);

  const sendMessage = useCallback(async (userMessage: string): Promise<AIChatError | null> => {
    if (!userMessage.trim() || isLoading) return null;

    setError(null);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error: fnError } = await supabase.functions.invoke('patient-ai-chat', {
        body: { messages: history, allowActions },
      });

      // supabase.functions.invoke returns FunctionsHttpError on non-2xx; the
      // `data` payload still carries our JSON error body, so inspect that first.
      if (data?.error) {
        const raw: string = data.error;
        const lower = raw.toLowerCase();
        let kind: AIChatError['kind'] = 'unknown';
        if (lower.includes('consent')) kind = 'consent_required';
        else if (lower.includes('too many') || lower.includes('rate')) kind = 'rate_limit';
        else if (lower.includes('unavailable') || lower.includes('not configured')) kind = 'unavailable';
        const err: AIChatError = { kind, message: raw };
        setError(err);
        // Don't echo a synthetic assistant message for consent — the caller
        // will surface the consent dialog instead.
        if (kind !== 'consent_required') {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: raw,
            timestamp: new Date(),
          }]);
        } else {
          // Roll back the optimistic user message so it doesn't sit there orphaned
          setMessages(prev => prev.filter(m => m.id !== userMsg.id));
        }
        return err;
      }

      if (fnError) throw new Error(fnError.message || 'Failed to get response');

      const proposed: ProposedAction[] = allowActions && Array.isArray(data.proposedActions)
        ? data.proposedActions
        : [];

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        suggestedRoute: data.suggestedRoute,
        timestamp: new Date(),
        proposedActions: proposed.length > 0 ? proposed : undefined,
        actionState: proposed.length > 0 ? 'pending' : undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      const errObj: AIChatError = { kind: 'unknown', message: msg };
      setError(errObj);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I couldn't respond right now. ${msg}`,
        timestamp: new Date(),
      }]);
      return errObj;
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, allowActions]);

  /** Run the actions the assistant proposed — only ever called from an explicit user approval. */
  const approveActions = useCallback(async (messageId: string) => {
    if (!user?.id) return;
    const target = messages.find(m => m.id === messageId);
    if (!target?.proposedActions || target.actionState !== 'pending') return;

    setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, actionState: 'applying' } : m)));

    const outcomes: ActionOutcome[] = [];
    for (const action of target.proposedActions) {
      outcomes.push(await executeAction(action, user.id));
    }

    // Refresh anything the actions may have touched.
    queryClient.invalidateQueries({ queryKey: ['medications', user.id] });
    queryClient.invalidateQueries({ queryKey: ['schedule_entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['vitals', user.id] });

    setMessages(prev => prev.map(m => (
      m.id === messageId ? { ...m, actionState: 'applied', actionOutcomes: outcomes } : m
    )));

    return outcomes;
  }, [messages, user?.id, queryClient]);

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
