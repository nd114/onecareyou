import { useMemo, useState } from 'react';
import { Briefcase, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminHeader } from '@/components/layout/AdminHeader';
import { SEOHead } from '@/components/seo/SEOHead';
import { AdminApplications } from '@/components/admin/AdminApplications';
import { AdminJobs } from '@/components/admin/AdminJobs';
import { useJobApplications } from '@/hooks/useJobApplications';
import { useAllJobs } from '@/hooks/useJobPostings';

export default function AdminCareers() {
  const [tab, setTab] = useState('applications');
  const { data: applications } = useJobApplications();
  const { data: jobs } = useAllJobs();

  const stats = useMemo(() => {
    const list = (applications ?? []).filter((a) => !a.archived_at);
    return {
      total: list.length,
      pending: list.filter((a) => a.status === 'pending').length,
      published: (jobs ?? []).filter((j) => j.is_published).length,
    };
  }, [applications, jobs]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Careers Admin" description="Manage job postings and applications." noIndex />

      <AdminHeader />

      <div className="container px-4 py-8 max-w-6xl">

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Careers admin</h1>
          <p className="text-muted-foreground mt-1">
            Post openings, review applications, and track candidate status.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Applications', value: stats.total, icon: Users },
            { label: 'Awaiting review', value: stats.pending, icon: Users },
            { label: 'Live openings', value: stats.published, icon: Briefcase },
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

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="jobs">Job postings</TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="mt-6">
            <AdminApplications />
          </TabsContent>

          <TabsContent value="jobs" className="mt-6">
            <AdminJobs />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
