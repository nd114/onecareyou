import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageThread } from '@/components/messaging/MessageThread';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMessageThreads } from '@/hooks/useMessages';
import { useClinicianPatients } from '@/hooks/useClinicianPatients';
import { cn } from '@/lib/utils';

interface Counterparty {
  patientUserId: string;
  name: string;
}

const ClinicianMessages = () => {
  const { user } = useAuth();
  const { patients } = useClinicianPatients();
  const [selected, setSelected] = useState<Counterparty | null>(null);

  const counterparties: Counterparty[] = useMemo(
    () =>
      (patients || [])
        .filter((p) => !!p.user_id)
        .map((p) => ({
          patientUserId: p.user_id as string,
          name: p.patient_name || p.patient_email || 'Patient',
        })),
    [patients],
  );

  const { data: threadSummaries = [] } = useMessageThreads('clinician');
  const unreadByPatient = useMemo(() => {
    const m = new Map<string, number>();
    threadSummaries.forEach((t) => m.set(t.counterpartyId, t.unread));
    return m;
  }, [threadSummaries]);

  useEffect(() => {
    if (!selected && counterparties.length > 0) setSelected(counterparties[0]);
  }, [counterparties, selected]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Helmet>
        <title>Messages | OneCare for Clinicians</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <ClinicianHeader />
      <SectionTabs section=\"communicate\" variant=\"clinician\" />
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
            <Card className="overflow-hidden">
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-y-auto">
                {counterparties.map((c) => {
                  const unread = unreadByPatient.get(c.patientUserId) || 0;
                  const active = selected?.patientUserId === c.patientUserId;
                  return (
                    <button
                      key={c.patientUserId}
                      onClick={() => setSelected(c)}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors flex items-center justify-between gap-2',
                        active && 'bg-muted',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">Patient</div>
                      </div>
                      {unread > 0 && (
                        <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                          {unread}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="overflow-hidden flex flex-col">
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-medium">
                  {selected ? selected.name : 'Select a conversation'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                <MessageThread
                  otherPartyUserId={selected?.patientUserId || null}
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
