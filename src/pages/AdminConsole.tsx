import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  FileText,
  HardDrive,
  Loader2,
  Upload,
  Users,
} from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { formatBytes } from '@/lib/storage-constants';

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

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Platform Admin" description="OneCare platform administration." noIndex />

      <div className="container px-4 py-8 max-w-6xl">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to app
          </Link>
        </Button>

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

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Tenants</CardTitle>
            <CardDescription>
              Practices and hospitals, with team size, patient connections and pooled storage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No tenants yet.</p>
            ) : (
              <div className="space-y-2">
                {tenants.map((t) => (
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
                        {t.slug ? <span className="font-mono">{t.slug}</span> : 'No hospital code'}
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
}
