import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, ScrollText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { formatDayTime } from '@/lib/format-date';

const PAGE_SIZE = 25;

/**
 * Read-only activity & audit trail.
 *
 * Records are append-only and surfaced here for the account holder's own
 * transparency (and for legal traceability). There is deliberately no edit or
 * delete affordance — entries cannot be altered from the app.
 *
 * Pages are fetched a page at a time rather than pulled down whole and sliced:
 * an account that has been used for a year has more history than a settings
 * card should ever hold in memory.
 */
export function AuditTrailSection() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useAuditLog({ page, pageSize: PAGE_SIZE });
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          <>
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

            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">
                {total > 0
                  ? `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + entries.length} of ${total}`
                  : null}
                {isFetching ? ' · updating…' : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Newer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Earlier <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
