import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Search, Stethoscope } from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SEOHead } from '@/components/seo/SEOHead';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import gettingStarted from '../../docs/guide/getting-started.md?raw';
import yourRecord from '../../docs/guide/your-record.md?raw';
import sharing from '../../docs/guide/sharing.md?raw';
import assistant from '../../docs/guide/assistant.md?raw';
import notificationsPrivacy from '../../docs/guide/notifications-and-privacy.md?raw';
import forClinicians from '../../docs/guide/for-clinicians.md?raw';

/**
 * The public how-to guide.
 *
 * Distinct from /help on purpose. Help answers a question somebody arrived
 * with; this explains how a thing works before they have one. Two surfaces are
 * only worth having when they answer different questions, and these do.
 *
 * Content is the markdown in docs/guide, so the guide and the repository cannot
 * drift: there is one copy and the page reads it.
 */

interface GuideSection {
  id: string;
  title: string;
  blurb: string;
  audience: 'patient' | 'clinician';
  content: string;
}

const SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    blurb: 'Making an account, and the first four things to do',
    audience: 'patient',
    content: gettingStarted,
  },
  {
    id: 'your-record',
    title: 'Your health record',
    blurb: 'Readings, medicines, documents and recordings',
    audience: 'patient',
    content: yourRecord,
  },
  {
    id: 'sharing',
    title: 'Sharing with your care team',
    blurb: 'Who sees what, and how to stop',
    audience: 'patient',
    content: sharing,
  },
  {
    id: 'assistant',
    title: 'The assistant',
    blurb: 'What it answers, what it will not do',
    audience: 'patient',
    content: assistant,
  },
  {
    id: 'notifications-and-privacy',
    title: 'Notifications and privacy',
    blurb: 'What you hear about, and who has looked',
    audience: 'patient',
    content: notificationsPrivacy,
  },
  {
    id: 'for-clinicians',
    title: 'For clinicians',
    blurb: 'Access, the chart, dictation and corrections',
    audience: 'clinician',
    content: forClinicians,
  },
];

export default function Guide() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const activeId = params.get('section') ?? SECTIONS[0].id;
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.blurb.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead
        title="Guide"
        description="How OneCare works: your health record, sharing with clinicians, the assistant, notifications and privacy."
        canonical="/guide"
      />
      <Header />

      <main className="flex-1 container px-4 sm:px-6 py-10 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mb-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary mb-4">
            <BookOpen className="h-4 w-4" />
            Guide
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold">How OneCare works</h1>
          <p className="text-muted-foreground mt-3">
            Written for the person using it. If something here does not answer your
            question,{' '}
            <a href="/contact" className="underline underline-offset-4">
              get in touch
            </a>
            .
          </p>

        </motion.div>

        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide…"
            className="pl-9"
            aria-label="Search the guide"
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          {/* Contents. A list on a phone, a rail on a wide screen — the guide
              is read top to bottom on a phone and jumped around on a laptop. */}
          <nav aria-label="Guide sections" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="space-y-1">
              {matches.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ section: section.id })}
                    aria-current={section.id === active.id ? 'page' : undefined}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left transition-colors',
                      section.id === active.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {section.audience === 'clinician' && (
                        <Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                      {section.title}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {section.blurb}
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  Nothing in the guide matches that. Try the help centre.
                </li>
              )}
            </ul>
          </nav>

          <article className="min-w-0 max-w-3xl">
            <MarkdownMessage content={active.content} />
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
