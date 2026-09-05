import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminOps } from '@/hooks/useAdminOps';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';
import { formatDayTime } from '@/lib/format-date';

const ACTION_LABELS: Record<string, string> = {
  create_tenant: 'Created tenant',
  update_tenant: 'Updated tenant',
  update_tenant_branding: 'Updated tenant branding',
  invite_tenant_owner: 'Invited tenant owner',
  cancel_tenant_invitation: 'Cancelled invitation',
  grant_platform_admin: 'Granted platform admin',
  revoke_platform_admin: 'Removed platform admin',
};

/** Read-only log of every platform-admin action, for internal accountability. */
export function AdminActivityPanel() {
  const { actions, isLoadingActions } = useAdminOps();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return actions.filter((a) => {
      if (action !== 'all' && a.action !== action) return false;
      if (!q) return true;
      const details = JSON.stringify(a.details ?? {}).toLowerCase();
      return (
        a.actor_email?.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        details.includes(q)
      );
    });
  }, [actions, search, action]);

  const { page, setPage, pageCount, pageItems, total, pageSize } = usePagination(filtered, 15);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle className="text-base">Admin activity</CardTitle>
          <CardDescription>
            Every platform-admin action, newest first. This log cannot be edited.
          </CardDescription>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by admin, action or tenant"
              className="pl-9"
              aria-label="Search admin activity"
            />
          </div>
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-56" aria-label="Filter by action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingActions ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {actions.length === 0
              ? 'No admin activity recorded yet.'
              : 'No actions match those filters.'}
          </p>
        ) : (

          <div className="space-y-2">
            {pageItems.map((a) => {
              const details = a.details ?? {};
              const summary = [details.name, details.email, details.slug, details.tier]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {ACTION_LABELS[a.action] ?? a.action}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.actor_email ?? 'Unknown admin'}
                        {summary ? ` — ${summary}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDayTime(a.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
            <AdminPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              label="actions"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
