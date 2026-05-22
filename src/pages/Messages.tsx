import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageThread } from '@/components/messaging/MessageThread';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMessageThreads } from '@/hooks/useMessages';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Counterparty {
  clinicianUserId: string;
  name: string;
}

const Messages = () => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Counterparty | null>(null);

  // Patient's connected clinicians (active shares with a linked clinician_user_id)
  const { data: clinicians = [], isLoading } = useQuery({
    queryKey: ['patient-clinicians', user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as Counterparty[];
      const { data, error } = await supabase
        .from('provider_shares')
        .select('clinician_user_id, provider_name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('clinician_user_id', 'is', null);
      if (error) throw error;
      const seen = new Map<string, Counterparty>();
      for (const row of data || []) {
        if (row.clinician_user_id && !seen.has(row.clinician_user_id)) {
          seen.set(row.clinician_user_id, {
            clinicianUserId: row.clinician_user_id,
            name: row.provider_name || 'Clinician',
          });
        }
      }
      return Array.from(seen.values());
    },
    enabled: !!user?.id,
  });

  const { data: threadSummaries = [] } = useMessageThreads('patient');
  const unreadByClinician = useMemo(() => {
    const m = new Map<string, number>();
    threadSummaries.forEach((t) => m.set(t.counterpartyId, t.unread));
    return m;
  }, [threadSummaries]);

  useEffect(() => {
    if (!selected && clinicians.length > 0) setSelected(clinicians[0]);
  }, [clinicians, selected]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Helmet>
        <title>Messages | OneCare</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Header />
      <SectionTabs section=\"team\" variant=\"patient\" />
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
            <Card className="overflow-hidden">
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-y-auto">
                {clinicians.map((c) => {
                  const unread = unreadByClinician.get(c.clinicianUserId) || 0;
                  const active = selected?.clinicianUserId === c.clinicianUserId;
                  return (
                    <button
                      key={c.clinicianUserId}
                      onClick={() => setSelected(c)}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors flex items-center justify-between gap-2',
                        active && 'bg-muted',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">Clinician</div>
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
                  otherPartyUserId={selected?.clinicianUserId || null}
                  otherPartyName={selected?.name || ''}
                  role="patient"
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

export default Messages;
