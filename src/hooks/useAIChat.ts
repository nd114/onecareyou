import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedRoute?: string | null;
  timestamp: Date;
}

export type AIChatError = { kind: 'consent_required' | 'rate_limit' | 'unavailable' | 'unknown'; message: string };

export function useAIChat() {
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
        body: { messages: history },
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

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        suggestedRoute: data.suggestedRoute,
        timestamp: new Date(),
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
  }, [messages, isLoading]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearChat };
}

