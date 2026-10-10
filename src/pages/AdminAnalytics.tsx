import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/seo/SEOHead';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDayTime } from '@/lib/format-date';

type Row = { label?: string; path?: string; count?: number; views?: number; sessions?: number; avg_s?: number };
interface Analytics {
  totals: Record<string, number>;
  daily: Array<{ day: string; views: number; sessions: number; visitors: number }>;
  pages: Row[];
  entries: Row[];
  exits: Row[];
  referrers: Row[];
  campaigns: Row[];
  devices: Row[];
  browsers: Row[];
  audiences: Row[];
  hours: Array<{ hour: number; views: number }>;
  countries?: Row[];
  recent_sessions: Array<{
    session_id: string; audience: string; started_at: string; duration_s: number;
    device: string | null; browser?: string | null; referrer: string | null; paths: string[];
    country?: string | null; user_id?: string | null; email?: string | null;
  }>;
}

const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
function placeLabel(c?: string | null) {
  if (!c || c === 'Unknown') return 'Unknown';
  if (c.startsWith('tz:')) return `~${c.slice(3)}`;
  try { return regionNames?.of(c) ?? c; } catch { return c; }
}

const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function Bars({ rows, value }: { rows: Row[]; value: (r: Row) => number }) {
  const max = Math.max(1, ...rows.map(value));
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="relative rounded-md overflow-hidden text-sm">
          <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${(value(r) / max) * 100}%` }} />
          <div className="relative flex justify-between gap-3 px-2 py-1">
            <span className="truncate font-mono text-xs">{r.label ?? r.path}</span>
            <span className="tabular-nums text-muted-foreground">{value(r)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PersonJourneys({ days }: { days: number }) {
  const { isAdmin } = useAdminRole();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search, 300).trim();
  const q = useQuery({
    queryKey: ['admin-person-journeys', term, days],
    enabled: isAdmin && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_person_journeys', { _search: term, _days: days });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Panel title="Person journeys" description="Search a name or email to see the pages they visited, in order, with time on each.">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. jane@clinic.com" className="pl-9" aria-label="Search a person" />
      </div>
      {term.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least two characters.</p>
      ) : q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : !q.data?.length ? (
        <p className="text-sm text-muted-foreground">No visits recorded for that person in this window.</p>
      ) : (
        <div className="space-y-3">
          {q.data.map((s) => (
            <div key={s.session_id} className="rounded-lg border p-3">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium">{s.name || s.email}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDayTime(s.started_at)} · {secs(s.duration_s ?? 0)} · {s.device ?? '—'}
                </span>
              </div>
              <ol className="mt-2 space-y-0.5">
                {((s.steps as Array<{ path: string; at: string; s: number }>) ?? []).map((st, i) => (
                  <li key={i} className="flex justify-between gap-3 text-xs">
                    <span className="font-mono truncate">{i + 1}. {st.path}</span>
                    <span className="text-muted-foreground tabular-nums">{secs(st.s)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function AdminAnalytics() {
  const { isAdmin } = useAdminRole();
  const [range, setRange] = useState('7');
  const days = Number(range);
  const q = useQuery({
    queryKey: ['admin-site-analytics', days],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<Analytics | null> => {
      const { data, error } = await supabase.rpc('admin_site_analytics', { _days: days });
      if (error) throw error;
      return data as unknown as Analytics | null;
    },
  });
  const a = q.data;
  const t = a?.totals ?? {};
  const maxDay = Math.max(1, ...(a?.daily ?? []).map((d) => d.views));
  const hours = Array.from({ length: 24 }, (_, h) => a?.hours.find((x) => x.hour === h)?.views ?? 0);
  const maxHour = Math.max(1, ...hours);

  return (
    <AdminShell
      title="Analytics"
      description="Where people go, how long they stay, and where they leave. Pages only — never what anyone types."
      actions={
        <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v)} className="rounded-lg border bg-card p-0.5 mr-1" aria-label="Time range">
          {[['1', '24h'], ['7', '7d'], ['30', '30d'], ['90', '90d']].map(([v, l]) => (
            <ToggleGroupItem key={v} value={v} className="h-7 px-2.5 text-xs">{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      <SEOHead title="Analytics — Platform Admin" description="Site analytics." noIndex />
      {q.isLoading || !a ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-7">
            {[
              ['Page views', t.views], ['Sessions', t.sessions], ['Visitors', t.visitors],
              ['Signed-in people', t.signed_in], ['Avg session', secs(t.avg_session_s ?? 0)],
              ['Pages / session', t.pages_per_session], ['Bounce rate', `${t.bounce_rate ?? 0}%`],
            ].map(([l, v]) => (
              <Card key={l as string}><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="text-xl font-semibold tabular-nums mt-1">{v ?? 0}</div>
              </CardContent></Card>
            ))}
          </div>

          <Panel title="Daily traffic" description="Page views per day; hover a bar for sessions and visitors.">
            <div className="flex items-end gap-1 h-32">
              {a.daily.map((d) => (
                <div key={d.day} className="flex-1 bg-primary/70 rounded-t" style={{ height: `${(d.views / maxDay) * 100}%` }}
                  title={`${d.day}: ${d.views} views · ${d.sessions} sessions · ${d.visitors} visitors`} />
              ))}
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Top pages" description="Views, with average time on page.">
              <div className="space-y-1">
                {a.pages.map((p) => (
                  <div key={p.path} className="flex justify-between gap-3 text-xs border-b last:border-0 py-1.5">
                    <span className="font-mono truncate">{p.path}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{p.views} views · {p.sessions} sessions · {secs(p.avg_s ?? 0)}</span>
                  </div>
                ))}
                {!a.pages.length && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
              </div>
            </Panel>
            <Panel title="Who is visiting" description="Sessions by kind of visitor.">
              <Bars rows={a.audiences} value={(r) => r.sessions ?? 0} />
            </Panel>
            <Panel title="Where they arrive"><Bars rows={a.entries} value={(r) => r.count ?? 0} /></Panel>
            <Panel title="Where they leave"><Bars rows={a.exits} value={(r) => r.count ?? 0} /></Panel>
            <Panel title="Referrers"><Bars rows={a.referrers} value={(r) => r.count ?? 0} /></Panel>
            <Panel title="Campaigns" description="From ?utm_source= on shared links.">
              <Bars rows={a.campaigns} value={(r) => r.count ?? 0} />
            </Panel>
            <Panel title="Devices"><Bars rows={a.devices} value={(r) => r.count ?? 0} /></Panel>
            <Panel title="Browsers"><Bars rows={a.browsers} value={(r) => r.count ?? 0} /></Panel>
          </div>

          <Panel title="Busiest hours (UTC)">
            <div className="flex items-end gap-0.5 h-20">
              {hours.map((v, h) => (
                <div key={h} className="flex-1 bg-primary/60 rounded-t" style={{ height: `${(v / maxHour) * 100}%` }} title={`${h}:00 — ${v} views`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
          </Panel>

          <Panel title="Countries" description="Sessions by visitor country (or browser time zone when the country is unknown).">
            <Bars rows={(a.countries ?? []).map((r) => ({ ...r, label: placeLabel(r.label) }))} value={(r) => r.count ?? 0} />
          </Panel>

          <Panel title="Recent sessions" description="Each visit: who (if signed in), where from, and the pages they went through.">
            <div className="space-y-2">
              {a.recent_sessions.map((s) => (
                <div key={s.session_id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{s.email ?? s.audience}</span>
                      {' · '}{placeLabel(s.country)} · {s.device ?? '—'}{s.browser ? ` · ${s.browser}` : ''}{s.referrer ? ` · from ${s.referrer}` : ''}
                      {s.user_id && <span className="block font-mono text-[10px] select-all">{s.user_id}</span>}
                    </span>
                    <span>{formatDayTime(s.started_at)} · {secs(s.duration_s ?? 0)}</span>
                  </div>
                  <p className="font-mono text-xs mt-1.5 break-words">{s.paths.join(' → ')}</p>
                </div>
              ))}
              {!a.recent_sessions.length && <p className="text-sm text-muted-foreground">No visits recorded yet — tracking starts now.</p>}
            </div>
          </Panel>

          <PersonJourneys days={days} />
        </div>
      )}
    </AdminShell>
  );
}
