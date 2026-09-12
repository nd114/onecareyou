import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bug,
  Building2,
  Check,
  HardDrive,
  Inbox,
  Loader2,
  Mail,
  RefreshCcw,
  Timer,
  Undo2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAttention, type AttentionItem } from '@/hooks/useAdminToday';
import { formatDayTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<string, typeof HardDrive> = {
  storage: HardDrive,
  invitation: Mail,
  contact: Inbox,
  bug: Bug,
  trial: Timer,
  empty_tenant: Building2,
  sync_failure: RefreshCcw,
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-destructive/40 bg-destructive/5',
  warning: 'border-primary/30 bg-primary/[0.03]',
  info: 'border-border',
};

function actionFor(item: AttentionItem): { to: string; label: string } | null {
  switch (item.target_type) {
    case 'tenant':
      return item.target_id ? { to: `/admin/tenants/${item.target_id}`, label: 'Open tenant' } : null;
    default:
      return null;
  }
}

/** Things with the founder's name on them, each with its action and a way to clear it. */
export function AdminAttentionQueue() {
  const { items, isLoading, dismiss, restore, dismissedKeys, dismissedCount } = useAdminAttention();

  const critical = items.filter((i) => i.severity === 'critical').length;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Needs you
            </CardTitle>
            <CardDescription>
              {items.length === 0
                ? 'Nothing is waiting on you right now.'
                : `${items.length} open item${items.length === 1 ? '' : 's'}${
                    critical ? ` · ${critical} urgent` : ''
                  }.`}
            </CardDescription>
          </div>
          {dismissedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => dismissedKeys.forEach((k) => restore(k))}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Restore {dismissedCount} cleared
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary" />
            All clear. Storage, invitations, messages, bugs, trials and syncs all look fine.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind] ?? AlertTriangle;
              const action = actionFor(item);
              return (
                <div
                  key={item.item_key}
                  className={cn(
                    'flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between',
                    SEVERITY_STYLE[item.severity] ?? 'border-border',
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        item.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {item.detail}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDayTime(item.occurred_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.severity === 'critical' && <Badge variant="destructive">Urgent</Badge>}
                    {action && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={action.to}>{action.label}</Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss(item.item_key)}
                      aria-label="Clear from queue"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
