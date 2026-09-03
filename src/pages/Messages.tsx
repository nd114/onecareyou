import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageThread } from '@/components/messaging/MessageThread';
import { ConversationList, type Conversation } from '@/components/messaging/ConversationList';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMessageThreads } from '@/hooks/useMessages';
import { Link } from 'react-router-dom';

interface Counterparty {
  clinicianUserId: string;
  name: string;
  isPast: boolean;
}


const Messages = () => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Counterparty | null>(null);

  // Patient's clinicians — active shares plus past connections, whose history is preserved.
  const { data: clinicians = [], isLoading } = useQuery({
    queryKey: ['patient-clinicians-v2', user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as Counterparty[];
      const { data, error } = await supabase
        .from('provider_shares')
        .select('clinician_user_id, provider_name, is_active, created_at')
        .eq('user_id', user.id)
        .not('clinician_user_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = data || [];
      const ids = Array.from(new Set(rows.map((r) => r.clinician_user_id).filter(Boolean))) as string[];

      const nameById = new Map<string, string>();
      if (ids.length > 0) {
        const { data: infos } = await supabase.rpc('get_clinician_basic_info', { clinician_ids: ids });
        for (const i of (infos || []) as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          title: string | null;
        }[]) {
          const full = [i.first_name, i.last_name].filter(Boolean).join(' ').trim();
          if (!full) continue;
          const title = i.title?.trim();
          nameById.set(
            i.user_id,
            title && !full.toLowerCase().startsWith(title.toLowerCase()) ? `${title} ${full}` : full,
          );
        }
      }

      const seen = new Map<string, Counterparty>();
      for (const row of rows) {
        const id = row.clinician_user_id;
        if (!id) continue;
        const existing = seen.get(id);
        if (existing) {
          // An active share anywhere wins over a past one.
          if (row.is_active) existing.isPast = false;
          continue;
        }
        seen.set(id, {
          clinicianUserId: id,
          name: nameById.get(id) || row.provider_name || 'Clinician',
          isPast: !row.is_active,
        });
      }
      return Array.from(seen.values()).sort((a, b) => Number(a.isPast) - Number(b.isPast));
    },
    enabled: !!user?.id,
  });


  const { data: threadSummaries = [] } = useMessageThreads('patient');

  const conversations: Conversation[] = useMemo(
    () =>
      clinicians.map((c) => ({
        id: c.clinicianUserId,
        name: c.name,
        caption: c.isPast ? 'Past connection' : undefined,
      })),
    [clinicians],
  );

  // Land on whichever conversation moved most recently, not the first
  // clinician in the share list.
  useEffect(() => {
    if (selected || clinicians.length === 0) return;
    const newest = threadSummaries.find((t) =>
      clinicians.some((c) => c.clinicianUserId === t.counterpartyId),
    );
    setSelected(
      (newest && clinicians.find((c) => c.clinicianUserId === newest.counterpartyId)) ||
        clinicians[0],
    );
  }, [clinicians, threadSummaries, selected]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Helmet>
        <title>Messages | OneCare</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Header />
      <SectionTabs section="team" variant="patient" />
      <main className="container px-4 sm:px-6 py-6 sm:py-8">
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
        ) : clinicians.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">
                You're not yet connected to a clinician. Share access from your Care Circle to start messaging.
              </p>
              <Button asChild>
                <Link to="/care-circle">Open Care Circle</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
            <Card className="overflow-hidden flex flex-col">
              <ConversationList
                conversations={conversations}
                threads={threadSummaries}
                selectedId={selected?.clinicianUserId ?? null}
                onSelect={(c) =>
                  setSelected(clinicians.find((x) => x.clinicianUserId === c.id) ?? null)
                }
                selfUserId={user?.id}
                searchPlaceholder="Search clinicians and messages…"
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
                  otherPartyUserId={selected?.clinicianUserId || null}
                  otherPartyName={selected?.name || ''}
                  role="patient"
                  className="h-full"
                  readOnly={!!selected?.isPast}
                  readOnlyNotice={`You no longer share data with ${selected?.name ?? 'this clinician'}. The conversation is kept for your records. Resume sharing from Care Circle to message again.`}
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
