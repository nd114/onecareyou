import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageThread } from '@/components/messaging/MessageThread';
import { ConversationList, type Conversation } from '@/components/messaging/ConversationList';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMessageCounterparties, useMessageThreads } from '@/hooks/useMessages';
import {
  conversationSubtitle,
  conversationTitle,
  threadNotice,
  type MessageCounterparty,
  type ThreadNotice,
} from '@/lib/message-thread-status';
import { Link } from 'react-router-dom';

/** Why a conversation is closed, in a word, for the list. */
function caption(c: MessageCounterparty): string | undefined {
  // Titled with the hospital's name already (conversationTitle): say who reads it.
  if (c.reason === 'covered') {
    return c.practiceName && conversationTitle(c) === c.practiceName
      ? 'Your care team there'
      : `${c.practiceName ?? 'Hospital'} team`;
  }
  if (c.canSend) return c.practiceName ?? undefined;
  switch (c.reason) {
    case 'sharing_stopped':
      return 'Not sharing';
    case 'share_expired':
      return 'Share expired';
    case 'clinician_left':
      return 'No one assigned';
    case 'not_on_care_team':
      return 'No longer on your care';
    case 'practice_paused':
      return 'Paused';
    default:
      return 'Closed';
  }
}

function NoticeBody({ notice, onSelect }: { notice: ThreadNotice; onSelect: (id: string) => void }) {
  const action = notice.action;
  return (
    <div className="space-y-2">
      <p>{notice.text}</p>
      {action?.to && (
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <Link to={action.to}>{action.label}</Link>
        </Button>
      )}
      {action?.clinicianUserId && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onSelect(action.clinicianUserId!)}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

const Messages = () => {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Everyone the patient has a conversation or a relationship with — private
  // shares, hospital threads (including a departed clinician's, which the
  // hospital's team now reads), and the clinicians a hospital has assigned —
  // each with the database's answer to "would anyone read a message here".
  const { data: counterparties = [], isLoading } = useMessageCounterparties();
  const { data: threadSummaries = [] } = useMessageThreads('patient');

  // Open conversations first, then the rest; newest activity first within each.
  const ordered = useMemo(() => {
    const lastAt = new Map(threadSummaries.map((t) => [t.counterpartyId, t.lastAt]));
    return [...counterparties].sort((a, b) => {
      if (a.canSend !== b.canSend) return a.canSend ? -1 : 1;
      return (lastAt.get(b.clinicianUserId) ?? '').localeCompare(lastAt.get(a.clinicianUserId) ?? '');
    });
  }, [counterparties, threadSummaries]);

  const selected = ordered.find((c) => c.clinicianUserId === selectedId) ?? null;

  const conversations: Conversation[] = useMemo(
    () =>
      ordered.map((c) => ({
        id: c.clinicianUserId,
        name: conversationTitle(c),
        caption: caption(c),
      })),
    [ordered],
  );

  // Land on whichever conversation moved most recently.
  useEffect(() => {
    if (selectedId || ordered.length === 0) return;
    const newest = threadSummaries.find((t) => ordered.some((c) => c.clinicianUserId === t.counterpartyId));
    setSelectedId(newest?.counterpartyId ?? ordered[0].clinicianUserId);
  }, [ordered, threadSummaries, selectedId]);

  const notice = selected ? threadNotice(selected) : null;
  const noticeNode = notice ? <NoticeBody notice={notice} onSelect={setSelectedId} /> : undefined;

  return (
    /* A column the height of the viewport: header, tabs and title take what
       they need, the conversation pane takes the rest. Sizing the pane with a
       hand-counted calc(100dvh - 220px) meant re-counting the chrome above it
       every time any of it changed. */
    <div className="flex h-[100dvh] flex-col bg-muted/30">
      <Helmet>
        <title>Messages | OneCare</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Header />
      <SectionTabs section="team" variant="patient" />
      {/* The bottom tab bar is fixed over the viewport, so a pane sized to the
          full 100dvh ends up underneath it. Reserve its height here rather than
          leaning on the body padding, which only buys back scrolling. */}
      <main className="container flex min-h-0 flex-1 flex-col px-4 sm:px-6 pt-6 sm:pt-8 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            Messages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Secure conversations with your connected clinicians.
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : ordered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">
                You're not yet connected to a clinician. Invite one from your Care Circle to start messaging.
              </p>
              <Button asChild>
                <Link to="/care-circle">Open Care Circle</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Master/detail on a phone, side by side from md up. They used to
             stack: one grid column, a list of any height above a thread with
             min-h-[400px], inside a container capped at 100vh-220px. The
             content overflowed the container, the container overflowed the
             page, and the composer ended up roughly two screens down — the one
             thing you came to do was the one thing you could not see. */
          <div className="grid min-h-[360px] flex-1 grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
            <Card
              className={cn(
                'flex flex-col overflow-hidden',
                // On a phone the list is the whole screen until a conversation
                // is picked, and then it gets out of the way.
                selected ? 'hidden md:flex' : 'flex',
              )}
            >
              <ConversationList
                conversations={conversations}
                threads={threadSummaries}
                selectedId={selected?.clinicianUserId ?? null}
                onSelect={(c) => setSelectedId(c.id)}
                selfUserId={user?.id}
                searchPlaceholder="Search clinicians and messages…"
                emptyLabel="No conversations yet."
              />
            </Card>
            <Card
              className={cn(
                'flex flex-col overflow-hidden',
                selected ? 'flex' : 'hidden md:flex',
              )}
            >
              <CardHeader className="flex flex-row items-center gap-2 border-b px-4 py-3 space-y-0">
                {/* The way back, on a phone. Without it, picking a
                    conversation is a one-way door. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 h-8 w-8 md:hidden"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-medium">
                    {selected ? conversationTitle(selected) : 'Select a conversation'}
                  </CardTitle>
                  {selected && conversationSubtitle(selected) && (
                    <p className="truncate text-xs text-muted-foreground">{conversationSubtitle(selected)}</p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col p-0 overflow-hidden">
                {/* Closed means the database would refuse the message, not a
                    guess from the share list: a composer is never offered
                    into a thread nobody reads. */}
                <MessageThread
                  otherPartyUserId={selected?.clinicianUserId || null}
                  otherPartyName={selected ? conversationTitle(selected) : ''}
                  role="patient"
                  className="h-full min-h-0"
                  readOnly={!!selected && !selected.canSend}
                  readOnlyNotice={noticeNode}
                  composerNotice={selected?.canSend ? noticeNode : undefined}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Messages;
