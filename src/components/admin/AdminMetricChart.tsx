import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { MovementMetric } from '@/hooks/useAdminToday';

interface AdminMetricChartProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: MovementMetric[];
  pointsByKey: Record<string, Array<{ day: string; value: number }>>;
  initialKey: string;
}

/**
 * The sparkline on the movement strip is decorative on purpose (no axis, no
 * tooltip, aria-hidden). This is the same admin_metric_series data with
 * nothing held back — a day axis, a real tooltip, and every metric one click
 * away — for actually going through a trend rather than eyeballing a shape.
 */
export function AdminMetricChart({
  open,
  onOpenChange,
  metrics,
  pointsByKey,
  initialKey,
}: AdminMetricChartProps) {
  const [key, setKey] = useState(initialKey);

  useEffect(() => {
    if (open) setKey(initialKey);
  }, [open, initialKey]);

  const label = metrics.find((m) => m.metric_key === key)?.label ?? key;
  const chartData = useMemo(
    () =>
      (pointsByKey[key] ?? []).map((p) => ({
        ...p,
        dateLabel: format(new Date(p.day), 'MMM d'),
      })),
    [pointsByKey, key],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}, day by day</DialogTitle>
          <DialogDescription>
            The same signal behind every sparkline on the strip, over the full window it was
            already computed for.
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={key}
          onValueChange={(v) => v && setKey(v)}
          className="flex-wrap justify-start rounded-lg border bg-card p-0.5 w-fit gap-0.5"
        >
          {metrics.map((m) => (
            <ToggleGroupItem key={m.metric_key} value={m.metric_key} className="h-7 px-2.5 text-xs">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="h-[280px] mt-2">
          {chartData.length < 2 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Not enough days yet to chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(_, payload) => payload[0]?.payload?.day || ''}
                  formatter={(value: number) => [value.toLocaleString(), label]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={chartData.length <= 31}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
