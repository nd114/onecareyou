import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Send, Loader2, Mic, MicOff, Trash2, ArrowRight, Bot, User, AlertTriangle, Paperclip,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useHealthDocuments } from '@/hooks/useHealthDocuments';
import { useAIChat, ChatMessage } from '@/hooks/useAIChat';
import { useAIConsent } from '@/hooks/useAIConsent';
import { AIConsentDialog } from '@/components/consent/AIConsentDialog';
import { MarkdownMessage } from './MarkdownMessage';
import { ProposedActionsCard } from './ProposedActionsCard';
import { cn } from '@/lib/utils';

/**
 * The live assistant conversation, without any container of its own.
 *
 * The same panel serves the floating drawer (used from anywhere in the
 * platform) and the AI page, where the assistant belongs in the page itself
 * rather than behind a side sheet you have to open while already there.
 */

/**
 * Dictation button.
 *
 * Speech is appended to the message draft — never sent automatically — so the
 * user can proof-read (and edit) before pressing send. Recognition keeps
 * running through natural pauses until the user presses stop.
 */
function VoiceButton({
  onFinalText,
  onInterimText,
  disabled,
}: {
  onFinalText: (text: string) => void;
  onInterimText: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wantsListeningRef = useRef(false);

  const supported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => () => {
    wantsListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const stop = () => {
    wantsListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
    onInterimText('');
  };

  const toggle = () => {
    if (listening) {
      stop();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }
      if (finalText.trim()) onFinalText(finalText.trim());
      onInterimText(interimText.trim());
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' / 'aborted' fire on quiet gaps — keep listening.
      if (event?.error === 'no-speech' || event?.error === 'aborted') return;
      stop();
    };

    recognition.onend = () => {
      if (wantsListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          /* fall through to stopping */
        }
      }
      setListening(false);
      onInterimText('');
    };

    recognitionRef.current = recognition;
    wantsListeningRef.current = true;
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
      disabled={disabled}
      className="h-9 w-9 flex-shrink-0"
      title={listening ? 'Stop dictating' : 'Dictate your message'}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}

function MessageBubble({
  message,
  onNavigate,
  onApprove,
  onDiscard,
}: {
  message: ChatMessage;
  onNavigate: (route: string) => void;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
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
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownMessage content={message.content} />
        )}
        {!isUser && (
          <ProposedActionsCard
            message={message}
            onApprove={onApprove}
            onDiscard={onDiscard}
            compact
          />
        )}
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

interface AIChatPanelProps {
  /** Rendered at the top of the panel; receives a clear-conversation control. */
  renderHeader?: (args: {
    hasMessages: boolean;
    clearChat: () => void;
    /** Replaces the live transcript with an earlier conversation to continue it. */
    loadConversation: (
      history: { role: 'user' | 'assistant'; content: string; createdAt?: string }[],
    ) => void;
  }) => React.ReactNode;
  /** Called after the assistant's route suggestion is followed (e.g. close the drawer). */
  onAfterNavigate?: () => void;
  className?: string;
}

export function AIChatPanel({ renderHeader, onAfterNavigate, className }: AIChatPanelProps) {
  const navigate = useNavigate();
  const { messages, isLoading, sendMessage, clearChat, loadConversation, approveActions, discardActions } = useAIChat({
    persistSurface: 'assistant',
  });

  const { hasConsent, grantConsent } = useAIConsent();
  const { uploadDocument } = useHealthDocuments();
  const [input, setInput] = useState('');
  const [interim, setInterim] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setInterim('');
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
    onAfterNavigate?.();
  };

  /** Dictation only fills the draft — the user still presses send. */
  const handleFinalText = (text: string) => {
    setInterim('');
    setInput(prev => (prev ? `${prev.replace(/\s+$/, '')} ${text}` : text));
  };

  /**
   * Attachments are saved straight into the patient's Health Vault (their own
   * record, via their session so RLS applies), then the assistant is told what
   * arrived so it can talk about it.
   */
  const handleFileChosen = async (file: File | null) => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (!hasConsent) { setShowConsent(true); return; }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Files need to be under 15 MB.');
      return;
    }

    setIsUploading(true);
    try {
      const doc = await uploadDocument.mutateAsync({
        file,
        title: file.name,
        category: 'other',
        sourceContext: 'assistant',
        aiSummarize: true,
        familyMemberId: null,
      });

      let extracted = '';
      if (file.type.startsWith('image/')) {
        try {
          const b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const { data } = await supabase.functions.invoke('media-extract', {
            body: { mode: 'image', data: b64, mimeType: file.type },
          });
          extracted = (data?.transcript || '').trim();
        } catch {
          /* OCR is a bonus — the file is already safely in the vault */
        }
      }

      await sendMessage(
        [
          `I've just uploaded "${file.name}" to my Health Vault.`,
          extracted ? `Here's the text read from it:\n${extracted.slice(0, 4000)}` : '',
          'Please tell me what it looks like and anything I should follow up on.',
        ]
          .filter(Boolean)
          .join('\n\n')
      );
      toast.success('Saved to your Health Vault');
      void doc;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      {renderHeader?.({ hasMessages: messages.length > 0, clearChat, loadConversation })}

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
          <MessageBubble
            key={msg.id}
            message={msg}
            onNavigate={handleNavigate}
            onApprove={approveActions}
            onDiscard={discardActions}
          />
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

      <div className="border-t p-3 space-y-1.5">
        {interim && (
          <p className="text-xs text-muted-foreground italic px-1">{interim}…</p>
        )}
        {isUploading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving your file to the Health Vault…
          </p>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => handleFileChosen(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 flex-shrink-0"
            disabled={isLoading || isUploading}
            onClick={() => {
              if (!hasConsent) { setShowConsent(true); return; }
              fileInputRef.current?.click();
            }}
            title="Attach a document or photo (saved to your Health Vault)"
            aria-label="Attach a file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <VoiceButton
            onFinalText={handleFinalText}
            onInterimText={setInterim}
            disabled={isLoading}
          />
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question, attach a file, or dictate..."
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
    </div>
  );
}

/** Default clear-conversation control for panel headers. */
export function ClearConversationButton({ onClear }: { onClear: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClear} className="h-8 w-8 shrink-0" title="Clear conversation">
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
