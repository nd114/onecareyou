import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminOps } from '@/hooks/useAdminOps';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';

const ACTION_LABELS: Record<string, string> = {
  create_tenant: 'Created tenant',
  update_tenant: 'Updated tenant',
  invite_tenant_owner: 'Invited tenant owner',
  cancel_tenant_invitation: 'Cancelled invitation',
  grant_platform_admin: 'Granted platform admin',
  revoke_platform_admin: 'Removed platform admin',
};

/** Read-only log of every platform-admin action, for internal accountability. */
export function AdminActivityPanel() {
  const { actions, isLoadingActions } = useAdminOps();
  const { page, setPage, pageCount, pageItems, total, pageSize } = usePagination(actions, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Admin activity</CardTitle>
        <CardDescription>
          Every platform-admin action, newest first. This log cannot be edited.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingActions ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : actions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No admin activity recorded yet.</p>
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
                      {new Date(a.created_at).toLocaleString()}
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
