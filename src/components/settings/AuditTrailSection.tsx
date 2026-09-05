import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Lock, ScrollText, Loader2 } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { formatDayTime } from '@/lib/format-date';

/**
 * Read-only activity & audit trail.
 *
 * Records are append-only and surfaced here for the account holder's own
 * transparency (and for legal traceability). There is deliberately no edit or
 * delete affordance — entries cannot be altered from the app.
 */
export function AuditTrailSection() {
  const { data: entries = [], isLoading } = useAuditLog({ limit: 100 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" /> Activity & audit trail
        </CardTitle>
        <CardDescription className="flex items-start gap-2">
          <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            An append-only record of actions taken on your account, including changes
            you approved for the AI assistant. Visible to you, but not editable — kept
            for your transparency and for legal traceability.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your audit trail…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No recorded activity yet. Entries appear here as records are accessed,
            shared or changed.
          </p>
        ) : (
          <ScrollArea className="h-80 pr-3">
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">
                      {e.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {e.resource_type.replace(/_/g, ' ')}
                      {e.resource_id ? ` · ${e.resource_id.slice(0, 8)}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {formatDayTime(e.created_at)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
