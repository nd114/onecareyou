import { SEOHead } from '@/components/seo/SEOHead';
import { NDA_SECTIONS, NDA_TITLE, NDA_VERSION } from '@/lib/beta-nda';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function NdaBody() {
  return (
    <div className="space-y-6">
      {NDA_SECTIONS.map((section) => (
        <section key={section.heading}>
          <h3 className="font-serif-display text-lg font-bold text-primary mb-2">
            {section.heading}
          </h3>
          {section.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-foreground/75 leading-relaxed mb-2">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function BetaNDA() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Beta Programme NDA"
        description="The mutual non-disclosure agreement signed by OneCare beta testers."
        noIndex
      />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          to="/beta"
          className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-primary mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the beta programme
        </Link>
        <span className="eyebrow text-[hsl(var(--gold))]">Version {NDA_VERSION}</span>
        <h1 className="font-serif-display text-3xl lg:text-4xl font-bold text-primary mt-3 mb-8">
          {NDA_TITLE}
        </h1>
        <NdaBody />
        <p className="text-xs text-foreground/50 mt-10">
          Questions about this agreement: legal@onecare.you
        </p>
      </div>
    </div>
  );
}
