import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Loader2, Mic, Trash2, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { SEOHead } from '@/components/seo/SEOHead';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import { useAIConversation, useAIConversations } from '@/hooks/useAIConversations';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * One stored conversation, read back.
 *
 * Deliberately read-only. Continuing an old thread would mean replaying it into
 * the model as context, and the assistant's consent model is built around each
 * exchange being scoped to what the patient has agreed to share right now.
 * Reading is a records question; continuing is a consent question.
 */
export default function AIConversation() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { data: messages, isLoading, error } = useAIConversation(conversationId);
  const { remove } = useAIConversations();

  const handleDelete = async () => {
    if (!conversationId) return;
    try {
      await remove.mutateAsync(conversationId);
      toast.success('Conversation deleted');
      navigate('/ai');
    } catch {
      toast.error('Could not delete the conversation. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Conversation | OneCare" noIndex />
      <Header />
      <SectionTabs section="ai" variant="patient" />

      <main className="container py-6 px-4 max-w-3xl">
        <div className="flex items-center justify-between gap-3 mb-5">
          <Button variant="ghost" onClick={() => navigate('/ai')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {messages && messages.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
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
                    onClick={handleDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error || !messages || messages.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="font-medium mb-1">Conversation not found</p>
              <p className="text-sm text-muted-foreground">
                It may have been deleted. Your other conversations are on the AI page.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 space-y-6">
              {messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <div
                    key={message.id}
                    className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
                  >
                    {!isUser && (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={cn('max-w-[80%] min-w-0', isUser && 'text-right')}>
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5 text-sm text-left',
                          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
                        )}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        ) : (
                          <MarkdownMessage content={message.content} />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5 justify-end">
                        {message.inputModality === 'voice' && (
                          <Badge variant="outline" className="text-[10px] py-0 h-4 gap-1">
                            <Mic className="h-2.5 w-2.5" />
                            Spoken
                          </Badge>
                        )}
                        {format(new Date(message.createdAt), 'd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                    {isUser && (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
