import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  HeartPulse,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Tag,
  Users,
} from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BRAND } from '@/lib/brand-constants';
import { BETA } from '@/lib/beta-config';
import { trackBetaEvent } from '@/lib/beta-analytics';

const audiences = [
  {
    icon: HeartPulse,
    eyebrow: 'For patients & families',
    title: 'Keep your health in one place',
    points: [
      'Medications, vitals, appointments and documents in a single record you own.',
      'Reminders and catch-up reminders so nothing slips between visits.',
      'Share exactly what you choose with the clinicians and family who help you.',
    ],
  },
  {
    icon: Stethoscope,
    eyebrow: 'For clinicians & practices',
    title: 'See what happens between visits',
    points: [
      'Patient panels, a triage inbox and encounters that fit an existing workflow.',
      'Guidance and secure messaging that reach the patient where they already are.',
      'Bring your own patients on board in minutes — no rip-and-replace.',
    ],
  },
];

const benefits = [
  {
    icon: Sparkles,
    title: 'Early access to the full platform',
    body: 'Use OneCare end to end before public launch — the patient app, the clinician surface, and everything in between.',
  },
  {
    icon: Tag,
    title: `${BETA.discountMonths} months at a discount`,
    body: `Adopt OneCare during or just after the beta and your first ${BETA.discountMonths} months come at a founding-member rate — for individuals and practices alike.`,
  },
  {
    icon: Users,
    title: 'Direct line to the build team',
    body: 'A small community of patients, families, doctors, nurses, GPs and specialists shaping what gets built next.',
  },
  {
    icon: ShieldCheck,
    title: 'Private by default',
    body: 'Evaluate with your own or test data. AES-256 at rest, TLS in transit, per-user access rules, and a mutual NDA signed before your onboarding call.',
  },
];

const steps = [
  { n: '01', label: 'Pick a time slot' },
  { n: '02', label: 'Sign the NDA' },
  { n: '03', label: 'Have the onboarding call' },
  { n: '04', label: 'Get your beta access' },
  { n: '05', label: 'Join the OneCare Testers Community' },
];

export default function BetaLanding() {
  const handleWhatsAppClick = () => {
    void trackBetaEvent('beta_whatsapp_cta_click', { destination: 'whatsapp' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Join the OneCare beta"
        description={`${BRAND.name} is in beta with patients, families and clinicians. Book an onboarding call, join the testers community and get a founding-member discount.`}
        canonical="/beta"
      />

      {/* Minimal brand bar */}
      <header className="border-b border-primary/10">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="font-serif-display text-xl font-bold text-primary">
            {BRAND.name}
          </Link>
          <div className="flex items-center gap-2">
            <span className="eyebrow text-foreground/50 hidden sm:inline">Beta programme</span>
            <ThemeToggle />
          </div>
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
          you and your clinician
          <br />
          <span className="text-[hsl(var(--gold))]">both write.</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-foreground/75 leading-relaxed max-w-xl">
          {BRAND.name} is a patient-first health record that clinicians can see into
          — medications, vitals and follow-up in one place between visits. We're
          inviting a small group of patients, families and clinicians to test it in
          real life before launch.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            to="/beta/book"
            onClick={() => void trackBetaEvent('beta_book_cta_click')}
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-4 text-sm font-semibold tracking-wide hover:bg-[hsl(var(--emerald-mid))] transition-colors"
          >
            <CalendarCheck className="h-4 w-4" />
            Book an onboarding call
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={BETA.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppClick}
            data-analytics-id="beta-whatsapp-cta"
            className="inline-flex items-center justify-center gap-2 px-6 py-4 text-sm font-semibold tracking-wide border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Join the Beta Community
          </a>
        </div>

        <p className="mt-4 text-xs text-foreground/55">
          No cost to take part. {BETA.callLengthMinutes}-minute onboarding call. A
          mutual NDA is signed before access is granted.
        </p>
      </section>

      {/* WHO IT'S FOR */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px w-8 bg-[hsl(var(--gold))]" aria-hidden />
          <span className="eyebrow text-[hsl(var(--gold))]">Who the beta is for</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-primary/15 border border-primary/15">
          {audiences.map((a) => {
            const Icon = a.icon;
            return (
              <div key={a.eyebrow} className="bg-background p-6">
                <Icon className="h-5 w-5 text-[hsl(var(--gold))] mb-4" strokeWidth={1.75} />
                <div className="eyebrow text-foreground/50 mb-2">{a.eyebrow}</div>
                <h2 className="font-serif-display text-lg font-bold text-primary mb-3">
                  {a.title}
                </h2>
                <ul className="space-y-2">
                  {a.points.map((p) => (
                    <li key={p} className="text-sm text-foreground/70 leading-relaxed flex gap-2">
                      <span className="text-[hsl(var(--gold))]" aria-hidden>
                        —
                      </span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
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
            Join the patients and clinicians testing OneCare.
          </h2>
          <Link
            to="/beta/book"
            onClick={() => void trackBetaEvent('beta_book_cta_click', { placement: 'footer' })}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-[hsl(var(--gold))] text-primary px-6 py-4 text-sm font-semibold tracking-wide hover:bg-[hsl(var(--gold))]/90 transition-colors"
          >
            <CalendarCheck className="h-4 w-4" />
            Book your onboarding call
          </Link>
          <p className="mt-4 text-xs text-primary-foreground/70">
            Prefer to look around first?{' '}
            <a
              href={BETA.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppClick}
              data-analytics-id="beta-whatsapp-cta-footer"
              className="underline"
            >
              Join the Beta Community
            </a>
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
          <Link to="/privacy" className="hover:text-primary">
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
