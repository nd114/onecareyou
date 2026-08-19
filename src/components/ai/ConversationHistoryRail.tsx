import { useState } from 'react';
import { MessageSquare, Loader2, PanelLeftClose } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAIConversations, conversationSourceLabel } from '@/hooks/useAIConversations';
import { cn } from '@/lib/utils';

export type LoadedHistory = { role: 'user' | 'assistant'; content: string; createdAt?: string }[];

/**
 * History rail for the assistant drawer. Sits on the left of the live chat, so
 * picking up an earlier conversation feels like switching threads rather than
 * hunting through a dropdown.
 */
export function ConversationHistoryRail({
  onLoad,
  onClose,
  className,
}: {
  onLoad: (history: LoadedHistory) => void;
  onClose: () => void;
  className?: string;
}) {
  const { conversations, isLoading } = useAIConversations();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const resume = async (id: string) => {
    setLoadingId(id);
    const { data, error } = await supabase
      .from('ai_messages')
      .select('role, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    setLoadingId(null);

    if (error || !data?.length) {
      toast.error('Could not open that conversation. Please try again.');
      return;
    }

    setActiveId(id);
    onLoad(
      data
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: m.created_at,
        })),
    );
  };

  return (
    <aside className={cn('flex flex-col border-r bg-muted/30 min-h-0', className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Conversations
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={onClose}
          title="Hide history"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : conversations.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Nothing saved yet — ask something and it will show up here.
        </p>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
            {conversations.map((conversation) => {
              const isActive = activeId === conversation.id;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    disabled={loadingId !== null}
                    onClick={() => resume(conversation.id)}
                    className={cn(
                      'w-full text-left rounded-lg border px-2.5 py-2 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-transparent hover:border-border hover:bg-background',
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug line-clamp-2">
                          {conversation.preview ?? 'Conversation'}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {conversationSourceLabel(conversation.source)} ·{' '}
                          {formatDistanceToNow(new Date(conversation.startedAt), {
                            addSuffix: true,
                          })}
                          {loadingId === conversation.id && ' · opening…'}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </aside>
  );
}
