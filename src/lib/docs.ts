import gettingStarted from '../../docs/guide/getting-started.md?raw';
import yourRecord from '../../docs/guide/your-record.md?raw';
import sharing from '../../docs/guide/sharing.md?raw';
import assistant from '../../docs/guide/assistant.md?raw';
import notificationsPrivacy from '../../docs/guide/notifications-and-privacy.md?raw';
import forClinicians from '../../docs/guide/for-clinicians.md?raw';

/**
 * The documentation set.
 *
 * The markdown in `docs/guide` is the only copy: the site reads the same files
 * the repository ships, so documentation cannot drift from what was written.
 * Everything a documentation site needs beyond that — an ordered set of pages
 * with their own addresses, a heading outline per page, and search over the
 * body rather than the title — is derived here rather than hand-maintained.
 */

export type DocGroupId = 'start' | 'record' | 'privacy' | 'clinicians';

export interface DocPage {
  slug: string;
  title: string;
  blurb: string;
  group: DocGroupId;
  content: string;
}

export const DOC_GROUPS: { id: DocGroupId; label: string }[] = [
  { id: 'start', label: 'Getting started' },
  { id: 'record', label: 'Your record' },
  { id: 'privacy', label: 'Privacy and control' },
  { id: 'clinicians', label: 'For clinicians' },
];

export const DOCS: DocPage[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    blurb: 'Making an account, and the first four things to do',
    group: 'start',
    content: gettingStarted,
  },
  {
    slug: 'your-record',
    title: 'Your health record',
    blurb: 'Readings, medicines, documents and recordings',
    group: 'record',
    content: yourRecord,
  },
  {
    slug: 'assistant',
    title: 'The assistant',
    blurb: 'What it answers, and what it will not do',
    group: 'record',
    content: assistant,
  },
  {
    slug: 'sharing',
    title: 'Sharing with your care team',
    blurb: 'Who sees what, and how to stop',
    group: 'privacy',
    content: sharing,
  },
  {
    slug: 'notifications-and-privacy',
    title: 'Notifications and privacy',
    blurb: 'What you hear about, and who has looked',
    group: 'privacy',
    content: notificationsPrivacy,
  },
  {
    slug: 'for-clinicians',
    title: 'Clinician workflows',
    blurb: 'Access, the chart, dictation and corrections',
    group: 'clinicians',
    content: forClinicians,
  },
];

export const DEFAULT_DOC_SLUG = DOCS[0].slug;

export function findDoc(slug: string | undefined): DocPage {
  return DOCS.find((d) => d.slug === slug) ?? DOCS[0];
}

/** Neighbours in reading order, so a page is never a dead end. */
export function docNeighbours(slug: string) {
  const i = DOCS.findIndex((d) => d.slug === slug);
  return {
    previous: i > 0 ? DOCS[i - 1] : null,
    next: i >= 0 && i < DOCS.length - 1 ? DOCS[i + 1] : null,
  };
}

/**
 * Heading ids are derived the same way here and in the renderer, so an
 * outline link and the heading it points at always agree.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export interface DocHeading {
  id: string;
  text: string;
  depth: 2 | 3;
}

export function docHeadings(content: string): DocHeading[] {
  const headings: DocHeading[] = [];
  let inFence = false;
  for (const line of content.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{2,3})\s+(.*)$/.exec(line.trim());
    if (!match) continue;
    const text = match[2].replace(/[*_`]/g, '').trim();
    headings.push({ id: slugifyHeading(text), text, depth: match[1].length === 2 ? 2 : 3 });
  }
  return headings;
}

export interface DocSearchHit {
  doc: DocPage;
  /** A line from the body around the match, for context in the results. */
  snippet: string;
}

/**
 * Search reads the body, not just the titles — the question a person types
 * ("who can see my glucose") is almost never a heading.
 */
export function searchDocs(query: string): DocSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const hits: DocSearchHit[] = [];
  for (const doc of DOCS) {
    const haystack = `${doc.title} ${doc.blurb}`.toLowerCase();
    const lines = doc.content.split('\n');
    const line = lines.find(
      (l) => l.toLowerCase().includes(q) && l.trim().length > 0 && !l.trim().startsWith('#'),
    );

    if (line) {
      hits.push({ doc, snippet: trimSnippet(line, q) });
    } else if (haystack.includes(q)) {
      hits.push({ doc, snippet: doc.blurb });
    }
  }
  return hits;
}

function trimSnippet(line: string, query: string): string {
  const clean = line.replace(/[*_`>]/g, '').replace(/^\s*[-\d.]+\s*/, '').trim();
  const at = clean.toLowerCase().indexOf(query);
  if (at < 0 || clean.length <= 160) return clean;
  const start = Math.max(0, at - 60);
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + 160).trim()}…`;
}
