import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Search, X } from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SEOHead } from '@/components/seo/SEOHead';
import { DocArticle } from '@/components/docs/DocArticle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DOCS,
  DOC_GROUPS,
  docHeadings,
  docNeighbours,
  findDoc,
  searchDocs,
} from '@/lib/docs';

/**
 * Documentation, rather than one long page with a section switcher.
 *
 * Three things make the difference: every page has its own address (so it can
 * be linked, indexed and shared), every heading has its own anchor with an
 * outline beside it, and search reads the body instead of the titles. The
 * content is still the markdown in `docs/guide` — one copy, read at build
 * time — so nothing here can say something the repository does not.
 */
export default function Docs() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const doc = findDoc(slug);
  const [query, setQuery] = useState('');
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  const headings = useMemo(() => docHeadings(doc.content), [doc.content]);
  const hits = useMemo(() => searchDocs(query), [query]);
  const { previous, next } = docNeighbours(doc.slug);
  const group = DOC_GROUPS.find((g) => g.id === doc.group);

  // A slug that does not exist should not silently show page one under the
  // wrong address — send it to the page that was actually resolved.
  useEffect(() => {
    if (slug && slug !== doc.slug) navigate(`/docs/${doc.slug}`, { replace: true });
  }, [slug, doc.slug, navigate]);

  // Reading position, for the outline. Highlighting the wrong heading is worse
  // than highlighting none, so this only tracks headings actually in view.
  useEffect(() => {
    const container = articleRef.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll('h2[id], h3[id]'));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveHeading(visible.target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [doc.slug]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [doc.slug]);

  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead
        title={`${doc.title} — OneCare documentation`}
        description={doc.blurb}
        canonical={`/docs/${doc.slug}`}
      />
      <Header />

      <main className="flex-1 container px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_200px]">
          {/* Sidebar: search + grouped contents */}
          <div className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <BookOpen className="h-3.5 w-3.5" />
              Documentation
            </div>

            <div className="relative mb-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the docs…"
                className="pl-9 pr-9"
                aria-label="Search the documentation"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {query.trim().length >= 2 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {hits.length === 0
                    ? 'No matches'
                    : `${hits.length} ${hits.length === 1 ? 'page' : 'pages'}`}
                </p>
                <ul className="space-y-2">
                  {hits.map(({ doc: hit, snippet }) => (
                    <li key={hit.slug}>
                      <Link
                        to={`/docs/${hit.slug}`}
                        onClick={() => setQuery('')}
                        className="block rounded-lg border border-border/60 p-3 hover:border-primary/50 hover:bg-muted/50"
                      >
                        <span className="block text-sm font-medium">{hit.title}</span>
                        <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                          {snippet}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {hits.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      Nothing here matches that.{' '}
                      <Link to="/contact" className="underline underline-offset-4">
                        Ask us directly
                      </Link>
                      .
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <nav aria-label="Documentation contents" className="space-y-6">
                {DOC_GROUPS.map((g) => {
                  const pages = DOCS.filter((d) => d.group === g.id);
                  if (pages.length === 0) return null;
                  return (
                    <div key={g.id}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {g.label}
                      </p>
                      <ul className="space-y-0.5 border-l border-border">
                        {pages.map((page) => (
                          <li key={page.slug}>
                            <Link
                              to={`/docs/${page.slug}`}
                              aria-current={page.slug === doc.slug ? 'page' : undefined}
                              className={cn(
                                '-ml-px block border-l-2 px-3 py-1.5 text-sm transition-colors',
                                page.slug === doc.slug
                                  ? 'border-primary font-medium text-primary'
                                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                              )}
                            >
                              {page.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Article */}
          <motion.div
            key={doc.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="min-w-0"
          >
            <nav
              aria-label="Breadcrumb"
              className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Link to="/docs" className="hover:text-foreground">
                Docs
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span>{group?.label}</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">{doc.title}</span>
            </nav>

            <div ref={articleRef}>
              <DocArticle content={doc.content} />
            </div>

            {/* Outline on small screens, where the right rail is not shown */}
            {headings.length > 1 && (
              <details className="mt-10 rounded-lg border border-border/60 p-4 xl:hidden">
                <summary className="cursor-pointer text-sm font-medium">On this page</summary>
                <ul className="mt-3 space-y-2">
                  {headings.map((h) => (
                    <li key={h.id} className={h.depth === 3 ? 'pl-4' : undefined}>
                      <a
                        href={`#${h.id}`}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-10 rounded-xl border border-border/60 bg-muted/30 p-5 text-sm">
              <p className="font-medium">Still stuck?</p>
              <p className="mt-1 text-muted-foreground">
                You can always{' '}
                <Link to="/contact" className="underline underline-offset-4">
                  get in touch
                </Link>{' '}
                and we will point you the right way.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {previous ? (
                <Button variant="outline" asChild className="h-auto justify-start py-3">
                  <Link to={`/docs/${previous.slug}`}>
                    <ArrowLeft className="mr-3 h-4 w-4 shrink-0" />
                    <span className="text-left">
                      <span className="block text-xs text-muted-foreground">Previous</span>
                      <span className="block text-sm font-medium">{previous.title}</span>
                    </span>
                  </Link>
                </Button>
              ) : (
                <span className="hidden sm:block" />
              )}
              {next && (
                <Button variant="outline" asChild className="h-auto justify-end py-3 sm:col-start-2">
                  <Link to={`/docs/${next.slug}`}>
                    <span className="text-right">
                      <span className="block text-xs text-muted-foreground">Next</span>
                      <span className="block text-sm font-medium">{next.title}</span>
                    </span>
                    <ArrowRight className="ml-3 h-4 w-4 shrink-0" />
                  </Link>
                </Button>
              )}
            </div>
          </motion.div>

          {/* Outline rail */}
          <aside className="hidden xl:block">
            {headings.length > 1 && (
              <div className="sticky top-24">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  On this page
                </p>
                <ul className="space-y-1.5 border-l border-border">
                  {headings.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        className={cn(
                          '-ml-px block border-l-2 py-0.5 text-xs transition-colors',
                          h.depth === 3 ? 'pl-6' : 'pl-3',
                          activeHeading === h.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
