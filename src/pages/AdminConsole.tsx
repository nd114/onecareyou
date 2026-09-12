import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Briefcase, FileText, Upload } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AdminShell } from '@/components/admin/AdminShell';
import type { AdminRange } from '@/hooks/useAdminToday';
import { AdminOverviewPanel } from '@/components/admin/AdminOverviewPanel';
import { AdminAccountsPanel } from '@/components/admin/AdminAccountsPanel';
import { AdminTenantsCard } from '@/components/admin/AdminTenantsCard';
import { AdminAccessPanel } from '@/components/admin/AdminAccessPanel';
import { AdminRevenuePanel } from '@/components/admin/AdminRevenuePanel';
import { AdminReliabilityPanel } from '@/components/admin/AdminReliabilityPanel';
import { AdminTrustPanel } from '@/components/admin/AdminTrustPanel';
import { AdminDemoDataCard } from '@/components/admin/AdminDemoDataCard';

/**
 * The six areas were tabs on one page while there were six of them. With the
 * rail they are routes, which is what the plan asked for: each area is
 * linkable, and the browser's back button means what it says.
 */

/** Tabs shipped first, so ?tab= links are still out there. Send them onward. */
const TAB_ROUTES: Record<string, string> = {
  overview: '/admin',
  accounts: '/admin/accounts',
  revenue: '/admin/revenue',
  reliability: '/admin/reliability',
  trust: '/admin/trust',
  workshop: '/admin/workshop',
  // Names from the shape before the six areas existed.
  tenants: '/admin/accounts',
  access: '/admin/accounts',
  activity: '/admin/trust',
  audit: '/admin/trust',
  tools: '/admin/workshop',
};

const RANGES: Array<{ value: AdminRange; label: string }> = [
  { value: '1', label: '24h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

export default function AdminConsole() {
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<AdminRange>('7');
  const tab = params.get('tab');
  const redirect = tab ? TAB_ROUTES[tab] : undefined;

  // Strip the parameter so a refresh does not bounce through here again.
  useEffect(() => {
    if (tab && !redirect) {
      params.delete('tab');
      setParams(params, { replace: true });
    }
  }, [tab, redirect, params, setParams]);

  if (redirect && redirect !== '/admin') return <Navigate to={redirect} replace />;

  return (
    <AdminShell
      title="Today"
      description="What changed, what needs you, and one click to act on it."
      actions={
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => v && setRange(v as AdminRange)}
          className="rounded-lg border bg-card p-0.5 mr-1"
          aria-label="Time range"
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value} className="h-7 px-2.5 text-xs">
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      <SEOHead title="Platform Admin" description="OneCare platform administration." noIndex />
      <AdminOverviewPanel range={range} />
    </AdminShell>
  );
}

export function AdminAccountsPage() {
  return (
    // No page description here: the Accounts card states the rule in full.
    <AdminShell title="Accounts">
      <SEOHead title="Accounts — Platform Admin" description="Accounts." noIndex />
      <div className="space-y-6">
        <AdminAccountsPanel />
        <AdminTenantsCard />
        <AdminAccessPanel />
      </div>
    </AdminShell>
  );
}

export function AdminRevenuePage() {
  return (
    <AdminShell title="Revenue" description="Who is paying, who is about to stop, and what is owed.">
      <SEOHead title="Revenue — Platform Admin" description="Revenue." noIndex />
      <AdminRevenuePanel />
    </AdminShell>
  );
}

export function AdminReliabilityPage() {
  return (
    <AdminShell
      title="Reliability"
      description="What broke, read from this database. Edge function and auth service logs live outside it and are not counted here."
    >
      <SEOHead title="Reliability — Platform Admin" description="Reliability." noIndex />
      <AdminReliabilityPanel />
    </AdminShell>
  );
}

export function AdminTrustPage() {
  return (
    <AdminShell
      title="Trust"
      description="Who can see whom, what was agreed, and the record of both."
    >
      <SEOHead title="Trust — Platform Admin" description="Trust." noIndex />
      <AdminTrustPanel />
    </AdminShell>
  );
}

const TOOLS = [
  {
    to: '/admin/careers',
    title: 'Careers',
    description: 'Post openings, review applications and track candidates.',
    icon: Briefcase,
  },
  {
    to: '/admin/changelog',
    title: 'Changelog',
    description: 'Publish release notes.',
    icon: FileText,
  },
  {
    to: '/admin/docs',
    title: 'Docs',
    description: 'The internal handbook: patient, clinician, admin, data model, runbook.',
    icon: BookOpen,
  },
  {
    to: '/admin/import',
    title: 'Data import',
    description: 'Internal import utilities.',
    icon: Upload,
  },
];

export function AdminWorkshopPage() {
  return (
    <AdminShell title="Workshop" description="The tools behind the platform.">
      <SEOHead title="Workshop — Platform Admin" description="Internal tools." noIndex />
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map(({ to, title, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4 text-primary" />
              <div className="mt-2.5 font-medium text-sm">{title}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </Link>
          ))}
        </div>

        <AdminDemoDataCard />
      </div>
    </AdminShell>
  );
}
