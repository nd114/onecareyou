import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { Send, Loader2, MessageSquare, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessages, type Message } from '@/hooks/useMessages';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Props {
  otherPartyUserId: string | null;
  otherPartyName: string;
  role: 'patient' | 'clinician';
  className?: string;
}

function formatStamp(iso: string) {
  return format(new Date(iso), 'h:mm a');
}

function formatDayHeader(d: Date) {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d');
}

interface DaySection {
  date: Date;
  groups: { senderId: string; items: Message[] }[];
}

function groupMessages(messages: Message[]): DaySection[] {
  const days: DaySection[] = [];
  for (const m of messages) {
    const created = new Date(m.created_at);
    let day = days[days.length - 1];
    if (!day || !isSameDay(day.date, created)) {
      day = { date: created, groups: [] };
      days.push(day);
    }
    const lastGroup = day.groups[day.groups.length - 1];
    const last = lastGroup?.items[lastGroup.items.length - 1];
    const within3min =
      last && new Date(m.created_at).getTime() - new Date(last.created_at).getTime() < 3 * 60 * 1000;
    if (lastGroup && lastGroup.senderId === m.sender_user_id && within3min) {
      lastGroup.items.push(m);
    } else {
      day.groups.push({ senderId: m.sender_user_id, items: [m] });
    }
  }
  return days;
}

export function MessageThread({ otherPartyUserId, otherPartyName, role, className }: Props) {
  const { user } = useAuth();
  const { messages, isLoading, send, markRead } = useMessages(otherPartyUserId, role);
  const [draft, setDraft] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Stable channel key so both sides agree (sorted ids)
  const channelKey = useMemo(() => {
    if (!user?.id || !otherPartyUserId) return null;
    return ['typing', ...[user.id, otherPartyUserId].sort()].join('-');
  }, [user?.id, otherPartyUserId]);

  // Typing indicator via Realtime broadcast
  useEffect(() => {
    if (!channelKey || !user?.id) return;
    const channel = supabase.channel(channelKey, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.userId && payload.payload.userId !== user.id) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = window.setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [channelKey, user?.id]);

  const broadcastTyping = () => {
    if (!channelKey || !user?.id) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = now;
    supabase.channel(channelKey).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id },
    });
  };

  // Auto-scroll on new messages / typing
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, otherTyping]);

  // Mark as read when viewing
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
      /* hook surfaces toast */
    }
  };

  if (!otherPartyUserId) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center text-center p-8 text-muted-foreground',
          className,
        )}
      >
        <MessageSquare className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">
          Select a {role === 'patient' ? 'clinician' : 'patient'} to start a conversation.
        </p>
      </div>
    );
  }

  const sections = groupMessages(messages);

  return (
    <div className={cn('flex flex-col h-full min-h-[400px]', className)}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center text-center text-sm text-muted-foreground py-10 gap-2">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p>No messages yet. Say hello to {otherPartyName}.</p>
          </div>
        ) : (
          sections.map((day) => (
            <div key={day.date.toISOString()} className="space-y-3">
              <div className="flex items-center justify-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                  {formatDayHeader(day.date)}
                </span>
              </div>
              {day.groups.map((group, gi) => {
                const mine = group.senderId === user?.id;
                return (
                  <div key={gi} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
                    {group.items.map((m, mi) => {
                      const isLast = mi === group.items.length - 1;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
                            mine
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground',
                            mine
                              ? isLast
                                ? 'rounded-br-sm'
                                : 'rounded-br-2xl'
                              : isLast
                                ? 'rounded-bl-sm'
                                : 'rounded-bl-2xl',
                          )}
                        >
                          <div>{m.body}</div>
                          {isLast && (
                            <div
                              className={cn(
                                'text-[10px] mt-1 opacity-70',
                                mine ? 'text-right' : 'text-left',
                              )}
                            >
                              {formatStamp(m.created_at)}
                              {mine && m.read_at && ' · Read'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))
        )}
        {otherTyping && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
            </div>
            <span>{otherPartyName} is typing…</span>
          </div>
        )}
      </div>

      <div className="border-t px-3 pt-3 pb-2">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.trim()) broadcastTyping();
            }}
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
          <Button
            onClick={handleSend}
            disabled={!draft.trim() || send.isPending}
            size="icon"
            className="shrink-0"
            title="Send (Enter)"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Not for emergencies — call 911 or your local emergency number.
          </p>
          <p className="text-[10px] text-muted-foreground hidden sm:block">
            <kbd className="px-1 py-0.5 rounded bg-muted text-[9px]">Enter</kbd> to send ·{' '}
            <kbd className="px-1 py-0.5 rounded bg-muted text-[9px]">Shift+Enter</kbd> for newline
          </p>
        </div>
      </div>
    </div>
  );
}
