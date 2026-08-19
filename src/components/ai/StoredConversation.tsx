import { Bot, Loader2, Mic, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import { useAIConversation } from '@/hooks/useAIConversations';
import { cn } from '@/lib/utils';

/**
 * One stored conversation, read back.
 *
 * Deliberately read-only: continuing an old thread would mean replaying it into
 * the model, and the assistant's consent model scopes each exchange to what the
 * patient has agreed to share right now.
 */
export function StoredConversation({ conversationId }: { conversationId: string }) {
  const { data: messages, isLoading, error } = useAIConversation(conversationId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !messages || messages.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="font-medium mb-1">Conversation not found</p>
        <p className="text-sm text-muted-foreground">
          It may have been deleted. Your other conversations are listed alongside.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <div key={message.id} className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
            {!isUser && (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={cn('max-w-[80%] min-w-0', isUser && 'text-right')}>
              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm text-left',
                  isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                ) : (
                  <MarkdownMessage content={message.content} />
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5 justify-end">
                {message.inputModality === 'voice' && (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 gap-1">
                    <Mic className="h-2.5 w-2.5" />
                    Spoken
                  </Badge>
                )}
                {format(new Date(message.createdAt), 'd MMM yyyy, HH:mm')}
              </p>
            </div>
            {isUser && (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
