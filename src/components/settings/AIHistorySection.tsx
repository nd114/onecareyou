import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, MessageSquare, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Conv {
  id: string;
  source: string;
  started_at: string;
  message_count: number;
}

export function AIHistorySection() {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('ai_conversations')
      .select('id, source, started_at, message_count')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(100);
    setConvs((data as Conv[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user]);

  const deleteOne = async (id: string) => {
    await supabase.from('ai_messages').delete().eq('conversation_id', id);
    await supabase.from('ai_conversations').delete().eq('id', id);
    toast.success('Conversation deleted');
    void load();
  };

  const deleteAll = async () => {
    if (!user) return;
    await supabase.from('ai_messages').delete().eq('user_id', user.id);
    await supabase.from('ai_conversations').delete().eq('user_id', user.id);
    toast.success('All conversations deleted');
    void load();
  };

  return (
    <Card id="ai-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          AI Conversation History
        </CardTitle>
        <CardDescription>
          Your assistant conversations are stored privately, encrypted at rest. We retain them so we can review for safety, debug issues, comply with healthcare record-keeping obligations, and improve the assistant — never to sell or share with third parties. Using the assistant constitutes agreement with our{' '}
          <a className="underline" href="/privacy">Privacy Policy</a> and{' '}
          <a className="underline" href="/data-processing">Data Processing terms</a>. You can delete any conversation below at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : convs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <>
            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete all</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all AI history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes every assistant conversation and message from your account. Audio recordings and uploaded photos linked to these messages remain in storage and can be removed under Settings → Data &amp; Privacy.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteAll}>Delete everything</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="divide-y border rounded-md">
              {convs.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3">
                  {/* Reading a conversation lives on the AI page; this section
                      keeps the privacy controls. Previously you could delete a
                      conversation here but never open it. */}
                  <Link to={`/ai/${c.id}`} className="space-y-0.5 min-w-0 group flex-1">
                    <p className="text-sm font-medium truncate group-hover:underline">
                      {c.source === 'simple_mode' ? 'Simple view' : 'Assistant'} conversation
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(c.started_at), 'PPp')} · {c.message_count} message{c.message_count === 1 ? '' : 's'}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" asChild aria-label="Open conversation">
                      <Link to={`/ai/${c.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteOne(c.id)} aria-label="Delete conversation">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
