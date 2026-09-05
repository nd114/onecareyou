import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MessageThread } from '@/components/messaging/MessageThread';
import { ConversationList, type Conversation } from '@/components/messaging/ConversationList';
import { useAuth } from '@/contexts/AuthContext';
import { useMessageThreads } from '@/hooks/useMessages';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';

const ClinicianMessages = () => {
  const { user } = useAuth();
  const { patients } = useClinicianPatients();
  const [selected, setSelected] = useState<Conversation | null>(null);

  const counterparties: Conversation[] = useMemo(
    () =>
      (patients || [])
        .filter((p) => !!p.user_id)
        .map((p) => ({
          id: p.user_id as string,
          name: p.patient_name || p.patient_email || 'Patient',
          // Which hospital a patient reaches you through, when it is one —
          // every row used to read "Patient", which said nothing.
          caption: p.source === 'hospital' ? p.hospital_name || 'Hospital patient' : undefined,
        })),
    [patients],
  );

  const { data: threadSummaries = [] } = useMessageThreads('clinician');

  // Open on the conversation that moved most recently rather than whoever the
  // panel happens to list first.
  useEffect(() => {
    if (selected || counterparties.length === 0) return;
    const newest = threadSummaries.find((t) =>
      counterparties.some((c) => c.id === t.counterpartyId),
    );
    setSelected(
      (newest && counterparties.find((c) => c.id === newest.counterpartyId)) || counterparties[0],
    );
  }, [counterparties, threadSummaries, selected]);

  return (
    /* Same column as the patient side: chrome takes what it needs, the
       conversation pane takes the rest, and nothing here counts pixels. */
    <div className="flex h-[100dvh] flex-col bg-muted/30">
      <Helmet>
        <title>Messages | OneCare for Clinicians</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <ClinicianHeader />
      <SectionTabs section="communicate" variant="clinician" />
      <main className="container flex min-h-0 flex-1 flex-col px-4 sm:px-6 pt-6 sm:pt-8 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            Messages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Secure conversations with your patients. Not for emergencies.
          </p>
        </motion.div>

        {counterparties.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">
                No patients yet. Invite or import patients to start messaging.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Master/detail on a phone, same as the patient side and for the
             same reason: stacked panes put the composer about two screens
             down. A clinician answering a message on a ward is exactly the
             person who cannot scroll for it. */
          <div className="grid min-h-[360px] flex-1 grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
            <Card
              className={cn(
                'flex flex-col overflow-hidden',
                selected ? 'hidden md:flex' : 'flex',
              )}
            >
              <ConversationList
                conversations={counterparties}
                threads={threadSummaries}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                selfUserId={user?.id}
                searchPlaceholder="Search patients and messages…"
                emptyLabel="No conversations yet."
              />
            </Card>
            <Card
              className={cn('flex flex-col overflow-hidden', selected ? 'flex' : 'hidden md:flex')}
            >
              <CardHeader className="flex flex-row items-center gap-2 border-b px-4 py-3 space-y-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 h-8 w-8 md:hidden"
                  onClick={() => setSelected(null)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-sm font-medium">
                  {selected ? selected.name : 'Select a conversation'}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col p-0 overflow-hidden">
                <MessageThread
                  otherPartyUserId={selected?.id || null}
                  otherPartyName={selected?.name || ''}
                  role="clinician"
                  className="h-full min-h-0"
                />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default ClinicianMessages;
