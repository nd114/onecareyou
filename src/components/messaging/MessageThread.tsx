import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { Send, Loader2, MessageSquare, AlertTriangle, Paperclip, X, FileText, Download, Search, ChevronUp, ChevronDown, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMessages, type Message } from '@/hooks/useMessages';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { SaveToVaultDialog } from '@/components/documents/SaveToVaultDialog';
import { useLongPress } from '@/hooks/useLongPress';

interface Props {
  otherPartyUserId: string | null;
  otherPartyName: string;
  role: 'patient' | 'clinician';
  className?: string;
  /** Past connection: history stays visible, but no new messages can be sent. */
  readOnly?: boolean;
  readOnlyNotice?: string;
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

const IMAGE_RE = /\.(png|jpe?g|gif|webp|heic|avif)$/i;

/**
 * An attachment in a conversation, and the way to keep it.
 *
 * Right-click on a desktop, long-press on a phone. The file sent in a message
 * lives in the messaging store under that conversation's policies — if the
 * conversation is archived or the share ends, the patient loses sight of it.
 * Saving makes a copy in their own Vault that nobody else's decision removes.
 */
function MessageAttachment({ path, mine }: { path: string; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const fileName = path.split('/').pop()?.replace(/^[0-9a-f-]{36}-/i, '') ?? 'Attachment';
  const isImage = IMAGE_RE.test(fileName);
  const longPress = useLongPress(() => setSaveOpen(true));

  /**
   * Fetched at save time rather than held in memory: most attachments are never
   * saved, and a signed URL expires in five minutes.
   */
  const fetchFile = async (): Promise<File> => {
    const { data, error } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) throw new Error('That attachment could not be read');
    const res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error('That attachment could not be downloaded');
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  };

  useEffect(() => {
    let active = true;
    supabase.storage
      .from('message-attachments')
      .createSignedUrl(path, 300)
      .then(({ data }) => {
        if (active && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);

  const saveDialog = (
    <SaveToVaultDialog
      open={saveOpen}
      onOpenChange={setSaveOpen}
      getFile={fetchFile}
      defaultTitle={fileName}
      defaultCategory={isImage ? 'imaging' : 'other'}
      sourceContext="message_attachment"
    />
  );

  const menu = (children: JSX.Element) => (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setSaveOpen(true)} className="gap-2">
            <FolderPlus className="h-3.5 w-3.5" /> Save to my records
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {saveDialog}
    </>
  );

  if (isImage) {
    return url
      ? menu(
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block mt-1"
            {...longPress}
            onClick={(e) => {
              // A long press already opened the save dialog; opening the image
              // as well would bury it.
              if (longPress.consumed()) e.preventDefault();
            }}
          >
            <img src={url} alt={fileName} className="rounded-lg max-h-48 w-auto object-cover" loading="lazy" />
          </a>,
        )
      : <div className="mt-1 h-24 w-40 rounded-lg bg-background/20 animate-pulse" />;
  }

  return menu(
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs',
        mine ? 'bg-primary-foreground/15' : 'bg-background/70',
        !url && 'pointer-events-none opacity-70',
      )}
      {...longPress}
      onClick={(e) => {
        if (longPress.consumed()) e.preventDefault();
      }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[160px]">{fileName}</span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </a>,
  );
}

export function MessageThread({ otherPartyUserId, otherPartyName, role, className, readOnly = false, readOnlyNotice }: Props) {
  const { user } = useAuth();
  const { messages, isLoading, send, markRead } = useMessages(otherPartyUserId, role);
  const [draft, setDraft] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hitIndex, setHitIndex] = useState(0);

  // A conversation with a clinician is a record you come back to, so it needs
  // to be searchable — "what did they say about the lab result" was a scroll.
  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages.filter((m) => m.body.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, search]);

  const hitSet = useMemo(() => new Set(hits), [hits]);
  const activeHitId = hits.length > 0 ? hits[Math.min(hitIndex, hits.length - 1)] : null;

  useEffect(() => {
    setHitIndex(0);
  }, [search]);

  // A search belongs to the conversation it was typed in. Carrying it across
  // would leave the next thread scrolled to a match in someone else's.
  useEffect(() => {
    setSearch('');
    setSearchOpen(false);
  }, [otherPartyUserId]);

  useEffect(() => {
    if (!activeHitId) return;
    document
      .getElementById(`msg-${activeHitId}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeHitId]);

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

  // Auto-scroll on new messages / typing — but not while the reader is being
  // moved around by a search, or the jump is undone the moment it lands.
  useEffect(() => {
    if (activeHitId) return;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, otherTyping, activeHitId]);

  // Mark as read when viewing
  useEffect(() => {
    if (otherPartyUserId && messages.some((m) => m.sender_user_id !== user?.id && !m.read_at)) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherPartyUserId, messages.length]);

  const handleSend = async () => {
    if ((!draft.trim() && !file) || send.isPending) return;
    try {
      await send.mutateAsync({ body: draft, file });
      setDraft('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        {searchOpen ? (
          <>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this conversation…"
                className="pl-8 h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); }
                  if (e.key === 'Enter' && hits.length > 0) {
                    setHitIndex((i) => (e.shiftKey ? (i - 1 + hits.length) % hits.length : (i + 1) % hits.length));
                  }
                }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
              {search.trim() ? (hits.length ? `${Math.min(hitIndex, hits.length - 1) + 1}/${hits.length}` : 'none') : ''}
            </span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={hits.length === 0}
              onClick={() => setHitIndex((i) => (i - 1 + hits.length) % hits.length)}
              aria-label="Previous match"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={hits.length === 0}
              onClick={() => setHitIndex((i) => (i + 1) % hits.length)}
              aria-label="Next match"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 shrink-0"
              onClick={() => { setSearch(''); setSearchOpen(false); }}
              aria-label="Close search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-[11px] text-muted-foreground flex-1 truncate">
              {messages.length > 0
                ? `${messages.length} message${messages.length === 1 ? '' : 's'} with ${otherPartyName}`
                : otherPartyName}
            </span>
            <Button
              variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0"
              onClick={() => setSearchOpen(true)}
              disabled={messages.length === 0}
            >
              <Search className="h-3.5 w-3.5" /> Search
            </Button>
          </>
        )}
      </div>
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
                          id={`msg-${m.id}`}
                          className={cn(
                            'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
                            mine
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground',
                            hitSet.has(m.id) && 'ring-2 ring-amber-400/70',
                            activeHitId === m.id && 'ring-2 ring-amber-500',
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
                          {m.attachment_path && (
                            <MessageAttachment path={m.attachment_path} mine={mine} />
                          )}
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

      {readOnly ? (
        <div className="shrink-0 border-t px-4 py-3 text-xs text-muted-foreground bg-muted/30">
          {readOnlyNotice ??
            'This connection has ended. The conversation is kept for your records, but new messages can’t be sent.'}
        </div>
      ) : (
      <div className="shrink-0 border-t px-3 pt-3 pb-2">

        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/50 px-2 py-1.5 text-xs">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{file.name}</span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={send.isPending}
            title="Attach a file"
            aria-label="Attach a file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
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
            disabled={(!draft.trim() && !file) || send.isPending}
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
      )}


    </div>
  );
}
