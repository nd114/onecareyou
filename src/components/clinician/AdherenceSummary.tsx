import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { summariseAdherence } from '@/lib/adherence';

/**
 * Adherence, summary first.
 *
 * A patient on four medicines for three months has well over a thousand doses.
 * A list of them is not a clinical finding; the pattern is. So the period gets
 * a single number, each medicine gets its own, the weeks show where the misses
 * cluster, and the dose-by-dose list stays behind a deliberate click with
 * filters on it.
 */
const PER_PAGE = 20;

interface Props {
  entries: any[];
  loading?: boolean;
}

export function AdherenceSummary({ entries, loading }: Props) {
  const [days, setDays] = useState(30);
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const [medFilter, setMedFilter] = useState('all');
  const [missedOnly, setMissedOnly] = useState(false);
  const [search, setSearch] = useState('');

  const inPeriod = useMemo(() => {
    const from = Date.now() - days * 86400000;
    return entries.filter((e) => new Date(e.scheduled_time).getTime() >= from);
  }, [entries, days]);

  const overall = useMemo(() => summariseAdherence(inPeriod), [inPeriod]);

  const perMedicine = useMemo(() => {
    const by = new Map<string, any[]>();
    for (const e of inPeriod) {
      const name = e.medication?.name || 'Unknown medicine';
      if (!by.has(name)) by.set(name, []);
      by.get(name)!.push(e);
    }
    return Array.from(by.entries())
      .map(([name, rows]) => ({
        name,
        rate: summariseAdherence(rows).rate,
        missed: rows.filter((r) => r.status === 'missed').length,
        total: rows.length,
      }))
      .sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100));
  }, [inPeriod]);

  const weeks = useMemo(() => {
    const buckets: { label: string; missed: number; total: number }[] = [];
    const weekCount = Math.ceil(days / 7);
    for (let w = 0; w < weekCount; w++) {
      const end = Date.now() - w * 7 * 86400000;
      const start = end - 7 * 86400000;
      const rows = inPeriod.filter((e) => {
        const t = new Date(e.scheduled_time).getTime();
        return t >= start && t < end;
      });
      buckets.unshift({
        label: w === 0 ? 'This week' : `${w + 1}w ago`,
        missed: rows.filter((r) => r.status === 'missed').length,
        total: rows.length,
      });
    }
    return buckets;
  }, [inPeriod, days]);

  const medicineNames = useMemo(
    () => Array.from(new Set(inPeriod.map((e) => e.medication?.name).filter(Boolean))) as string[],
    [inPeriod],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inPeriod.filter((e) => {
      if (medFilter !== 'all' && e.medication?.name !== medFilter) return false;
      if (missedOnly && e.status !== 'missed') return false;
      if (q && !(e.medication?.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inPeriod, medFilter, missedOnly, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const slice = filtered.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Medication adherence</CardTitle>
            <CardDescription>
              {overall.rate === null
                ? 'No doses have come due in this period'
                : `${overall.rate}% of doses taken over the last ${days} days`}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? 'default' : 'outline'}
                onClick={() => {
                  setDays(d);
                  setPage(0);
                }}
              >
                {d} days
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : inPeriod.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No scheduled doses in this period.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {inPeriod.filter((e) => e.status === 'taken').length}
                </p>
                <p className="text-xs text-muted-foreground">Taken</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {inPeriod.filter((e) => e.status === 'skipped').length}
                </p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">
                  {inPeriod.filter((e) => e.status === 'missed').length}
                </p>
                <p className="text-xs text-muted-foreground">Missed</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                By medicine
              </p>
              {perMedicine.map((m) => (
                <div key={m.name} className="flex items-center gap-3">
                  <p className="w-40 flex-shrink-0 truncate text-sm">{m.name}</p>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        (m.rate ?? 100) >= 80 ? 'bg-green-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${m.rate ?? 0}%` }}
                    />
                  </div>
                  <p className="w-24 flex-shrink-0 text-right text-xs text-muted-foreground">
                    {m.rate === null ? '—' : `${m.rate}%`} · {m.missed} missed
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Where the misses fall
              </p>
              <div className="flex items-end gap-1">
                {weeks.map((w) => {
                  const pct = w.total === 0 ? 0 : (w.missed / w.total) * 100;
                  return (
                    <div key={w.label} className="flex-1 text-center">
                      <div className="flex h-16 items-end">
                        <div
                          className="w-full rounded-t bg-red-500/70"
                          style={{ height: `${Math.max(pct === 0 ? 0 : 6, pct)}%` }}
                          title={`${w.missed} of ${w.total} doses missed`}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{w.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {!showAll ? (
              <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
                See every dose ({inPeriod.length})
              </Button>
            ) : (
              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={medFilter}
                    onValueChange={(v) => {
                      setMedFilter(v);
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[200px] text-xs">
                      <SelectValue placeholder="All medicines" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All medicines</SelectItem>
                      {medicineNames.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Search medicine"
                    className="h-8 w-[180px] text-xs"
                  />
                  <Button
                    size="sm"
                    variant={missedOnly ? 'default' : 'outline'}
                    onClick={() => {
                      setMissedOnly((v) => !v);
                      setPage(0);
                    }}
                  >
                    Missed only
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAll(false)}>
                    Hide the list
                  </Button>
                </div>

                {slice.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {entry.status === 'taken' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : entry.status === 'skipped' ? (
                        <Clock className="h-4 w-4 text-amber-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{entry.medication?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(entry.scheduled_time), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={entry.status === 'taken' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {entry.status}
                    </Badge>
                  </div>
                ))}

                {pages > 1 && (
                  <div className="flex items-center justify-between border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Page {page + 1} of {pages} · {filtered.length} doses
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pages - 1}
                        onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
