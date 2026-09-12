import { ArrowDownRight, ArrowRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminSparkline } from '@/components/admin/AdminSparkline';
import { useAdminMovement, type AdminRange } from '@/hooks/useAdminToday';
import { cn } from '@/lib/utils';

const RANGE_LABEL: Record<AdminRange, string> = {
  '1': 'last 24 hours',
  '7': 'last 7 days',
  '30': 'last 30 days',
  '90': 'last 90 days',
};

function change(current: number, previous: number) {
  if (!previous) return { pct: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

/** Movement, not raw counts: each metric against the period before it, with a trend line. */
export function AdminMovementStrip({ range }: { range: AdminRange }) {
  const { metrics, seriesByKey, isLoading } = useAdminMovement(range);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Movement</CardTitle>
        <CardDescription>
          The {RANGE_LABEL[range]} against the {RANGE_LABEL[range].replace('last', 'previous')}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => {
              const { pct, direction } = change(
                Number(m.current_value),
                Number(m.previous_value),
              );
              const Icon =
                direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;
              return (
                <div
                  key={m.metric_key}
                  className="rounded-xl border bg-card/60 p-4 transition-colors hover:border-primary/40"
                >
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{m.label}</p>
                  <div className="flex items-end justify-between gap-3 mt-1">
                    <div>
                      <p className="text-2xl font-semibold leading-none">
                        {Number(m.current_value).toLocaleString()}
                      </p>
                      <p
                        className={cn(
                          'text-xs mt-1.5 flex items-center gap-1',
                          direction === 'up' && 'text-primary',
                          direction === 'down' && 'text-destructive',
                          direction === 'flat' && 'text-muted-foreground',
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {direction === 'flat' ? 'no change' : `${pct}%`}
                      </p>
                    </div>
                    <AdminSparkline
                      values={seriesByKey[m.metric_key] ?? []}
                      className="h-8 w-24 text-primary/70"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {Number(m.total_value).toLocaleString()} in total
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
