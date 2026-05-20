import { Helmet } from 'react-helmet-async';
import { CHANGELOG, type ChangelogTag } from '@/lib/changelog-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

const TAG_LABELS: Record<ChangelogTag, string> = {
  patient: 'Patient',
  clinician: 'Clinician',
  platform: 'Platform',
  security: 'Security',
  ai: 'AI',
  infrastructure: 'Infrastructure',
};

export default function AdminChangelog() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>OneCare Changelog (internal)</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="container max-w-3xl py-12 px-4">
        <div className="mb-10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Sparkles className="h-4 w-4" />
            Internal · not linked from public navigation
          </div>
          <h1 className="text-3xl font-bold tracking-tight">OneCare Changelog</h1>
          <p className="text-muted-foreground mt-2">
            A running log of platform additions and improvements. Useful for the team and for
            investor updates. Newest entries first.
          </p>
        </div>

        <div className="space-y-6">
          {CHANGELOG.map((entry, idx) => (
            <Card key={idx}>
              <CardHeader>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <CardTitle className="text-xl">{entry.title}</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {entry.date}
                    {entry.version && ` · v${entry.version}`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {TAG_LABELS[tag]}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 list-disc list-inside text-sm leading-relaxed">
                  {entry.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
