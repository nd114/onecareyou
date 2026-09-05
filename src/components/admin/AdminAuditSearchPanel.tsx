import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAdminAccessLog } from '@/hooks/useAdminInsights';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';
import { formatDayTime } from '@/lib/format-date';

/** Cross-tenant, read-only search of the platform access log. */
export function AdminAuditSearchPanel() {
  const [search, setSearch] = useState('');
  const { entries, isLoading, isFetching } = useAdminAccessLog(search);
  const { page, setPage, pageCount, pageItems, total, pageSize } = usePagination(entries, 15);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle className="text-base">Access log search</CardTitle>
          <CardDescription>
            Who opened which record, across every tenant. Read-only, newest first, capped at 200
            results per search.
          </CardDescription>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by action, clinician email or patient email"
            className="pl-9"
            aria-label="Search the access log"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || (isFetching && entries.length === 0) ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {search.trim() ? 'No access entries match that search.' : 'No access entries recorded yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {pageItems.map((e) => (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">
                      {e.action.replace(/_/g, ' ')}
                      {e.resource_type ? ` · ${e.resource_type}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {e.actor_email ?? 'Unknown actor'}
                      {e.target_email ? ` → ${e.target_email}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDayTime(e.created_at)}
                  </span>
                </div>
              </div>
            ))}
            <AdminPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              label="entries"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
