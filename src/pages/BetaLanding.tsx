import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
  Tag,
  Users,
} from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { BRAND } from '@/lib/brand-constants';
import { BETA } from '@/lib/beta-config';
import { trackBetaEvent } from '@/lib/beta-analytics';

const benefits = [
  {
    icon: Stethoscope,
    title: 'Early access to the full platform',
    body: 'Use OneCare with your own workflow before public launch — patient panels, triage inbox, encounters, guidance and secure messaging.',
  },
  {
    icon: Tag,
    title: `${BETA.discountMonths} months at a discount`,
    body: `If you adopt OneCare into your practice during or just after the beta, your first ${BETA.discountMonths} months come at a founding-clinician rate.`,
  },
  {
    icon: Users,
    title: 'Direct line to the build team',
    body: 'A small WhatsApp community of doctors, nurses, GPs and specialists shaping what gets built next — your feedback goes straight into the roadmap.',
  },
  {
    icon: ShieldCheck,
    title: 'Private by default',
    body: 'Evaluate with test data. AES-256 at rest, TLS in transit, per-user access rules, and a mutual NDA signed before your onboarding call.',
  },
];

const steps = [
  { n: '01', label: 'Join the WhatsApp community' },
  { n: '02', label: 'Book your onboarding call' },
  { n: '03', label: 'Sign the mutual NDA' },
  { n: '04', label: 'Get your beta access' },
];

export default function BetaLanding() {
  const handleWhatsAppClick = () => {
    void trackBetaEvent('beta_whatsapp_cta_click', { destination: 'whatsapp' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Join the clinician beta"
        description={`${BRAND.name} is in beta with doctors, nurses, GPs and specialists. Join the beta community, book an onboarding call and get a founding-clinician discount.`}
        canonical="/beta"
      />

      {/* Minimal brand bar */}
      <header className="border-b border-primary/10">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-serif-display text-xl font-bold text-primary">
            {BRAND.name}
          </Link>
          <span className="eyebrow text-foreground/50">Clinician beta</span>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-3xl px-6 pt-12 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px w-8 bg-[hsl(var(--gold))]" aria-hidden />
          <span className="eyebrow text-[hsl(var(--gold))]">
            Invitation · Limited beta cohort
          </span>
        </div>

        <h1 className="font-serif-display text-4xl sm:text-5xl font-bold text-primary leading-[1.05] tracking-tight">
          Help shape the record
          <br />
          your patients and you
          <br />
          <span className="text-[hsl(var(--gold))]">both write.</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-foreground/75 leading-relaxed max-w-xl">
          {BRAND.name} is a shared health record for clinicians and the people they
          care for — vitals, medications and follow-up in one place between visits.
          We're inviting a small group of doctors, nurses, GPs and specialists to
          test it inside real workflows before launch.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <a
            href={BETA.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppClick}
            data-analytics-id="beta-whatsapp-cta"
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-4 text-sm font-semibold tracking-wide hover:bg-[hsl(var(--emerald-mid))] transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Join the Beta Community
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link
            to="/beta/book"
            onClick={() => void trackBetaEvent('beta_book_cta_click')}
            className="inline-flex items-center justify-center gap-2 px-6 py-4 text-sm font-semibold tracking-wide border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <CalendarCheck className="h-4 w-4" />
            Book an onboarding call
          </Link>
        </div>

        <p className="mt-4 text-xs text-foreground/55">
          No cost to take part. {BETA.callLengthMinutes}-minute onboarding call. A
          mutual NDA is signed before access is granted.
        </p>
      </section>

      {/* WHAT TESTERS GET */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px w-8 bg-[hsl(var(--gold))]" aria-hidden />
          <span className="eyebrow text-[hsl(var(--gold))]">What beta testers get</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 border border-primary/15">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <div
                key={b.title}
                className={`p-6 border-primary/15 ${i % 2 === 0 ? 'sm:border-r' : ''} ${i < benefits.length - (benefits.length % 2 === 0 ? 2 : 1) ? 'border-b' : ''}`}
              >
                <Icon className="h-5 w-5 text-[hsl(var(--gold))] mb-4" strokeWidth={1.75} />
                <h2 className="font-serif-display text-lg font-bold text-primary mb-2">
                  {b.title}
                </h2>
                <p className="text-sm text-foreground/70 leading-relaxed">{b.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px w-8 bg-[hsl(var(--gold))]" aria-hidden />
          <span className="eyebrow text-[hsl(var(--gold))]">How it works</span>
        </div>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="grid grid-cols-[40px_1fr] gap-4 items-baseline border-b border-primary/10 pb-3"
            >
              <span className="font-mono text-xs text-[hsl(var(--gold))]">{s.n}</span>
              <span className="text-sm text-foreground">{s.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA BAND */}
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <div className="bg-primary text-primary-foreground p-8">
          <div className="eyebrow text-[hsl(var(--gold))] mb-3">Ready when you are</div>
          <h2 className="font-serif-display text-2xl sm:text-3xl font-bold leading-tight mb-6">
            Join the clinicians testing OneCare.
          </h2>
          <a
            href={BETA.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppClick}
            data-analytics-id="beta-whatsapp-cta-footer"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-[hsl(var(--gold))] text-primary px-6 py-4 text-sm font-semibold tracking-wide hover:bg-[hsl(var(--gold))]/90 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Join the Beta Community
          </a>
          <p className="mt-4 text-xs text-primary-foreground/70">
            Already in the community?{' '}
            <Link to="/beta/book" className="underline">
              Book your onboarding call
            </Link>
            .
          </p>
        </div>
      </section>

      <footer className="border-t border-primary/10">
        <div className="mx-auto max-w-3xl px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-foreground/55">
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
          <Link to="/beta/nda" className="hover:text-primary">
            Beta NDA
          </Link>
          <Link to="/privacy-policy" className="hover:text-primary">
            Privacy
          </Link>
          <a href={`mailto:${BRAND.emails.hello}`} className="hover:text-primary">
            {BRAND.emails.hello}
          </a>
        </div>
      </footer>
    </div>
  );
}
