import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from "@/integrations/supabase/types";
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
  /** The patient this message concerned, when it concerned one. */
  patientUserId?: string | null;
  metadata?: Record<string, Json>;
}

export function useConversationLogger(source: 'simple_mode' | 'drawer') {
  const { user } = useAuth();
  const conversationIdRef = useRef<string | null>(null);
  const countRef = useRef(0);

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
    countRef.current = 0;
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
      // Which patient this message was about, when it was about one. Set from
      // the record queries the assistant resolved, so it reflects what was
      // actually looked at rather than what was typed.
      patient_user_id: input.patientUserId ?? null,
      metadata: (input.metadata ?? {}) as never,
    }]);
    if (error) {
      console.warn('[conversation-log] failed to log message', error);
      return;
    }
    // Keep the count the history lists show in step with reality.
    countRef.current += 1;
    const { error: countError } = await supabase
      .from('ai_conversations')
      .update({ message_count: countRef.current })
      .eq('id', conversationId);
    if (countError) {
      console.warn('[conversation-log] failed to update message count', countError);
    }
  }, [user, ensureConversation]);

  /**
   * Continue logging into an existing conversation (the user reopened it from
   * history), so the thread stays one record instead of splitting in two.
   */
  const adopt = useCallback(async (conversationId: string) => {
    conversationIdRef.current = conversationId;
    const { data } = await supabase
      .from('ai_conversations')
      .select('message_count')
      .eq('id', conversationId)
      .maybeSingle();
    countRef.current = data?.message_count ?? 0;
  }, []);

  const reset = useCallback(() => {
    conversationIdRef.current = null;
    countRef.current = 0;
  }, []);

  return { logMessage, adopt, reset };
}

