import { Activity, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminPulse } from '@/hooks/useAdminToday';
import { cn } from '@/lib/utils';

/** The last 24 hours: what happened, and what broke. */
export function AdminLivePulse() {
  const { pulse, isLoading } = useAdminPulse();

  const rows: Array<{ label: string; value: number; bad?: boolean }> = pulse
    ? [
        { label: 'Sync failures', value: Number(pulse.sync_failures), bad: true },
        { label: 'Sign-in throttles', value: Number(pulse.signin_throttles), bad: true },
        {
          label: 'Partner sign-in failures',
          value: Number(pulse.signin_partner_failures),
          bad: true,
        },
        { label: 'New accounts', value: Number(pulse.new_accounts) },
        { label: 'Documents added', value: Number(pulse.documents_added) },
        { label: 'Assistant chats', value: Number(pulse.assistant_conversations) },
        { label: 'Messages sent', value: Number(pulse.messages_sent) },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Last 24 hours
        </CardTitle>
        <CardDescription>Activity and failures across the platform.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <span
                  className={cn(
                    'font-semibold',
                    r.bad && r.value > 0 ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {r.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
