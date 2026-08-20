import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="min-h-screen bg-muted/30">
      <Helmet>
        <title>Messages | OneCare for Clinicians</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <ClinicianHeader />
      <SectionTabs section="communicate" variant="clinician" />
      <main className="container px-4 sm:px-6 py-6 sm:py-8">
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
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
            <Card className="overflow-hidden flex flex-col">
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
            <Card className="overflow-hidden flex flex-col">
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-medium">
                  {selected ? selected.name : 'Select a conversation'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                <MessageThread
                  otherPartyUserId={selected?.id || null}
                  otherPartyName={selected?.name || ''}
                  role="clinician"
                  className="h-full"
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
