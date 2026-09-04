import { Database, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Where a medication came from.
 *
 * The patient's own entries are the common case and do not need a badge —
 * labelling everything labels nothing. This only appears on a row somebody
 * else put there, which is also the row the patient cannot change, so the
 * badge and the missing Edit button explain each other.
 */
interface Props {
  source?: string | null;
  className?: string;
}

export function MedicationSourceBadge({ source, className }: Props) {
  if (!source || source === 'manual') return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 text-xs font-normal ${className ?? ''}`}>
            <Database className="h-3 w-3" />
            {source}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>
            Imported from {source}. It is their record of what they prescribed, so it is read-only
            here — ask them to change it and it will update on the next sync.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The counterpart for a list that wants to say "you added this" explicitly. */
export function MedicationOwnBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={`gap-1 text-xs font-normal ${className ?? ''}`}>
      <User className="h-3 w-3" />
      You
    </Badge>
  );
}
