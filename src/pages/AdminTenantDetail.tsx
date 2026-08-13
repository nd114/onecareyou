import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, HardDrive, Link2, Loader2, Users } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { AdminHeader } from '@/components/layout/AdminHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatBytes } from '@/lib/storage-constants';
import { useAdminTenantDetail } from '@/hooks/useAdminTenantDetail';
import { AdminTenantBrandingCard } from '@/components/admin/AdminTenantBrandingCard';

const GB = 1024 ** 3;

/** Comprehensive per-tenant profile: plan, limits, storage, team, branding and address. */
export default function AdminTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenant, isLoading, members, isLoadingMembers, setBranding, isSavingBranding } =
    useAdminTenantDetail(id);

  const limitBytes = Number(tenant?.storage_limit_gb ?? 0) * GB;
  const usedPct =
    limitBytes > 0 ? Math.min(100, (Number(tenant?.storage_bytes ?? 0) / limitBytes) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Tenant details" description="OneCare platform administration." noIndex />
      <AdminHeader />

      <div className="container px-4 py-8 max-w-5xl">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/admin">
            <ArrowLeft className="h-4 w-4 mr-2" />
            All tenants
          </Link>
        </Button>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !tenant ? (
          <p className="text-sm text-muted-foreground">
            This tenant could not be found, or you don't have access to it.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {tenant.brand_logo_url || tenant.logo_url ? (
                <img
                  src={tenant.brand_logo_url || tenant.logo_url || ''}
                  alt={`${tenant.name} logo`}
                  className="h-14 w-14 rounded-xl border object-contain p-1"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl border flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-display text-3xl font-bold tracking-tight truncate">
                  {tenant.name}
                </h1>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <Badge variant="secondary" className="capitalize">
                    {tenant.tenant_type ?? 'practice'}
                  </Badge>
                  {tenant.subscription_tier && (
                    <Badge variant="outline" className="capitalize">
                      {tenant.subscription_tier}
                    </Badge>
                  )}
                  <Badge variant={tenant.is_active === false ? 'destructive' : 'outline'}>
                    {tenant.is_active === false ? 'Deactivated' : 'Active'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {[tenant.city, tenant.country].filter(Boolean).join(', ') || 'Location not set'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Team members', value: `${tenant.member_count}`, icon: Users },
                {
                  label: 'Connected patients',
                  value: `${tenant.active_share_count}`,
                  icon: Link2,
                },
                {
                  label: 'Storage used',
                  value: formatBytes(Number(tenant.storage_bytes)),
                  icon: HardDrive,
                },
                {
                  label: 'Revenue share',
                  value: `${Number(tenant.revenue_share_pct ?? 0)}%`,
                  icon: Building2,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Icon className="h-4 w-4" />
                    {label}
                  </div>
                  <div className="text-2xl font-semibold mt-1">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Plan and limits</CardTitle>
                  <CardDescription>What we've set for this tenant.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Storage allowance</span>
                      <span>
                        {formatBytes(Number(tenant.storage_bytes))} /{' '}
                        {Number(tenant.storage_limit_gb ?? 0)} GB
                      </span>
                    </div>
                    <Progress value={usedPct} className="h-1.5" />
                  </div>
                  {[
                    ['Hospital code', tenant.slug ?? 'Not set'],
                    [
                      'Sign-up address',
                      tenant.slug ? `${tenant.slug}.onecare.you` : 'Available once a code is set',
                    ],
                    ['Patient limit', tenant.patient_limit ?? 'Not set'],
                    ['Team limit', tenant.member_limit ?? 'Not set'],
                    ['Subscription status', tenant.subscription_status ?? 'Not set'],
                    [
                      'Renews / ends',
                      tenant.subscription_ends_at
                        ? new Date(tenant.subscription_ends_at).toLocaleDateString()
                        : '—',
                    ],
                    ['Created', new Date(tenant.created_at).toLocaleDateString()],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-right break-all">{String(value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact and address</CardTitle>
                  <CardDescription>As entered by the tenant.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    ['Email', tenant.email ?? '—'],
                    ['Phone', tenant.phone ?? '—'],
                    ['Address', tenant.address ?? '—'],
                    ['State / region', tenant.state ?? '—'],
                    ['Postcode', tenant.zip_code ?? '—'],
                    ['NPI', tenant.npi ?? '—'],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-right break-all">{String(value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <AdminTenantBrandingCard
              tenant={tenant}
              onSave={setBranding}
              isSaving={isSavingBranding}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Team</CardTitle>
                <CardDescription>Everyone attached to this tenant.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingMembers ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No members yet.</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.name || m.email || 'Member'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="capitalize">
                            {m.role}
                          </Badge>
                          {m.status && m.status !== 'active' && (
                            <Badge variant="outline" className="capitalize">
                              {m.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
