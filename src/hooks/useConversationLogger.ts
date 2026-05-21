import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Lightweight conversation logger for Simple Mode / AI Drawer.
 *
 * On the first logged message we create an `ai_conversations` row, then
 * append every message into `ai_messages`. Failures are swallowed (the chat
 * UX must never break because logging hiccuped) and surfaced to console.
 *
 * Retention: rows persist by default. Users can purge from Settings → AI
 * History. The policy text there explains why we keep this (safety review,
 * abuse detection, regulatory traceability) and that continued use of
 * Simple Mode constitutes consent to the retention.
 */
type Modality = 'text' | 'voice' | 'image_ocr';

interface LogMessageInput {
  role: 'user' | 'assistant';
  content: string;
  inputModality?: Modality;
  audioPath?: string | null;
  imagePath?: string | null;
  metadata?: Record<string, unknown>;
}

export function useConversationLogger(source: 'simple_mode' | 'drawer') {
  const { user } = useAuth();
  const conversationIdRef = useRef<string | null>(null);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    if (conversationIdRef.current) return conversationIdRef.current;
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, source })
      .select('id')
      .single();
    if (error) {
      console.warn('[conversation-log] failed to create conversation', error);
      return null;
    }
    conversationIdRef.current = data.id;
    return data.id;
  }, [user, source]);

  const logMessage = useCallback(async (input: LogMessageInput) => {
    if (!user) return;
    const conversationId = await ensureConversation();
    if (!conversationId) return;
    const { error } = await supabase.from('ai_messages').insert([{
      conversation_id: conversationId,
      user_id: user.id,
      role: input.role,
      content: input.content,
      input_modality: input.inputModality ?? 'text',
      audio_path: input.audioPath ?? null,
      image_path: input.imagePath ?? null,
      metadata: (input.metadata ?? {}) as never,
    }]);
    if (error) {
      console.warn('[conversation-log] failed to log message', error);
    }
  }, [user, ensureConversation]);




  const reset = useCallback(() => {
    conversationIdRef.current = null;
  }, []);

  return { logMessage, reset };
}
