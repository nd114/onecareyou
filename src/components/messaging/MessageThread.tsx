import { useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMessages } from '@/hooks/useMessages';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface Props {
  otherPartyUserId: string | null;
  otherPartyName: string;
  role: 'patient' | 'clinician';
  className?: string;
}

function formatStamp(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

export function MessageThread({ otherPartyUserId, otherPartyName, role, className }: Props) {
  const { user } = useAuth();
  const { messages, isLoading, send, markRead } = useMessages(otherPartyUserId, role);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark messages as read when thread is viewed
  useEffect(() => {
    if (otherPartyUserId && messages.some((m) => m.sender_user_id !== user?.id && !m.read_at)) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherPartyUserId, messages.length]);

  const handleSend = async () => {
    if (!draft.trim() || send.isPending) return;
    try {
      await send.mutateAsync(draft);
      setDraft('');
    } catch {
      /* toast handled in hook */
    }
  };

  if (!otherPartyUserId) {
    return (
      <div className={cn('flex flex-col items-center justify-center text-center p-8 text-muted-foreground', className)}>
        <MessageSquare className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">Select a {role === 'patient' ? 'clinician' : 'patient'} to start a conversation.</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full min-h-[400px]', className)}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">
            No messages yet. Say hello to {otherPartyName}.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === user?.id;
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words',
                    mine
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm',
                  )}
                >
                  <div>{m.body}</div>
                  <div className={cn('text-[10px] mt-1 opacity-70', mine ? 'text-right' : 'text-left')}>
                    {formatStamp(m.created_at)}
                    {mine && m.read_at && ' • Read'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t p-3 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${otherPartyName}…`}
          rows={1}
          className="min-h-[40px] max-h-32 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button onClick={handleSend} disabled={!draft.trim() || send.isPending} size="icon" className="shrink-0">
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground px-3 pb-2 text-center">
        Messages are encrypted at rest. Not for emergencies — call 911 or your local emergency number.
      </p>
    </div>
  );
}
