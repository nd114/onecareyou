import {
  Activity,
  AlertTriangle,
  Bot,
  Loader2,
  Mic,
  RefreshCw,
  ShieldAlert,
  Repeat,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminReliability } from '@/hooks/useAdminReliability';
import { formatDayTime } from '@/lib/format-date';

/** Reliability — what broke, from the signals this database actually holds. */
export function AdminReliabilityPanel() {
  const { overview, failures, isLoading, requeue, isRequeueing } = useAdminReliability();

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ex = overview?.record_exchange;
  const q = overview?.export_queue;
  const ai = overview?.assistant;
  const dict = overview?.dictation;
  const si = overview?.sign_in;
  const al = overview?.alerts;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Everything below is read from this database. Edge function and auth service logs live
        outside it and are not counted here.
      </p>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              Record exchange
            </CardTitle>
            <CardDescription className="text-xs">
              Hospital connections importing and exporting records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Active connections" value={ex?.connections ?? 0} />
            <Row
              label="In an error state"
              value={ex?.connections_in_error ?? 0}
              warn={(ex?.connections_in_error ?? 0) > 0}
            />
            <Row
              label="Failures, last 24h"
              value={ex?.failures_24h ?? 0}
              warn={(ex?.failures_24h ?? 0) > 0}
            />
            <Row label="Failures, last 7d" value={ex?.failures_7d ?? 0} />
            <Row label="Successes, last 24h" value={ex?.successes_24h ?? 0} />
            <Row label="Never synced" value={ex?.never_synced ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              Export queue
            </CardTitle>
            <CardDescription className="text-xs">
              Readings waiting to reach a hospital system.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Pending" value={q?.pending ?? 0} />
            <Row label="Failed" value={q?.failed ?? 0} warn={(q?.failed ?? 0) > 0} />
            <Row
              label="Stuck after 3 tries"
              value={q?.stuck ?? 0}
              warn={(q?.stuck ?? 0) > 0}
            />
            <Row
              label="Oldest waiting"
              value={q?.oldest_pending_at ? formatDayTime(q.oldest_pending_at) : 'Nothing waiting'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Sign-in
            </CardTitle>
            <CardDescription className="text-xs">
              Throttling and partner sign-in failures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Throttled, last 24h" value={si?.throttled_24h ?? 0} />
            <Row label="Throttled, last 7d" value={si?.throttled_7d ?? 0} />
            <Row
              label="Partner failures, 24h"
              value={si?.partner_failures_24h ?? 0}
              warn={(si?.partner_failures_24h ?? 0) > 0}
            />
            {!!si?.top_buckets?.length && (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1">Most throttled this week</p>
                <div className="flex flex-wrap gap-1.5">
                  {si.top_buckets.map((b) => (
                    <Badge key={b.bucket} variant="secondary" className="text-[11px]">
                      {b.bucket} · {b.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Assistant volume
            </CardTitle>
            <CardDescription className="text-xs">
              Spend is billed by the model provider, so this counts use, not cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Conversations, 24h" value={ai?.conversations_24h ?? 0} />
            <Row label="Conversations, 7d" value={ai?.conversations_7d ?? 0} />
            <Row label="Messages, 24h" value={ai?.messages_24h ?? 0} />
            <Row label="Messages, 7d" value={ai?.messages_7d ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Dictation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Failed, last 24h"
              value={dict?.failed_24h ?? 0}
              warn={(dict?.failed_24h ?? 0) > 0}
            />
            <Row label="Failed, last 7d" value={dict?.failed_7d ?? 0} />
            <Row label="Awaiting a clinician" value={dict?.awaiting_review ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Vital alerts, 24h" value={al?.vital_alerts_24h ?? 0} />
            <Row
              label="Unacknowledged this week"
              value={al?.unacknowledged ?? 0}
              warn={(al?.unacknowledged ?? 0) > 0}
            />
            <Row label="Caregiver alerts, 7d" value={al?.caregiver_alerts_7d ?? 0} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connections by failure</CardTitle>
          <CardDescription>
            Worst first. Requeueing clears the attempt count so the worker treats the backlog as
            new work rather than skipping it as exhausted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failures.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No active connections yet.</p>
          ) : (
            <div className="space-y-2">
              {failures.map((f) => (
                <div
                  key={f.connection_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {f.provider_name ?? 'Unnamed connection'}
                      </span>
                      <Badge
                        variant={f.sync_status === 'error' ? 'destructive' : 'secondary'}
                        className="capitalize"
                      >
                        {f.sync_status}
                      </Badge>
                      {f.failures_7d > 0 && (
                        <span className="text-xs text-destructive">
                          {f.failures_7d} failure{f.failures_7d === 1 ? '' : 's'} this week
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {f.last_error
                        ? f.last_error
                        : f.last_sync_at
                          ? `Last synced ${formatDayTime(f.last_sync_at)}`
                          : 'Never synced'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {f.queued_exports} queued
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRequeueing || f.queued_exports === 0}
                      onClick={() => requeue(f.connection_id)}
                    >
                      Requeue
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-right ${warn ? 'text-destructive' : ''}`}>
        {warn && <AlertTriangle className="h-3 w-3 inline mr-1" />}
        {value}
      </span>
    </div>
  );
}
