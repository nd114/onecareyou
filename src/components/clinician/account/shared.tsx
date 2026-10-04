import type { ReactNode } from 'react';
import { Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ADDON_CONTACT_EMAIL } from '@/hooks/usePracticeAccount';

/** null means no limit is stated, which is how the database says "unlimited". */
export const formatLimit = (limit: number | null) => (limit === null ? 'No limit' : limit.toLocaleString('en-US'));

export const pct = (used: number, limit: number | null) =>
  limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

export const minutes = (n: number) => `${Math.round(n).toLocaleString('en-US')} min`;

/** One figure and how much of its allowance it is. Same shape as the founder console's stat cards. */
export function StatCard({
  label,
  value,
  of,
  progress,
  hint,
  over = false,
  testId,
}: {
  label: string;
  value: ReactNode;
  of?: ReactNode;
  /** 0-100; omitted for a figure with no allowance. */
  progress?: number;
  hint?: ReactNode;
  over?: boolean;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-semibold">
          {value}
          {of !== undefined && <span className="text-sm font-normal text-muted-foreground"> / {of}</span>}
        </p>
        {progress !== undefined && (
          <Progress value={progress} className={`mt-2 h-1.5 ${over ? '[&>div]:bg-destructive' : ''}`} />
        )}
        {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * What stands in for a buy button when the server says the price is not set
 * up. A button that fails after a click is worse than one sentence and a way
 * to ask.
 */
export function AddonNotConfigured({ subject = 'Add-ons' }: { subject?: string }) {
  return (
    <div
      role="status"
      data-testid="addon-not-configured"
      className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
    >
      <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      <p className="text-muted-foreground">
        Add-ons will be available shortly; contact us and we will set this up for you.{' '}
        <a
          href={`mailto:${ADDON_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          {ADDON_CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
