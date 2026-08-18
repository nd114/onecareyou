import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, MessageSquare, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { SEOHead } from '@/components/seo/SEOHead';
import { AIChatDrawer } from '@/components/ai/AIChatDrawer';
import { useAIConversations, conversationSourceLabel } from '@/hooks/useAIConversations';
import { formatDistanceToNow } from 'date-fns';

/**
 * The AI pillar.
 *
 * Replaces the Learn pillar, whose "Ask AI" tab was a full-page copy of the
 * assistant that already floats on every patient screen — the same assistant in
 * two places, one of which you had to navigate to. The assistant stays where it
 * belongs, one tap away everywhere, and this page becomes the thing that was
 * actually missing: somewhere to read back what you asked it.
 *
 * Conversations were already being stored. Until now the only place they
 * appeared was a list in Settings that could delete one but not open it.
 */
export default function AIHub() {
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);
  const { conversations, isLoading } = useAIConversations();

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="AI Assistant | OneCare" noIndex />
      <Header />
      <SectionTabs section="ai" variant="patient" />

      <main className="container py-6 px-4 max-w-3xl">
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">Ask about your health</p>
                <p className="text-sm text-muted-foreground">
                  Your medicines, readings and records — in plain language.
                </p>
              </div>
            </div>
            <Button className="gradient-primary border-0 shrink-0" onClick={() => setChatOpen(true)}>
              <Bot className="h-4 w-4 mr-2" />
              Ask
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
              Your conversations
            </CardTitle>
            <CardDescription>
              Everything you have asked the assistant, kept privately on your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-10">
                <div className="h-14 w-14 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium mb-1">No conversations yet</p>
                <p className="text-sm text-muted-foreground mb-5">
                  Ask the assistant a question and it will appear here.
                </p>
                <Button variant="outline" onClick={() => setChatOpen(true)}>
                  Start one
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/ai/${conversation.id}`)}
                      className="w-full text-left py-3 flex items-center gap-3 hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {conversation.preview ?? 'Conversation'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(conversation.startedAt), { addSuffix: true })}
                          {' · '}
                          {conversation.messageCount}{' '}
                          {conversation.messageCount === 1 ? 'message' : 'messages'}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {conversationSourceLabel(conversation.source)}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <AIChatDrawer open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}
