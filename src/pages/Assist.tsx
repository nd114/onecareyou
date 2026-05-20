import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, ArrowRight, Loader2, Mic, Trash2, ArrowLeft, AlertTriangle, User as UserIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useAIChat, ChatMessage } from '@/hooks/useAIChat';
import { useAIConsent } from '@/hooks/useAIConsent';
import { AIConsentDialog } from '@/components/consent/AIConsentDialog';
import { SEOHead } from '@/components/seo/SEOHead';
import { cn } from '@/lib/utils';

/**
 * Simple Mode: a full-page conversational interface to OneCare.
 *
 * v1 scope: read + navigate only. The assistant can answer questions about
 * the user's data (vitals, meds, schedule, adherence) and deep-link into
 * the regular UI. It cannot create, edit, or delete data — those still
 * require tapping the standard controls. This is intentional for beta.
 */
const SUGGESTIONS = [
  { label: "What did I take today?", icon: '💊' },
  { label: "Show my blood pressure this week", icon: '📈' },
  { label: "Add a new vital", icon: '➕' },
  { label: "What's my next dose?", icon: '⏰' },
  { label: "Explain my latest lab results", icon: '🧪' },
  { label: "How do I share data with my doctor?", icon: '👨‍⚕️' },
];

function MessageRow({ message, onNavigate }: { message: ChatMessage; onNavigate: (route: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3 mb-6', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={cn(
        'max-w-[80%] rounded-2xl px-4 py-2.5',
        isUser
          ? 'bg-primary text-primary-foreground rounded-br-sm'
          : 'bg-muted rounded-bl-sm'
      )}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        {message.suggestedRoute && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 h-8"
            onClick={() => onNavigate(message.suggestedRoute!)}
          >
            Take me there <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        )}
      </div>
      {isUser && (
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserIcon className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}

export default function Assist() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { messages, isLoading, sendMessage, clearChat } = useAIChat();
  const { hasConsent, grantConsent } = useAIConsent();
  const [input, setInput] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text) return;
    if (!hasConsent) {
      setShowConsent(true);
      return;
    }
    if (!override) setInput('');
    const err = await sendMessage(text);
    if (err?.kind === 'consent_required') {
      setShowConsent(true);
      if (!override) setInput(text);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNavigate = (route: string) => navigate(route);
  const firstName = profile?.name?.split(' ')[0] || 'there';

  return (
    <>
      <SEOHead title="Simple Mode — OneCare Assistant" description="Chat with OneCare to check your vitals, medications, and schedule." noIndex />
      <Header />
      <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-background">
        <div className="border-b px-4 py-3 flex items-center justify-between bg-card/50">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h1 className="font-semibold text-sm">Simple Mode</h1>
                <Badge variant="outline" className="text-[10px] h-5">Beta</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Ask anything about your health — I can read your data and guide you.
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="h-8">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="space-y-6 pt-4">
              <div className="text-center space-y-2">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Hi {firstName} 👋</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  I can answer questions about your health data, explain medical concepts, and take you to the right page.
                  I won't change anything in your records — tap the buttons in the regular app for that.
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3 px-1">Try asking</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {SUGGESTIONS.map(s => (
                    <Card
                      key={s.label}
                      className="p-3 cursor-pointer hover:bg-muted/50 transition-colors text-sm flex items-center gap-2 border-dashed"
                      onClick={() => handleSend(s.label)}
                    >
                      <span className="text-base">{s.icon}</span>
                      <span>{s.label}</span>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Simple Mode provides general information only, not medical advice. Always confirm with your healthcare provider.
                </span>
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <MessageRow key={msg.id} message={msg} onNavigate={handleNavigate} />
              ))}
              {isLoading && (
                <div className="flex gap-3 mb-6">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t bg-card/50 px-4 py-3">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 flex-shrink-0 opacity-60"
              disabled
              title="Voice input — coming soon"
              aria-label="Voice input coming soon"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message OneCare…"
              className="min-h-[40px] max-h-[160px] resize-none text-sm"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="h-10 px-4 flex-shrink-0 gradient-primary border-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2 max-w-3xl mx-auto">
            Voice input coming soon. Simple Mode reads your data — it doesn't change records.
          </p>
        </div>
      </div>

      <AIConsentDialog
        open={showConsent}
        onOpenChange={setShowConsent}
        onConsent={async () => {
          await grantConsent();
          setShowConsent(false);
        }}
        onDecline={() => setShowConsent(false)}
      />
    </>
  );
}
