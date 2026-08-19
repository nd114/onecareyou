import { useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAIConversations, conversationSourceLabel } from '@/hooks/useAIConversations';

/**
 * Lets the assistant sheet pick up an earlier conversation without leaving the
 * page. The stored transcript becomes the live context, so the next answer is
 * grounded in what was already said.
 */
export function ConversationHistoryMenu({
  onLoad,
}: {
  onLoad: (history: { role: 'user' | 'assistant'; content: string; createdAt?: string }[]) => void;
}) {
  const { conversations, isLoading } = useAIConversations();
  const [open, setOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

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

    onLoad(
      data
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: m.created_at,
        })),
    );
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Past conversations">
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={8} className="w-[19rem] p-0 overflow-hidden">
        <div className="px-3 py-2.5 border-b bg-muted/40">
          <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Past conversations
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Pick one up where you left off
          </p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            Nothing saved yet — ask something and it will show up here.
          </p>
        ) : (
          <ScrollArea className="h-[19rem]">
            <ul className="p-1.5 space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    disabled={loadingId !== null}
                    onClick={() => resume(conversation.id)}
                    className="w-full text-left rounded-lg border border-transparent px-2.5 py-2 hover:bg-muted hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors disabled:opacity-60"
                  >
                    <span className="block text-sm font-medium leading-snug line-clamp-2">
                      {conversation.preview ?? 'Conversation'}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {conversationSourceLabel(conversation.source)} ·{' '}
                      {formatDistanceToNow(new Date(conversation.startedAt), { addSuffix: true })}
                      {loadingId === conversation.id && ' · opening…'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
