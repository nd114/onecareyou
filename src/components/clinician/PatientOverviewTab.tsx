import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Pill, Send, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { resolveVitalConfig } from '@/types/health';

/**
 * The landing view for a patient: how are they, right now.
 *
 * Opening a chart used to land on Encounters, which answers a question the
 * clinician has not asked yet. This answers the first one — latest readings,
 * what they are taking, whether they are taking it, and what was last said —
 * and every block links into the detail rather than repeating it.
 */
interface Props {
  vitals: any[];
  medications: any[];
  adherenceRate: number | null;
  guidance: any[];
  onJump: (tab: string) => void;
}

export function PatientOverviewTab({ vitals, medications, adherenceRate, guidance, onJump }: Props) {
  const latestByType = new Map<string, any>();
  for (const v of vitals) if (!latestByType.has(v.type)) latestByType.set(v.type, v);
  const latest = Array.from(latestByType.values()).slice(0, 6);
  const active = medications.filter((m) => m.is_active);
  const lastGuidance = guidance[0];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" /> Latest readings
          </CardTitle>
          <CardDescription>The most recent value for each thing being tracked</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {latest.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            latest.map((v) => {
              const config = resolveVitalConfig(v.type);
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{config?.label || v.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(v.recorded_at))} ago
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {v.value_secondary ? `${v.value}/${v.value_secondary}` : v.value}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{v.unit}</span>
                  </p>
                </div>
              );
            })
          )}
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => onJump('vitals')}>
            See the full history <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Pill className="h-4 w-4 text-primary" /> What they are taking
          </CardTitle>
          <CardDescription>
            {adherenceRate === null
              ? 'Active medicines'
              : `Active medicines · ${adherenceRate}% of doses taken`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No active medicines on file.</p>
          ) : (
            active.slice(0, 6).map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.dosage} • {m.frequency}
                  </p>
                </div>
                <Badge variant="secondary" className="flex-shrink-0">
                  {m.type}
                </Badge>
              </div>
            ))
          )}
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => onJump('medications')}>
              All medicines <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => onJump('adherence')}>
              Adherence <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-primary" /> Last thing you sent
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!lastGuidance ? (
            <p className="text-sm text-muted-foreground">
              No guidance sent to this patient yet.
            </p>
          ) : (
            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{lastGuidance.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{lastGuidance.instruction}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(lastGuidance.created_at))} ago
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">
                  {lastGuidance.status}
                </Badge>
              </div>
            </div>
          )}
          <Button variant="ghost" size="sm" className="mt-2 gap-1" onClick={() => onJump('guidance')}>
            Guidance history <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
