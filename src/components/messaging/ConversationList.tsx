import { useMemo, useState } from "react";
import { formatDistanceToNowStrict, isToday, format } from "date-fns";
import { Search, Paperclip, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MessageThreadSummary } from "@/hooks/useMessages";

export interface Conversation {
  /** The other party's user id. */
  id: string;
  name: string;
  /** Small caption under the name — "Past connection", a hospital, a role. */
  caption?: string;
}

interface Props {
  conversations: Conversation[];
  threads: MessageThreadSummary[];
  selectedId: string | null;
  onSelect: (c: Conversation) => void;
  /** Who the reader is, so "You:" is only shown on their own last message. */
  selfUserId?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
}

function stamp(iso: string) {
  const d = new Date(iso);
  return isToday(d) ? format(d, "HH:mm") : formatDistanceToNowStrict(d, { addSuffix: false });
}

/**
 * The conversation sidebar, for both sides.
 *
 * It used to be the roster: every patient a clinician had, in panel order,
 * each captioned with the word "Patient", with no last message and no sense of
 * which conversation had just moved. Finding whoever messaged you meant
 * scrolling a list that told you nothing. Now the ones with history sort by
 * recency and show what was said; everyone else falls below a divider, still
 * reachable to start a first conversation.
 */
export function ConversationList({
  conversations,
  threads,
  selectedId,
  onSelect,
  selfUserId,
  searchPlaceholder = "Search conversations…",
  emptyLabel = "No conversations yet.",
}: Props) {
  const [search, setSearch] = useState("");

  const byId = useMemo(() => {
    const m = new Map<string, MessageThreadSummary>();
    threads.forEach((t) => m.set(t.counterpartyId, t));
    return m;
  }, [threads]);

  const { active, quiet } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (c: Conversation) => {
      if (!q) return true;
      const thread = byId.get(c.id);
      // Searching the last message too, because people look for the thing that
      // was said as often as for who said it.
      return (
        c.name.toLowerCase().includes(q) ||
        (thread?.lastBody ?? "").toLowerCase().includes(q)
      );
    };
    const shown = conversations.filter(match);
    return {
      active: shown
        .filter((c) => byId.has(c.id))
        .sort((a, b) => {
          const ta = byId.get(a.id)!.lastAt;
          const tb = byId.get(b.id)!.lastAt;
          return tb.localeCompare(ta);
        }),
      quiet: shown.filter((c) => !byId.has(c.id)),
    };
  }, [conversations, byId, search]);

  const row = (c: Conversation) => {
    const thread = byId.get(c.id);
    const isSelf = thread && selfUserId && thread.lastSenderUserId === selfUserId;
    return (
      <button
        key={c.id}
        onClick={() => onSelect(c)}
        className={cn(
          "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors",
          selectedId === c.id && "bg-muted",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium truncate">{c.name}</span>
          {thread && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {stamp(thread.lastAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1 min-w-0">
            {thread ? (
              <>
                {thread.lastHasAttachment && <Paperclip className="h-3 w-3 shrink-0" />}
                <span className="truncate">
                  {isSelf && <span className="opacity-70">You: </span>}
                  {thread.lastBody || "Attachment"}
                </span>
              </>
            ) : (
              (c.caption ?? "No messages yet")
            )}
          </span>
          {!!thread?.unread && (
            <Badge variant="default" className="h-5 px-1.5 text-[10px] shrink-0">
              {thread.unread}
            </Badge>
          )}
        </div>
        {thread && c.caption && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{c.caption}</div>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {active.length === 0 && quiet.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <MessageSquare className="h-7 w-7 opacity-40" />
            {search.trim() ? "Nothing matches that search." : emptyLabel}
          </div>
        ) : (
          <>
            {/* Two groups, each with a name. The divider used to read "No
                messages yet" with nothing above it saying what the rows above
                were, so it looked like an empty state stranded mid-list. */}
            {active.length > 0 && quiet.length > 0 && (
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b">
                Recent
              </div>
            )}
            {active.map(row)}
            {quiet.length > 0 && (
              <>
                {active.length > 0 && (
                  <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b">
                    Not messaged yet
                  </div>
                )}
                {quiet.map(row)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
