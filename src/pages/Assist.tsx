import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, ArrowRight, Loader2, Mic, MicOff, Trash2, ArrowLeft, AlertTriangle, User as UserIcon, Sparkles, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useAIChat, ChatMessage } from '@/hooks/useAIChat';
import { useAIConsent } from '@/hooks/useAIConsent';
import { AIConsentDialog } from '@/components/consent/AIConsentDialog';
import { SEOHead } from '@/components/seo/SEOHead';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import { SimpleModeTransition } from '@/components/ai/SimpleModeTransition';
import { useConversationLogger } from '@/hooks/useConversationLogger';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : (
          <MarkdownMessage content={message.content} />
        )}
        {message.suggestedRoute && (
          <Button size="sm" variant="secondary" className="mt-3 h-8" onClick={() => onNavigate(message.suggestedRoute!)}>
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
  const { user, profile } = useAuth();
  const { messages, isLoading, sendMessage, clearChat } = useAIChat();
  const { hasConsent, grantConsent } = useAIConsent();
  const { logMessage, reset: resetLog } = useConversationLogger('simple_mode');
  const recorder = useVoiceRecorder();
  const [input, setInput] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastLoggedRef = useRef<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Log every newly-arrived assistant message that we haven't logged yet
  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.id !== lastLoggedRef.current) {
      lastLoggedRef.current = last.id;
      void logMessage({ role: 'assistant', content: last.content });
    }
  }, [messages, logMessage]);

  const handleSend = async (override?: string, modality: 'text' | 'voice' | 'image_ocr' = 'text') => {
    const text = (override ?? input).trim();
    if (!text) return;
    if (!hasConsent) { setShowConsent(true); return; }
    if (!override) setInput('');
    void logMessage({ role: 'user', content: text, inputModality: modality });
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

  const handleMicClick = async () => {
    if (recorder.isRecording) {
      const blob = await recorder.stop();
      if (!blob || !user) return;
      setIsProcessingMedia(true);
      try {
        const b64 = await blobToBase64(blob);
        const path = `${user.id}/${Date.now()}.webm`;
        await supabase.storage.from('voice-notes').upload(path, blob, { contentType: blob.type, upsert: false });
        const { data, error } = await supabase.functions.invoke('media-extract', {
          body: { mode: 'voice', data: b64, mimeType: blob.type },
        });
        if (error) throw error;
        const transcript = (data?.transcript || '').trim();
        if (!transcript) {
          toast.error("Couldn't understand that recording. Try again?");
        } else {
          await handleSend(transcript, 'voice');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Voice transcription failed');
      } finally {
        setIsProcessingMedia(false);
      }
    } else {
      const ok = await recorder.start();
      if (!ok && recorder.error) toast.error(recorder.error);
    }
  };

  const handleFileChosen = async (file: File | null) => {
    if (!file || !user) return;
    if (!hasConsent) { setShowConsent(true); return; }
    setIsProcessingMedia(true);
    try {
      const b64 = await blobToBase64(file);
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      await supabase.storage.from('simple-mode-images').upload(path, file, { contentType: file.type, upsert: false });
      const { data, error } = await supabase.functions.invoke('media-extract', {
        body: { mode: 'image', data: b64, mimeType: file.type },
      });
      if (error) throw error;
      const transcript = data?.transcript || '';
      const extracted = data?.extracted;
      const prompt = buildPromptFromExtraction(transcript, extracted);
      if (!prompt) {
        toast.error("Couldn't read that image. Try a clearer photo?");
      } else {
        await handleSend(prompt, 'image_ocr');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Image read failed');
    } finally {
      setIsProcessingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const recordingSeconds = Math.floor(recorder.elapsedMs / 1000);

  return (
    <>
      <SEOHead title="Simple Mode — OneCare Assistant" description="Chat with OneCare to check your vitals, medications, and schedule." noIndex />
      <SimpleModeTransition />
      <Header />
      <SectionTabs section=\"learn\" variant=\"patient\" />
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
                Ask anything — type, speak, or snap a photo. I'll read and guide; I won't change records.
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { clearChat(); resetLog(); lastLoggedRef.current = null; }} className="h-8">
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
                  Tap the mic to speak, the paperclip to snap a med bottle or device readout, or just type below.
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3 px-1">Try asking</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {SUGGESTIONS.map(s => (
                    <Card key={s.label} className="p-3 cursor-pointer hover:bg-muted/50 transition-colors text-sm flex items-center gap-2 border-dashed" onClick={() => handleSend(s.label)}>
                      <span className="text-base">{s.icon}</span>
                      <span>{s.label}</span>
                    </Card>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Simple Mode is for general information, not medical advice. Voice and image inputs are stored privately and can be deleted from Settings → AI History.
                </span>
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => <MessageRow key={msg.id} message={msg} onNavigate={handleNavigate} />)}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingMedia || isLoading || recorder.isRecording}
              title="Snap a photo of a med bottle or device reading"
              aria-label="Attach a photo">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button type="button" variant={recorder.isRecording ? 'destructive' : 'outline'} size="icon"
              className="h-10 w-10 flex-shrink-0"
              onClick={handleMicClick}
              disabled={isProcessingMedia || isLoading}
              title={recorder.isRecording ? `Stop (${recordingSeconds}s)` : 'Hold to speak'}
              aria-label={recorder.isRecording ? 'Stop recording' : 'Start voice recording'}>
              {recorder.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Textarea
              ref={inputRef}
              value={recorder.isRecording ? `Recording… ${recordingSeconds}s / 60s` : input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isProcessingMedia ? 'Processing…' : 'Message OneCare…'}
              className="min-h-[40px] max-h-[160px] resize-none text-sm"
              rows={1}
              disabled={isLoading || isProcessingMedia || recorder.isRecording}
            />
            <Button onClick={() => handleSend()} disabled={!input.trim() || isLoading || isProcessingMedia || recorder.isRecording}
              className="h-10 px-4 flex-shrink-0 gradient-primary border-0">
              {isLoading || isProcessingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2 max-w-3xl mx-auto">
            Voice limited to 60s in beta — longer dictation (Otter-style streaming) coming soon. Simple Mode reads your data; it doesn't change records.
          </p>
        </div>
      </div>

      <AIConsentDialog
        open={showConsent}
        onOpenChange={setShowConsent}
        onConsent={async () => { await grantConsent(); setShowConsent(false); }}
        onDecline={() => setShowConsent(false)}
      />
    </>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildPromptFromExtraction(transcript: string, extracted: { kind?: string; medication?: { name?: string; dose?: string; frequency?: string }; vital?: { type?: string; value?: string; unit?: string } } | undefined): string {
  if (extracted?.kind === 'medication' && extracted.medication?.name) {
    const m = extracted.medication;
    return `I just took a photo of a medication. Please help me confirm and walk me through saving it:\n\n- Name: ${m.name}\n- Dose: ${m.dose ?? 'not visible'}\n- Frequency: ${m.frequency ?? 'not visible'}\n\nIs this safe with my current meds? If so, take me to the page to add it.`;
  }
  if (extracted?.kind === 'vital' && extracted.vital?.value) {
    const v = extracted.vital;
    return `I just took a photo of a ${v.type} reading: ${v.value} ${v.unit ?? ''}. Is this in normal range for me, and how do I log it?`;
  }
  return transcript ? `I took a photo. Here's what's on it:\n\n${transcript}\n\nWhat should I do with this?` : '';
}
