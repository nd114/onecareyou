import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The patient's own AI conversations.
 *
 * These were already being written to ai_conversations / ai_messages, but the
 * only place they surfaced was a list in Settings that could delete a
 * conversation and not open it — so the record existed and was unreadable by
 * the person it belonged to. This backs the AI pillar, where a conversation can
 * actually be read back.
 */

export interface AIConversationSummary {
  id: string;
  source: string;
  startedAt: string;
  messageCount: number;
  /** First thing the patient asked — far more useful as a label than a date. */
  preview: string | null;
}

export interface AIConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  inputModality: string;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  simple_mode: 'Simple view',
  drawer: 'Assistant',
};

export function conversationSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? 'Assistant';
}

export function useAIConversations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['ai-conversations', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AIConversationSummary[]> => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('id, source, started_at, message_count')
        .eq('user_id', user!.id)
        .order('started_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const conversations = data ?? [];
      if (conversations.length === 0) return [];

      // One extra query for all the opening lines, rather than one per row.
      const { data: firstMessages } = await supabase
        .from('ai_messages')
        .select('conversation_id, content, created_at, role')
        .in('conversation_id', conversations.map((c) => c.id))
        .eq('role', 'user')
        .order('created_at', { ascending: true });

      const previewByConversation = new Map<string, string>();
      for (const message of firstMessages ?? []) {
        if (!previewByConversation.has(message.conversation_id)) {
          previewByConversation.set(message.conversation_id, message.content);
        }
      }

      return conversations.map((c) => ({
        id: c.id,
        source: c.source,
        startedAt: c.started_at,
        messageCount: c.message_count,
        preview: previewByConversation.get(c.id) ?? null,
      }));
    },
  });

  const remove = useMutation({
    mutationFn: async (conversationId: string) => {
      // Messages first: the row they hang off is what scopes them.
      const { error: msgError } = await supabase
        .from('ai_messages')
        .delete()
        .eq('conversation_id', conversationId);
      if (msgError) throw msgError;
      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
  });

  return {
    conversations: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error,
    remove,
  };
}

export function useAIConversation(conversationId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['ai-conversation', conversationId, user?.id],
    enabled: !!conversationId && !!user?.id,
    queryFn: async (): Promise<AIConversationMessage[]> => {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('id, role, content, input_modality, created_at')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id,
        role: m.role as AIConversationMessage['role'],
        content: m.content,
        inputModality: m.input_modality,
        createdAt: m.created_at,
      }));
    },
  });
}
