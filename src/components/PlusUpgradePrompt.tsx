import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * What a Free patient sees in place of an AI feature. Patient AI (the
 * assistant, lab-report reading, document summaries) is part of OneCare Plus,
 * and the functions refuse Free accounts, so offering the control and
 * showing an error afterwards would be the worse way to learn it.
 */
export function PlusUpgradePrompt({
  feature,
  description,
  compact = false,
  className,
}: {
  /** What is being offered, e.g. "The AI assistant". */
  feature: string;
  description?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="note"
      data-testid="plus-upgrade-prompt"
      className={cn(
        'flex flex-col items-center text-center gap-2 rounded-lg border border-dashed bg-muted/30',
        compact ? 'p-3' : 'p-6',
        className,
      )}
    >
      <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
      <p className="text-sm font-medium">{feature} is a Plus feature</p>
      {description && <p className="text-xs text-muted-foreground max-w-sm">{description}</p>}
      <Button asChild size="sm" variant="outline">
        <Link to="/pricing">See OneCare Plus</Link>
      </Button>
    </div>
  );
}
