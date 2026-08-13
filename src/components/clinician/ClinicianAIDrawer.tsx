import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Send, Loader2, Trash2, ArrowRight, Stethoscope, User, ShieldCheck,
  Check, X, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useClinicianAIChat, ClinicianChatMessage } from '@/hooks/useClinicianAIChat';
import { describeClinicianAction } from '@/lib/clinician-ai-actions';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Who on my panel needs attention today, and why?',
  'Draft a check-in message for my patients with high blood pressure readings.',
  'Set a blood pressure alert above 150/95 for my hypertensive patients.',
  'Draft guidance to bring a fasting glucose log to the next visit.',
];

/** Approval checklist for clinician-side drafts. Nothing sends until approved. */
function DraftCard({
  message,
  onApprove,
  onDiscard,
}: {
  message: ClinicianChatMessage;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const actions = message.proposedActions;
  if (!actions?.length) return null;
  const state = message.actionState ?? 'pending';

  return (
    <div className="mt-3 rounded-xl border bg-card text-card-foreground p-3">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {state === 'applied' ? 'Approved & applied' : state === 'discarded' ? 'Discarded' : 'Needs your approval'}
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {actions.length} {actions.length === 1 ? 'draft' : 'drafts'}
        </Badge>
      </div>

      <ul className="space-y-2">
        {actions.map((action) => {
          const { title, detail } = describeClinicianAction(action);
          const outcome = message.actionOutcomes?.find(o => o.id === action.id);
          return (
            <li key={action.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">
                {outcome ? (
                  outcome.ok
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <span className="block h-2 w-2 mt-1.5 rounded-full bg-primary/50" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{title}</span>
                {detail && <span className="block text-xs text-muted-foreground whitespace-pre-wrap">{detail}</span>}
                {outcome && (
                  <span className={cn('block text-xs', outcome.ok ? 'text-muted-foreground' : 'text-destructive')}>
                    {outcome.message}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {state === 'pending' && (
        <div className="flex gap-2 mt-3">
          <Button size="sm" className="h-8" onClick={() => onApprove(message.id)}>
            <Check className="h-3.5 w-3.5 mr-1.5" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onDiscard(message.id)}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Discard
          </Button>
        </div>
      )}
      {state === 'applying' && (
        <p className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying approved drafts…
        </p>
      )}
      {state === 'discarded' && <p className="mt-3 text-xs text-muted-foreground">Nothing was sent or saved.</p>}
    </div>
  );
}

export function ClinicianAIDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { messages, isLoading, sendMessage, clearChat, approveActions, discardActions } = useClinicianAIChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, isLoading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || isLoading) return;
    setInput('');
    await sendMessage(value);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base">Clinical Assistant</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8"
              onClick={clearChat}
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-left">
            Drafts messages, guidance and alert thresholds for your review. Nothing is sent or saved until you approve it.
          </p>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask about your panel, or have me draft work for you to approve.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="w-full text-left text-sm rounded-lg border px-3 py-2 hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'assistant' && (
                  <span className="mt-1 h-7 w-7 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <Stethoscope className="h-4 w-4 text-primary" />
                  </span>
                )}
                <div className={cn('max-w-[85%]', m.role === 'user' && 'order-first')}>
                  <div
                    className={cn(
                      'rounded-2xl px-3 py-2 text-sm',
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    {m.role === 'assistant'
                      ? <MarkdownMessage content={m.content} />
                      : <span className="whitespace-pre-wrap">{m.content}</span>}
                  </div>

                  {m.role === 'assistant' && (
                    <DraftCard message={m} onApprove={approveActions} onDiscard={discardActions} />
                  )}

                  {m.suggestedRoute && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-8"
                      onClick={() => {
                        navigate(m.suggestedRoute!);
                        onOpenChange(false);
                      }}
                    >
                      Go there <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  )}
                </div>
                {m.role === 'user' && (
                  <span className="mt-1 h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>
        </div>

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your panel or draft something…"
              rows={2}
              className="resize-none"
            />
            <Button size="icon" onClick={() => handleSend()} disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Decision support only — no diagnosis or prescribing. You remain responsible for every approved action.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
