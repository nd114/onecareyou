import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { BookOpen, FileText } from 'lucide-react';
import { AdminHeader } from '@/components/layout/AdminHeader';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import handbookIndex from '../../docs/handbook/README.md?raw';
import patientGuide from '../../docs/handbook/patient-guide.md?raw';
import clinicianGuide from '../../docs/handbook/clinician-guide.md?raw';
import adminGuide from '../../docs/handbook/admin-guide.md?raw';
import dataModel from '../../docs/handbook/data-model.md?raw';
import runbook from '../../docs/handbook/operations-runbook.md?raw';
import platformDoc from '../../docs/platform-documentation.md?raw';
import roadmap from '../../docs/roadmap.md?raw';

interface Doc {
  id: string;
  title: string;
  blurb: string;
  content: string;
}

const DOCS: Doc[] = [
  { id: 'overview', title: 'Handbook overview', blurb: 'What exists and who it is for', content: handbookIndex },
  { id: 'patient', title: 'Patient guide', blurb: 'Every patient-facing feature', content: patientGuide },
  { id: 'clinician', title: 'Clinician guide', blurb: 'Clinician and practice workflows', content: clinicianGuide },
  { id: 'admin', title: 'Admin guide', blurb: 'Console, tenants, invitations, careers', content: adminGuide },
  { id: 'data', title: 'Data model & access', blurb: 'Tables, RLS helpers, storage accounting', content: dataModel },
  { id: 'runbook', title: 'Operations runbook', blurb: 'Deploys, incidents, failure modes', content: runbook },
  { id: 'architecture', title: 'Architecture reference', blurb: 'Stack, domains, sources of truth', content: platformDoc },
  { id: 'roadmap', title: 'Roadmap', blurb: 'Shipped, in flight, next, deferred', content: roadmap },
];

export default function AdminDocs() {
  const [activeId, setActiveId] = useState(DOCS[0].id);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return DOCS.filter(
      (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q),
    );
  }, [query]);

  const active = DOCS.find((d) => d.id === activeId) ?? DOCS[0];
  const listed = results ?? DOCS;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>OneCare Documentation (internal)</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <AdminHeader />

      <main className="container max-w-screen-2xl py-8 px-4">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <BookOpen className="h-4 w-4" />
            Internal · not publicly accessible
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            The OneCare handbook: how the platform works, how each surface is used, and what to do
            when something breaks. Kept in the repository under <code>docs/</code> and rendered here.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the handbook"
              aria-label="Search documentation"
            />
            <nav className="space-y-1">
              {listed.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setActiveId(doc.id)}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2 transition-colors',
                    doc.id === active.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-foreground',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    {doc.title}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{doc.blurb}</span>
                </button>
              ))}
              {listed.length === 0 && (
                <p className="text-sm text-muted-foreground px-3 py-2">No documents match.</p>
              )}
            </nav>
          </aside>

          <Card>
            <CardContent className="p-6 sm:p-8">
              <MarkdownMessage
                content={active.content}
                className="text-[15px] [&_h1]:text-2xl [&_h1]:mt-0 [&_h1]:mb-4 [&_h2]:text-lg [&_h2]:mt-8 [&_h3]:text-base [&_h3]:mt-5 [&_table]:text-sm [&_table]:w-full"
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
