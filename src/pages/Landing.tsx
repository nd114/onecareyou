import { SEOHead } from '@/components/seo/SEOHead';
import { organizationSchema, webApplicationSchema } from '@/components/seo/structuredData';
import { Link } from 'react-router-dom';
import {
  Share2,
  Users,
  Activity,
  ShieldAlert,
  CalendarClock,
  ClipboardList,
  ArrowRight,
  Circle,
  Lock,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { Footer } from '@/components/layout/Footer';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';

const features = [
  {
    icon: Share2,
    title: 'Care coordination',
    description:
      'Keep your care team aligned between visits. Everyone sees the same updates as they happen.',
  },
  {
    icon: Users,
    title: 'Provider access',
    description:
      'Grant a clinician access with a code. Revoke it any time. You decide what they see.',
  },
  {
    icon: Activity,
    title: 'Health tracking',
    description:
      'Log vitals, medications, symptoms and lab results. Shared automatically with the people you trust.',
  },
  {
    icon: ShieldAlert,
    title: 'Safety alerts',
    description:
      'Automatic medication interaction checks. Vital thresholds notify your care team when it matters.',
  },
  {
    icon: CalendarClock,
    title: 'Smart scheduling',
    description:
      'Medication and follow-up reminders that adapt to your routine, not the other way around.',
  },
  {
    icon: ClipboardList,
    title: 'Health profile',
    description:
      'Allergies, conditions, emergency contacts and current medications, ready when a clinician needs them.',
  },
];

const timeline = [
  {
    who: 'Patient',
    time: '08:12',
    label: 'Logged blood pressure',
    value: '128 / 82 mmHg',
  },
  {
    who: 'Patient',
    time: '08:15',
    label: 'Symptom note',
    value: 'Mild dizziness on standing',
  },
  {
    who: 'Clinician',
    time: '09:04',
    label: 'Dr. Adeyemi replied',
    value: 'Reduce dose to 5mg. Follow up in 3 days.',
  },
  {
    who: 'Patient',
    time: '13:30',
    label: 'Medication taken',
    value: 'Ramipril 5mg — on time',
  },
];

export default function Landing() {
  const { isClinician } = useClinicianProfile();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="OneCare — a shared health record for patients and their care team"
        description="OneCare is a co-authored health record. Patients log care between visits, clinicians see it as it happens, and both work from the same page."
        structuredData={[organizationSchema, webApplicationSchema]}
      />

      {isClinician ? <ClinicianHeader /> : <Header />}

      {/* HERO */}
      <section className="relative">
        <div className="mx-auto max-w-7xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 lg:col-span-8">
              <div className="flex items-center gap-3 mb-8">
                <span className="h-px w-10 bg-[hsl(var(--gold))]" aria-hidden />
                <span className="eyebrow text-[hsl(var(--gold))]">
                  Early access · Care coordination platform
                </span>
              </div>
              <h1 className="font-serif-display text-[3.25rem] sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-primary leading-[0.95] tracking-tight">
                The record,
                <br />
                <span className="italic font-medium">co-authored.</span>
              </h1>
            </div>
            <div className="col-span-12 lg:col-span-4 lg:pb-4">
              <div className="border-l-2 border-[hsl(var(--emerald-mid))] pl-6">
                <p className="text-base lg:text-lg text-foreground/80 leading-relaxed mb-8">
                  OneCare is one health record patients and clinicians write to
                  together. Log vitals, share updates, and stay coordinated
                  between visits — without chasing faxes, portals or discharge
                  summaries.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/sign-up"
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold tracking-wide hover:bg-[hsl(var(--emerald-mid))] transition-colors"
                  >
                    Get started free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/for-clinicians"
                    className="inline-flex items-center px-6 py-3 text-sm font-semibold tracking-wide border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    For clinicians
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Product mockup — browser chrome */}
          <div className="mt-16 lg:mt-20">
            <div className="rounded-lg border border-primary/20 bg-white shadow-2xl overflow-hidden">
              {/* Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[hsl(var(--secondary))] border-b border-primary/10">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="mx-auto max-w-md w-full text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-background/80 text-xs text-foreground/60 font-mono">
                    <Lock className="h-3 w-3" />
                    onecare.you/dashboard
                  </div>
                </div>
              </div>

              {/* Patient row */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-primary/10">
                <div>
                  <div className="eyebrow text-foreground/50 mb-1">Patient</div>
                  <div className="font-serif-display text-2xl font-bold text-primary">
                    Amara Okoye
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-[hsl(var(--emerald-light))] px-3 py-1 text-xs font-semibold text-primary">
                  <Circle className="h-2 w-2 fill-current" />
                  Shared with 2 providers
                </span>
              </div>

              {/* Stat row */}
              <div className="grid grid-cols-2 md:grid-cols-4 border-b border-primary/10">
                {[
                  { label: 'Adherence', value: '87%' },
                  { label: 'Daily doses', value: '6' },
                  { label: 'Health markers', value: '4' },
                  { label: 'Providers', value: '2' },
                ].map((s, i) => (
                  <div
                    key={s.label}
                    className={`px-8 py-5 ${i < 3 ? 'md:border-r border-primary/10' : ''} ${i < 2 ? 'border-b md:border-b-0 border-primary/10' : ''}`}
                  >
                    <div className="font-serif-display text-3xl font-bold text-primary">
                      {s.value}
                    </div>
                    <div className="eyebrow text-foreground/50 mt-1">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Activity timeline */}
              <div className="px-8 py-6">
                <div className="eyebrow text-foreground/50 mb-4">
                  Today · Activity
                </div>
                <ul className="space-y-4">
                  {timeline.map((row, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-[64px_100px_1fr] gap-4 items-baseline"
                    >
                      <span className="font-mono text-xs text-foreground/50">
                        {row.time}
                      </span>
                      <span
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          row.who === 'Clinician'
                            ? 'text-[hsl(var(--gold))]'
                            : 'text-[hsl(var(--emerald-mid))]'
                        }`}
                      >
                        {row.who}
                      </span>
                      <span className="text-sm text-foreground">
                        <span className="font-semibold">{row.label}</span>
                        <span className="text-foreground/60"> — {row.value}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Care settings — replaces fake logos */}
          <div className="mt-16 border-t border-primary/10 pt-8">
            <p className="text-sm text-foreground/60 mb-4">
              Built with clinicians and patients managing ongoing care.
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {[
                'Primary care',
                'Post-discharge',
                'Chronic care',
                'Specialist referral',
              ].map((label) => (
                <span
                  key={label}
                  className="eyebrow text-foreground/70"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CO-AUTHORSHIP SECTION */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="grid grid-cols-12 gap-0 border border-primary/20 bg-white">
          <div className="col-span-12 md:col-span-7 p-10 lg:p-14 bg-primary text-primary-foreground">
            <div className="flex items-center gap-3 mb-10">
              <span className="h-px w-10 bg-[hsl(var(--gold))]" aria-hidden />
              <span className="eyebrow text-[hsl(var(--gold))]">
                Feature 01 · Co-authorship
              </span>
            </div>
            <h2 className="font-serif-display text-4xl lg:text-5xl font-bold leading-tight mb-6">
              One record.
              <br />
              Written by both sides.
            </h2>
            <p className="text-primary-foreground/80 text-lg max-w-md">
              Updates the patient logs — vitals, symptoms, medication taken —
              appear immediately for the care team. Clinician notes and plan
              changes appear immediately for the patient. No portals to sync,
              no discharge letters to wait for.
            </p>
            <div className="grid grid-cols-3 gap-8 pt-12 mt-12 border-t border-primary-foreground/20">
              <div>
                <div className="font-serif-display text-2xl font-bold text-[hsl(var(--gold))]">
                  AES-256
                </div>
                <div className="eyebrow text-primary-foreground/60 mt-1">
                  Encryption
                </div>
              </div>
              <div>
                <div className="font-serif-display text-2xl font-bold text-[hsl(var(--gold))]">
                  TLS
                </div>
                <div className="eyebrow text-primary-foreground/60 mt-1">
                  In transit
                </div>
              </div>
              <div>
                <div className="font-serif-display text-2xl font-bold text-[hsl(var(--gold))]">
                  RLS
                </div>
                <div className="eyebrow text-primary-foreground/60 mt-1">
                  Per-user access
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-5 bg-[hsl(var(--emerald-mid))] p-10 lg:p-14 flex flex-col gap-6 justify-end">
            <div className="p-5 bg-background border-l-4 border-[hsl(var(--gold))] shadow-lg">
              <div className="flex justify-between items-start mb-3">
                <span className="eyebrow text-primary">
                  Patient contributes
                </span>
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--emerald-mid))]" />
              </div>
              <div className="font-serif-display text-xl font-bold text-foreground">
                BP 128 / 82
              </div>
              <div className="text-xs text-foreground/60 mt-1">
                Logged 08:12 · Amara O.
              </div>
            </div>
            <div className="p-5 bg-background border-l-4 border-primary shadow-lg">
              <div className="flex justify-between items-start mb-3">
                <span className="eyebrow text-primary">
                  Clinician validates
                </span>
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--gold))]" />
              </div>
              <div className="font-serif-display text-xl font-bold text-foreground">
                Adjust ramipril to 5mg
              </div>
              <div className="text-xs text-foreground/60 mt-1">
                09:04 · Dr. Adeyemi
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE GRID — 3 cols x 2 rows, hairline borders */}
      <section className="mx-auto max-w-7xl px-6 pb-20 lg:pb-28">
        <div className="flex items-center gap-3 mb-10">
          <span className="h-px w-10 bg-[hsl(var(--gold))]" aria-hidden />
          <span className="eyebrow text-[hsl(var(--gold))]">
            What you get
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 border border-primary/15">
          {features.map((f, i) => {
            const Icon = f.icon;
            const isLastRow = i >= 3;
            const isLastCol = (i + 1) % 3 === 0;
            return (
              <div
                key={f.title}
                className={`p-8 lg:p-10 ${!isLastCol ? 'md:border-r' : ''} ${!isLastRow ? 'border-b' : ''} border-primary/15`}
              >
                <Icon
                  className="h-5 w-5 text-[hsl(var(--gold))] mb-6"
                  strokeWidth={1.75}
                />
                <h3 className="font-serif-display text-xl font-bold text-primary mb-3">
                  {f.title}
                </h3>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA BAND */}
      <section className="mx-auto max-w-7xl px-6 pb-20 lg:pb-28">
        <div className="rounded-2xl bg-primary text-primary-foreground p-10 lg:p-16">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <div className="eyebrow text-[hsl(var(--gold))] mb-4">
                Ready when you are
              </div>
              <h2 className="font-serif-display text-3xl lg:text-5xl font-bold leading-tight">
                Start co-authoring your health record.
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/sign-up"
                className="inline-flex items-center gap-2 bg-[hsl(var(--gold))] text-primary px-6 py-3 text-sm font-semibold tracking-wide hover:bg-[hsl(var(--gold))]/90 transition-colors"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/for-clinicians"
                className="inline-flex items-center px-6 py-3 text-sm font-semibold tracking-wide border border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              >
                For clinicians
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
