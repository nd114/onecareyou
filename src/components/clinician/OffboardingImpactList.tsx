import { AlertTriangle, Loader2 } from 'lucide-react';
import { useOffboardingImpact } from '@/hooks/useOffboarding';
import { describeOffboardingImpact } from '@/lib/offboarding';

/**
 * The plain-words account of what ending a membership leaves behind, shown in
 * the confirmation before anyone presses the button. If ending would be
 * refused (the only owner), it says why and what to do instead.
 */
export function OffboardingImpactList({
  practiceId,
  userId,
  self = false,
}: {
  practiceId: string | null | undefined;
  userId: string | null | undefined;
  self?: boolean;
}) {
  const { data: impact, isLoading, error } = useOffboardingImpact(practiceId, userId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking what this leaves behind…
      </div>
    );
  }
  if (error || !impact) {
    // Say so rather than show nothing: an empty list reads as "nothing to hand over".
    return (
      <p className="text-sm text-destructive">
        Could not check what this leaves behind. You can still go ahead; open work will appear under
        Coverage afterwards.
      </p>
    );
  }

  if (impact.blockedReason) {
    return (
      <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <p>{impact.blockedReason}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5 text-sm list-disc pl-5" aria-label="What this leaves behind">
      {describeOffboardingImpact(impact, self).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
