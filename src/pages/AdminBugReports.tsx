import { SEOHead } from '@/components/seo/SEOHead';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminBugReportsPanel } from '@/components/admin/AdminBugReportsPanel';

export default function AdminBugReports() {
  return (
    <AdminShell
      title="Bug reports"
      description="What beta testers filed, who filed it, and whether it's still open."
    >
      <SEOHead title="Bug reports — Platform Admin" description="Bug reports." noIndex />
      <AdminBugReportsPanel />
    </AdminShell>
  );
}
