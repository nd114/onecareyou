import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, FileText, Stethoscope, Building2,
  MessagesSquare, Activity, Sparkles,
} from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { organizationSchema, webApplicationSchema } from '@/components/seo/structuredData';
import { Header } from '@/components/layout/Header';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { Footer } from '@/components/layout/Footer';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { ConsentDemo } from '@/components/home/ConsentDemo';
import { AuroraField } from '@/components/home/AuroraField';

/**
 * The case for OneCare, from the patient's side.
 *
 * The page is built around one argument rather than a feature list: your health
 * record is scattered across places that do not talk to each other, and you are
 * the only person present at all of it. So the record should be yours, and the
 * people who see it should be people you chose.
 *
 * The hero is that argument as a control the visitor can operate — see
 * ConsentDemo. Everything after it is evidence, in descending order of how hard
 * it is to claim without doing the work: the problem in their own words, what
 * changes, and then the part almost nobody else will print — that consent here
 * is enforced by the database and there are hundreds of assertions proving it.
 */

/** What a patient recognises about their own care, before any product talk. */
const TRUTHS = [
  {
    heading: 'Your record is in pieces',
    body:
      'A folder at the clinic. A letter from the hospital. Results on a portal you signed into once. Nobody has all of it, and you are the only person who was in every room.',
  },
  {
    heading: 'You repeat yourself, every time',
    body:
      'What are you taking. When did it start. What did the last doctor say. You answer from memory, under pressure, and a wrong answer changes what happens next.',
  },
  {
    heading: 'Between visits, nothing is watching',
    body:
      'The readings you take, the doses you miss, the thing that felt wrong on Tuesday — none of it reaches anyone until you are back in the room, and by then it is a memory.',
  },
];

const CHANGES = [
  {
    icon: FileText,
    title: 'One record, and it is yours',
    body:
      'Readings, medications, letters, scans, visit summaries. Held in your account, not a clinic’s filing system, and it does not leave when you do.',
  },
  {
    icon: ShieldCheck,
    title: 'You decide who sees what',
    body:
      'Per person, per category, ended whenever you want. A clinic that had access last year does not still have it because nobody thought to look.',
  },
  {
    icon: Activity,
    title: 'The gap between visits closes',
    body:
      'Log a reading and your clinician sees it as it happens. If something moves the wrong way, it reaches them before the next appointment does.',
  },
  {
    icon: MessagesSquare,
    title: 'Answers in your own language',
    body:
      'Ask what a result means, what a drug interacts with, what to do about a missed dose. It reads your actual record, and it says when to ask a person instead.',
  },
];

/** Claims we can put a number against, because the number is checkable. */
const PROOF = [
  { figure: '320', label: 'database assertions that prove who can read what' },
  { figure: '338', label: 'automated checks run on every change' },
  { figure: '0', label: 'access decisions made by the interface alone' },
];

const Landing = () => {
  const { isClinician } = useClinicianProfile();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Your health record, and you decide who sees it"
        description="OneCare gives you one health record you own — readings, medications, letters and visit summaries — and lets you grant and withdraw access to each clinician or hospital yourself."
        jsonLd={[organizationSchema(), webApplicationSchema()]}
      />

      {isClinician ? <ClinicianHeader /> : <Header />}

      {/* ---------------------------------------------------------------
          HERO — the thesis, as something you can operate
          --------------------------------------------------------------- */}
      <section className="oc-hero-ground relative isolate overflow-hidden">
        <AuroraField />

        <div className="relative mx-auto max-w-7xl px-6 pb-12 pt-12 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
            <div className="oc-rise lg:col-span-6">
              <div className="mb-7 flex items-center gap-3">
                <span className="h-px w-10 bg-[hsl(var(--gold))]" aria-hidden />
                <span className="eyebrow text-primary/75">
                  Health records, held by the patient
                </span>
              </div>

              <h1 className="font-display text-[2.6rem] leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-[4.1rem]">
                Your record.
                <br />
                <span className="text-primary">Your call</span>
                <span className="text-[hsl(var(--gold))]">.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Everything about your health in one place you own — and a switch beside
                every clinician, hospital and family member who can see it.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/sign-up"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold tracking-wide text-primary-foreground transition-colors hover:bg-[hsl(var(--emerald-mid))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Start your record
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/how-it-works"
                  className="inline-flex items-center justify-center rounded-full border border-primary/25 px-7 py-3.5 text-sm font-semibold tracking-wide text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  See how it works
                </Link>
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                Free for patients. Your record stays yours if you ever leave.
              </p>
            </div>

            <div className="oc-rise lg:col-span-6" style={{ animationDelay: '120ms' }}>
              <ConsentDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          THE PROBLEM — in the reader's own experience, not ours
          --------------------------------------------------------------- */}
      <section className="border-y border-primary/10 bg-[hsl(var(--secondary))]/40">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
          <h2 className="max-w-2xl font-display text-3xl leading-tight tracking-[-0.015em] sm:text-4xl">
            You are the only one who was in every room
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            And you are the one person nobody built the system for.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-primary/10 bg-primary/10 sm:grid-cols-3">
            {TRUTHS.map((t) => (
              <div key={t.heading} className="bg-background p-6 sm:p-7">
                <h3 className="font-display text-lg leading-snug">{t.heading}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          WHAT CHANGES
          --------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
        <h2 className="max-w-2xl font-display text-3xl leading-tight tracking-[-0.015em] sm:text-4xl">
          What OneCare actually does
        </h2>

        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {CHANGES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--emerald-light))] text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg leading-snug">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          THE PROOF — the part that is hard to claim without doing it
          --------------------------------------------------------------- */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-px w-10 bg-[hsl(var(--gold))]" aria-hidden />
                <span className="eyebrow text-[hsl(var(--gold))]">Why you can believe it</span>
              </div>
              <h2 className="font-display text-3xl leading-tight tracking-[-0.015em] sm:text-4xl">
                Consent is not a setting here. It is the wiring.
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-primary-foreground/75">
                Most apps hide data in the interface and hope. In OneCare the rules live in the
                database itself, so a request for something you did not share comes back empty
                even if the screen asks for it. That is a harder thing to build and a much
                harder thing to get wrong quietly.
              </p>
            </div>

            <div className="lg:col-span-7">
              <dl className="grid gap-px overflow-hidden rounded-2xl bg-primary-foreground/15 sm:grid-cols-3">
                {PROOF.map((p) => (
                  <div key={p.label} className="bg-primary p-6">
                    <dt className="font-display text-4xl tabular-nums text-[hsl(var(--gold))]">
                      {p.figure}
                    </dt>
                    <dd className="mt-2 text-xs leading-relaxed text-primary-foreground/70">
                      {p.label}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-xs leading-relaxed text-primary-foreground/60">
                Every one of those checks runs against a real database before anything ships.
                They cover things like: a hospital cannot see a doctor’s private patients, a
                receptionist cannot read a clinical note, and a signed note cannot be quietly
                rewritten.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          WHO IT IS FOR
          --------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
        <h2 className="max-w-2xl font-display text-3xl leading-tight tracking-[-0.015em] sm:text-4xl">
          Built for the patient first, and it shows on the other side too
        </h2>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Sparkles,
              who: 'If you are a patient',
              body: 'Free. Your record, your readings, your documents, and the switch beside every person who can see them.',
              to: '/sign-up',
              cta: 'Start your record',
            },
            {
              icon: Stethoscope,
              who: 'If you are a clinician',
              body: 'Your own patients follow you, not your employer. Notes, scheduling, care plans and an assistant that reads the record rather than guessing.',
              to: '/clinician/sign-up',
              cta: 'Set up your practice',
            },
            {
              icon: Building2,
              who: 'If you run a hospital',
              body: 'Departments, staff roles that mean something, and a consent trail you can show a regulator without preparing for it.',
              to: '/pricing',
              cta: 'See enterprise',
            },
          ].map(({ icon: Icon, who, body, to, cta }) => (
            <Link
              key={who}
              to={to}
              className="group flex flex-col rounded-2xl border border-primary/12 p-6 transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-display text-lg">{who}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                {cta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          CLOSE
          --------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden border-t border-primary/10">
        <AuroraField className="opacity-70" />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
          <h2 className="font-display text-3xl leading-tight tracking-[-0.015em] sm:text-5xl">
            Start with one thing you already know
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
            A medication you take, or a reading you took this morning. The record builds itself
            from there.
          </p>
          <Link
            to="/sign-up"
            className="mt-9 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold tracking-wide text-primary-foreground transition-colors hover:bg-[hsl(var(--emerald-mid))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Start your record
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Landing;
