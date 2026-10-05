import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCRIBE_NOT_IN_PLAN_REASON } from '@/lib/destinations';
import { cn } from '@/lib/utils';

/**
 * What a clinician on Individual or Community sees where the scribe, dictation
 * or voice memos would be. The functions refuse those plans, so the control is
 * replaced by an explanation and a way to see plans, not left to fail after a
 * recording has been made.
 */
export function ScribeNotInPlanNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      data-testid="scribe-not-in-plan"
      className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-3', className)}
    >
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{SCRIBE_NOT_IN_PLAN_REASON}</p>
      <Button asChild size="sm" variant="outline">
        <Link to="/clinician/pricing">See plans</Link>
      </Button>
    </div>
  );
}
