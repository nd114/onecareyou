import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  FileText,
  HardDrive,
  Loader2,
  Search,
  Upload,
  Users,
} from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { formatBytes } from '@/lib/storage-constants';
import { CreateTenantDialog } from '@/components/admin/CreateTenantDialog';
import { AdminTenantRowActions } from '@/components/admin/AdminTenantRowActions';
import { AdminAccessPanel } from '@/components/admin/AdminAccessPanel';
import { AdminActivityPanel } from '@/components/admin/AdminActivityPanel';
import { AdminHeader } from '@/components/layout/AdminHeader';

const TOOLS = [
  {
    to: '/admin/careers',
    title: 'Careers',
    description: 'Post openings, review applications and track candidates.',
    icon: Briefcase,
  },
  {
    to: '/admin/import',
    title: 'Data import',
    description: 'Internal import utilities.',
    icon: Upload,
  },
  {
    to: '/admin/changelog',
    title: 'Changelog',
    description: 'Publish release notes.',
    icon: FileText,
  },
];

export default function AdminConsole() {
  const { tenants, totals, isLoading } = useAdminTenants();
  const [search, setSearch] = useState('');

  const filtered = tenants.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.name, t.slug, t.city, t.country].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Platform Admin" description="OneCare platform administration." noIndex />

      <AdminHeader />

      <div className="container px-4 py-8 max-w-6xl">

        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">Platform admin</h1>
          <p className="text-muted-foreground mt-1">
            Oversight across every practice and hospital on OneCare.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Tenants', value: String(totals.tenants), icon: Building2 },
            { label: 'Hospitals', value: String(totals.hospitals), icon: Building2 },
            { label: 'Team members', value: String(totals.members), icon: Users },
            {
              label: 'Storage used',
              value: formatBytes(totals.storageBytes),
              icon: HardDrive,
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

        <Tabs defaultValue="tenants">
          <TabsList className="mb-6">
            <TabsTrigger value="tenants">Tenants</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="tenants">
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Tenants</CardTitle>
                    <CardDescription>
                      Practices and hospitals, with team size, patient connections and pooled
                      storage.
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
                            <p className="font-medium text-sm truncate">{t.name}</p>
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
                            {t.slug ? (
                              <span className="font-mono">{t.slug}</span>
                            ) : (
                              'No hospital code'
                            )}
                            {' · '}
                            {[t.city, t.country].filter(Boolean).join(', ') || 'Location not set'}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                          <span>{t.member_count} members</span>
                          <span>{t.active_share_count} connected</span>
                          <span>
                            {formatBytes(Number(t.storage_bytes))} / {t.storage_limit_gb ?? 0} GB
                          </span>
                          {Number(t.revenue_share_pct) > 0 && (
                            <span>{Number(t.revenue_share_pct)}% share</span>
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
          </TabsContent>

          <TabsContent value="access">
            <AdminAccessPanel />
          </TabsContent>

          <TabsContent value="activity">
            <AdminActivityPanel />
          </TabsContent>

          <TabsContent value="tools">
            <div className="grid gap-4 sm:grid-cols-3">
              {TOOLS.map(({ to, title, description, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Icon className="h-4 w-4 text-primary" />
                    {title}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{description}</p>
                </Link>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
