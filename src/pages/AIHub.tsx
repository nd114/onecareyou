import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, MessageSquare, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Header } from '@/components/layout/Header';
import { SEOHead } from '@/components/seo/SEOHead';
import { AIChatPanel, ClearConversationButton } from '@/components/ai/AIChatPanel';
import { StoredConversation } from '@/components/ai/StoredConversation';
import { useAIConversations, conversationSourceLabel } from '@/hooks/useAIConversations';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/**
 * The AI pillar.
 *
 * The assistant lives in the page here — a side sheet is for when you are
 * elsewhere in the platform and want to ask something without leaving. The
 * conversation is the same one either way (it is persisted per account), so you
 * can start in the drawer and carry on here. Past conversations sit beside it
 * and can be read back without losing the live chat.
 */
export default function AIHub() {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { conversations, isLoading, remove } = useAIConversations();
  const [selected, setSelected] = useState<string | null>(conversationId ?? null);

  // Deep links to /ai/:id open that conversation in the pane.
  useEffect(() => {
    setSelected(conversationId ?? null);
  }, [conversationId]);

  const openLiveChat = () => {
    setSelected(null);
    if (conversationId) navigate('/ai');
  };

  const openStored = (id: string) => {
    setSelected(id);
    navigate(`/ai/${id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success('Conversation deleted');
      openLiveChat();
    } catch {
      toast.error('Could not delete the conversation. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="AI Assistant | OneCare" noIndex />
      <Header />

      <main className="container py-6 px-4 max-w-6xl">
        {/* No pillar tabs: the assistant is not a section of the app any more,
            it is one tap away on every screen. This page is where you read
            back what you asked, which is why it says so. */}
        <div className="mb-6">
          <p className="eyebrow text-primary/70">Your conversations</p>
          <h1 className="mt-2 font-display text-2xl leading-snug sm:text-3xl">
            What you have asked the assistant
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The assistant itself is on every screen — look for the button in the corner.
            This is the record of what you asked it, kept so you can read it back.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Conversation switcher */}
          <Card className="lg:sticky lg:top-6 h-fit min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-primary" />
                Conversations
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                variant={selected === null ? 'default' : 'outline'}
                className={cn('w-full justify-start mb-3', selected === null && 'gradient-primary border-0')}
                onClick={openLiveChat}
              >
                <Plus className="h-4 w-4 mr-2" />
                Current chat
              </Button>

              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  Past conversations will appear here once you have asked something.
                </p>
              ) : (
                <ScrollArea className="max-h-[420px] pr-1">
                  <ul className="space-y-1">
                    {conversations.map((conversation) => (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => openStored(conversation.id)}
                          className={cn(
                            'w-full text-left rounded-lg px-2.5 py-2 transition-colors',
                            selected === conversation.id ? 'bg-muted' : 'hover:bg-muted/50',
                          )}
                        >
                          <p className="text-sm font-medium truncate">
                            {conversation.preview ?? 'Conversation'}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[10px] h-4 py-0">
                              {conversationSourceLabel(conversation.source)}
                            </Badge>
                            {formatDistanceToNow(new Date(conversation.startedAt), { addSuffix: true })}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Pane: live chat, or a stored conversation read back */}
          {selected === null ? (
            <Card className="overflow-hidden min-w-0">
              <AIChatPanel
                className="h-[calc(100vh-16rem)] min-h-[480px]"
                renderHeader={({ hasMessages, clearChat }) => (
                  <div className="flex items-center gap-2 border-b px-4 py-3">
                    <Bot className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-tight">OneCare Assistant</p>
                      <p className="text-xs text-muted-foreground">
                        Your medicines, readings and records — in plain language.
                      </p>
                    </div>
                    {hasMessages && <ClearConversationButton onClear={clearChat} />}
                  </div>
                )}
              />
            </Card>
          ) : (
            <Card className="min-w-0">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium leading-tight truncate">Past conversation</p>
                  <p className="text-xs text-muted-foreground">Read-only record of what you asked.</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={openLiveChat}>
                    Back to chat
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The whole exchange is removed from your account permanently. Anything the
                          assistant added to your record — a reading, a medicine — stays where it is.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(selected)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <CardContent className="p-5">
                <StoredConversation conversationId={selected} />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
