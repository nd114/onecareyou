import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { ChatMessage } from '@/hooks/useAIChat';
import { describeAction } from '@/lib/ai-actions';
import { cn } from '@/lib/utils';

interface ProposedActionsCardProps {
  message: ChatMessage;
  onApprove: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  compact?: boolean;
}

/**
 * Renders the assistant's proposed changes as an approval checklist.
 * Nothing is written to the user's record until they press Approve.
 */
export function ProposedActionsCard({ message, onApprove, onDiscard, compact }: ProposedActionsCardProps) {
  const actions = message.proposedActions;
  if (!actions || actions.length === 0) return null;

  const state = message.actionState ?? 'pending';
  const outcomeFor = (id: string) => message.actionOutcomes?.find(o => o.id === id);

  return (
    <div className={cn('mt-3 rounded-xl border bg-card text-card-foreground', compact ? 'p-3' : 'p-4')}>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {state === 'applied' ? 'Applied' : state === 'discarded' ? 'Discarded' : 'Needs your approval'}
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {actions.length} {actions.length === 1 ? 'change' : 'changes'}
        </Badge>
      </div>

      <ul className="space-y-2">
        {actions.map((action) => {
          const { title, detail } = describeAction(action);
          const outcome = outcomeFor(action.id);
          return (
            <li key={action.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">
                {outcome ? (
                  outcome.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )
                ) : (
                  <span className="block h-2 w-2 mt-1.5 rounded-full bg-primary/50" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{title}</span>
                {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
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
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying your approved changes…
        </p>
      )}

      {state === 'discarded' && (
        <p className="mt-3 text-xs text-muted-foreground">Nothing was saved.</p>
      )}
    </div>
  );
}
