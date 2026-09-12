import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { formatBytes } from '@/lib/storage-constants';
import { CreateTenantDialog } from '@/components/admin/CreateTenantDialog';
import { AdminTenantRowActions } from '@/components/admin/AdminTenantRowActions';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';

/** Every practice and hospital on the platform. Organisations browse freely. */
export function AdminTenantsCard() {
  const { tenants, isLoading } = useAdminTenants();
  const [search, setSearch] = useState('');

  const filtered = tenants.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.name, t.slug, t.city, t.country].some((v) => v?.toLowerCase().includes(q));
  });

  const { page, setPage, pageCount, pageItems, total, pageSize } = usePagination(filtered, 10);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">Tenants</CardTitle>
            <CardDescription>
              Practices and hospitals, with team size, patient connections and pooled storage.
            </CardDescription>
          </div>
          <CreateTenantDialog />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code or location"
            className="pl-9"
            aria-label="Search tenants"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {tenants.length === 0 ? 'No tenants yet.' : 'No tenants match that search.'}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {pageItems.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/admin/tenants/${t.id}`}
                        className="font-medium text-sm truncate hover:underline"
                      >
                        {t.name}
                      </Link>
                      <Badge variant="secondary" className="capitalize">
                        {t.tenant_type ?? 'practice'}
                      </Badge>
                      {t.subscription_tier && (
                        <Badge variant="outline" className="capitalize">
                          {t.subscription_tier}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.slug ? <span className="font-mono">{t.slug}</span> : 'No hospital code'}
                      {' · '}
                      {[t.city, t.country].filter(Boolean).join(', ') || 'Location not set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span className="tabular-nums">{t.member_count} members</span>
                    <span className="tabular-nums">{t.active_share_count} connected</span>
                    <span className="tabular-nums">
                      {formatBytes(Number(t.storage_bytes))} / {t.storage_limit_gb ?? 0} GB
                    </span>
                    {Number(t.revenue_share_pct) > 0 && (
                      <span className="tabular-nums">{Number(t.revenue_share_pct)}% share</span>
                    )}
                    <AdminTenantRowActions tenant={t} />
                  </div>
                </div>
              ))}
            </div>
            <AdminPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              label="tenants"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
