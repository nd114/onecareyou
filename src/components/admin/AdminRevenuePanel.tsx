import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  HardDrive,
  Loader2,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminPagination, usePagination } from '@/components/admin/AdminPagination';
import { useAdminRevenue, type RevenueTenant } from '@/hooks/useAdminRevenue';
import { formatBytes } from '@/lib/storage-constants';
import { formatDay } from '@/lib/format-date';

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const minorToMoney = (minor: number, currency = 'USD') =>
  (minor / 100).toLocaleString(undefined, { style: 'currency', currency });

/** Revenue — who is paying, who is about to stop, and what is owed. */
export function AdminRevenuePanel() {
  const { overview, tenants, recurring, isLoading, extendTrial, isExtending } = useAdminRevenue();
  const [extending, setExtending] = useState<RevenueTenant | null>(null);
  const [days, setDays] = useState('14');

  const { page, setPage, pageCount, pageItems, total, pageSize } = usePagination(tenants, 10);

  const confirmExtend = () => {
    if (!extending) return;
    const parsed = Number(days);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    extendTrial(
      { practiceId: extending.id, days: Math.round(parsed) },
      { onSuccess: () => setExtending(null) },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Monthly run rate
          </CardTitle>
          <CardDescription>
            Subscriptions currently running, priced from the published plans. Not a forecast — it
            is what bills again this month if nobody moves.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ['Total', money(recurring.total), 'across all three'],
              [
                'Tenants',
                money(recurring.tenantMonthly),
                `${recurring.payingTenants} paying`,
              ],
              [
                'Clinicians',
                money(recurring.clinicianMonthly),
                `${recurring.payingClinicians} paying`,
              ],
              [
                'Patients',
                money(recurring.patientMonthly),
                `${recurring.payingPatients} on premium`,
              ],
            ].map(([label, value, hint]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-0.5 tabular-nums tracking-tight">{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t leading-relaxed">
            Every plan counts at its monthly rate. No billing interval is stored, so anyone on an
            annual plan — two months free — counts about a sixth high here. Stripe holds the exact
            figure.
          </p>

          {recurring.unpricedTiers.length > 0 && (
            <p className="text-xs text-destructive mt-4 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
              <span>
                Accounts are on {recurring.unpricedTiers.join(', ')}, which the published plans
                have no price for. They count as nothing above, so the total is short.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Trials and lapses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Tenants on trial" value={overview?.trials.tenants ?? 0} />
            <Row label="Clinicians on trial" value={overview?.trials.clinicians ?? 0} />
            <Row
              label="Lapsing within 7 days"
              value={overview?.trials.lapsing_within_7_days ?? 0}
              warn={(overview?.trials.lapsing_within_7_days ?? 0) > 0}
            />
            <Row
              label="Already lapsed"
              value={overview?.trials.already_lapsed ?? 0}
              warn={(overview?.trials.already_lapsed ?? 0) > 0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Invoices
            </CardTitle>
            <CardDescription className="text-xs">
              Raised by practices to their patients. OneCare's share is the platform fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Unpaid" value={overview?.invoices.unpaid_count ?? 0} />
            <Row
              label="Outstanding"
              value={minorToMoney(overview?.invoices.unpaid_minor ?? 0)}
            />
            <Row
              label="Overdue"
              value={overview?.invoices.overdue_count ?? 0}
              warn={(overview?.invoices.overdue_count ?? 0) > 0}
            />
            <Row
              label="Platform fee collected"
              value={minorToMoney(overview?.invoices.platform_fee_minor ?? 0)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              Storage and share
            </CardTitle>
            <CardDescription className="text-xs">
              Storage sells as an allowance per plan; packs are not a product yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Allowance sold" value={`${overview?.storage.allowance_gb ?? 0} GB`} />
            <Row label="In use" value={formatBytes(overview?.storage.used_bytes ?? 0)} />
            <Row
              label="Tenants over 75%"
              value={overview?.storage.tenants_over_75_pct ?? 0}
              warn={(overview?.storage.tenants_over_75_pct ?? 0) > 0}
            />
            <Row
              label="Revenue share agreed"
              value={`${overview?.revenue_share.tenant_count ?? 0} tenants`}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Tenant billing
          </CardTitle>
          <CardDescription>
            Every tenant, the plan it is on and how much runway is left. Enterprise first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No tenants yet.</p>
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
                        <Badge variant="outline" className="capitalize">
                          {t.subscription_tier}
                        </Badge>
                        {!t.is_active && <Badge variant="destructive">Suspended</Badge>}
                        {t.subscription_status !== 'active' && (
                          <Badge variant="secondary" className="capitalize">
                            {t.subscription_status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.member_count} members · {t.connected_patients} connected ·{' '}
                        {formatBytes(Number(t.storage_bytes))} / {t.storage_limit_gb ?? 0} GB
                        {Number(t.revenue_share_pct) > 0 && ` · ${t.revenue_share_pct}% share`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      {t.unpaid_invoice_count > 0 && (
                        <span className="text-muted-foreground">
                          {t.unpaid_invoice_count} unpaid ·{' '}
                          {minorToMoney(Number(t.unpaid_invoice_minor), t.currency)}
                        </span>
                      )}
                      <span
                        className={
                          t.days_remaining !== null && t.days_remaining < 0
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        }
                      >
                        {t.subscription_ends_at
                          ? t.days_remaining !== null && t.days_remaining < 0
                            ? `Lapsed ${formatDay(t.subscription_ends_at)}`
                            : `${t.days_remaining} days left`
                          : 'No end date'}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setExtending(t)}>
                        Extend
                      </Button>
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

      <Dialog open={!!extending} onOpenChange={(open) => !open && setExtending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend {extending?.name}</DialogTitle>
            <DialogDescription>
              Adds to whatever is left, or starts from today if the plan has already lapsed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="extend-days">Days</Label>
            <Input
              id="extend-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtending(null)}>
              Cancel
            </Button>
            <Button onClick={confirmExtend} disabled={isExtending}>
              {isExtending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${warn ? 'text-destructive' : ''}`}>
        {warn && <AlertTriangle className="h-3 w-3 inline mr-1" />}
        {value}
      </span>
    </div>
  );
}
