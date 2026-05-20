import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Send, Loader2, Mic, MicOff, Trash2, ArrowRight, Bot, User, AlertTriangle 
} from 'lucide-react';
import { useAIChat, ChatMessage } from '@/hooks/useAIChat';
import { useAIConsent } from '@/hooks/useAIConsent';
import { AIConsentDialog } from '@/components/consent/AIConsentDialog';
import { cn } from '@/lib/utils';

interface AIChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function VoiceButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const supported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  if (!supported) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant={listening ? 'destructive' : 'outline'}
      onClick={toggle}
      className="h-9 w-9 flex-shrink-0"
      title={listening ? 'Stop listening' : 'Voice input'}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}

function MessageBubble({ message, onNavigate }: { message: ChatMessage; onNavigate: (route: string) => void }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2 mb-4', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
        isUser 
          ? 'bg-primary text-primary-foreground rounded-br-md' 
          : 'bg-muted rounded-bl-md'
      )}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.suggestedRoute && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 h-7 text-xs"
            onClick={() => onNavigate(message.suggestedRoute!)}
          >
            Go there <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
      {isUser && (
        <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}

export function AIChatDrawer({ open, onOpenChange }: AIChatDrawerProps) {
  const navigate = useNavigate();
  const { messages, isLoading, sendMessage, clearChat } = useAIChat();
  const { hasConsent, grantConsent } = useAIConsent();
  const [input, setInput] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!hasConsent) {
      setShowConsent(true);
      return;
    }
    if (!input.trim()) return;
    const text = input;
    setInput('');
    const err = await sendMessage(text);
    if (err?.kind === 'consent_required') {
      // Consent was revoked elsewhere — re-prompt instead of just toasting.
      setShowConsent(true);
      setInput(text); // restore so user can retry after consent
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNavigate = (route: string) => {
    navigate(route);
    onOpenChange(false);
  };

  const handleVoiceTranscript = (text: string) => {
    if (!hasConsent) {
      setShowConsent(true);
      return;
    }
    sendMessage(text);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                OneCare Assistant
              </SheetTitle>
              {messages.length > 0 && (
                <Button variant="ghost" size="icon" onClick={clearChat} className="h-8 w-8">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Ask about health concepts or platform features
            </p>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="text-center py-12 space-y-3">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <div>
                  <p className="font-medium text-sm">How can I help?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ask me about health topics or how to use OneCare
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  {['What is HbA1c?', 'How do I add a vital?', 'What is blood pressure?'].map(q => (
                    <Badge
                      key={q}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted transition-colors text-xs"
                      onClick={() => {
                        if (!hasConsent) { setShowConsent(true); return; }
                        sendMessage(q);
                      }}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
                <div className="pt-4">
                  <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>This assistant provides general information only, not medical advice.</span>
                  </div>
                </div>
              </div>
            )}

            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} onNavigate={handleNavigate} />
            ))}

            {isLoading && (
              <div className="flex gap-2 mb-4">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </ScrollArea>

          <div className="border-t p-3 flex gap-2">
            <VoiceButton onTranscript={handleVoiceTranscript} />
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              className="min-h-[36px] max-h-[100px] resize-none text-sm"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="h-9 w-9 flex-shrink-0 gradient-primary border-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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
