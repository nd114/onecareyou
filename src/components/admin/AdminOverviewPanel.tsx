import { AlertTriangle, HardDrive, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { formatBytes } from '@/lib/storage-constants';
import { AdminSignupsPanel } from '@/components/admin/AdminSignupsPanel';

const GB = 1024 ** 3;

/** Console overview: tenants approaching their storage allowance, plus the newest accounts. */
export function AdminOverviewPanel() {
  const { tenants, isLoading } = useAdminTenants();

  const storageRows = tenants
    .map((t) => {
      const limitBytes = Number(t.storage_limit_gb ?? 0) * GB;
      const used = Number(t.storage_bytes ?? 0);
      const pct = limitBytes > 0 ? Math.min(100, (used / limitBytes) * 100) : 0;
      return { ...t, used, limitBytes, pct };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  const nearing = storageRows.filter((r) => r.pct >= 75).length;

  const all = tenants;
  const hospitals = all.filter((t) => t.tenant_type === 'hospital').length;
  const branded = all.filter((t) => !!t.slug).length;
  const connectedPatients = all.reduce((sum, t) => sum + Number(t.active_share_count ?? 0), 0);
  const emptyTenants = all.filter((t) => Number(t.member_count ?? 0) === 0).length;
  const revenueShared = all.filter((t) => Number(t.revenue_share_pct ?? 0) > 0).length;
  const trials = all.filter((t) => (t.subscription_tier ?? 'trial') === 'trial').length;

  const signals: Array<[string, string, string]> = [
    ['Hospitals', String(hospitals), `${all.length - hospitals} practices`],
    ['Own address live', String(branded), 'tenants with a hospital code'],
    ['Patients connected', String(connectedPatients), 'active consents across tenants'],
    ['Awaiting first member', String(emptyTenants), 'invited but not yet onboarded'],
    ['On trial', String(trials), 'not yet on a paid tier'],
    ['Revenue share set', String(revenueShared), 'tenants with a share agreed'],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform at a glance</CardTitle>
          <CardDescription>Where tenants stand right now.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {signals.map(([label, value, hint]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold mt-0.5">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 items-start">

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            Storage against allowance
          </CardTitle>
          <CardDescription>
            {nearing > 0
              ? `${nearing} tenant${nearing === 1 ? '' : 's'} above 75% of allowance — a good moment to offer a pack.`
              : 'No tenant is close to its allowance.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : storageRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No tenants yet.</p>
          ) : (
            <div className="space-y-4">
              {storageRows.map((r) => (
                <div key={r.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium truncate">{r.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatBytes(r.used)} / {Number(r.storage_limit_gb ?? 0)} GB
                    </span>
                  </div>
                  <Progress value={r.pct} className="h-1.5 mt-1.5" />
                  {r.pct >= 90 && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Over 90% — raise the allowance before writes start failing.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

        <AdminSignupsPanel />
      </div>
    </div>

  );
}
