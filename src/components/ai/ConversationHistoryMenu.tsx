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
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Continue a past conversation
        </p>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Nothing saved yet — ask something and it will show up here.
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="space-y-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    disabled={loadingId !== null}
                    onClick={() => resume(conversation.id)}
                    className="w-full text-left rounded-md px-2 py-2 hover:bg-muted transition-colors disabled:opacity-60"
                  >
                    <span className="block text-sm truncate">
                      {conversation.preview ?? 'Conversation'}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
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
