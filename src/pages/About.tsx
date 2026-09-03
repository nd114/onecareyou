import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { SEOHead } from '@/components/seo/SEOHead';
import { organizationSchema, breadcrumbSchema } from '@/components/seo/structuredData';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import {
  ClosingCta,
  HairlineGrid,
  MarketingHero,
  SectionHeading,
} from '@/components/home/marketing';

/**
 * Why the product exists, argued rather than asserted.
 *
 * An About page usually lists values, which cost nothing to write and tell a
 * reader nothing. This one lists decisions and their consequences, and then
 * lists the things we have decided not to build — which is the part a company
 * cannot fake, because each refusal closes a revenue line.
 */

/** Decisions we made early, and what each one costs us. A value with a price. */
const DECISIONS = [
  {
    decision: 'The record belongs to the patient, not the practice',
    consequence:
      'A clinic cannot take it back, and it does not empty when you change doctors. It also means we cannot sell a hospital the thing hospitals usually buy: exclusive custody of their patients.',
  },
  {
    decision: 'Consent is enforced in the database, not the screen',
    consequence:
      'A request for something you did not share comes back empty even if the interface asks for it. This is slower to build and much harder to get quietly wrong.',
  },
  {
    decision: 'A signed note cannot be rewritten',
    consequence:
      'Corrections are added as addenda and both versions stay. Nobody — including us — can edit history after the fact, which is exactly the property you want and exactly the one that makes support harder.',
  },
  {
    decision: 'Reception staff are not clinicians',
    consequence:
      'Booking and billing roles cannot open clinical notes. Fewer people can see the sensitive part of the record, so onboarding a practice takes more setup, not less.',
  },
];

/** The refusals. Each of these is a product somebody has asked us for. */
const REFUSALS = [
  {
    heading: 'We do not sell health data',
    body: 'Not aggregated, not de-identified, not to researchers, not to insurers. There is no version of this where the number is high enough.',
  },
  {
    heading: 'We do not let a clinic grant itself access',
    body: 'Access starts with a patient sharing, and only with a patient sharing. An institution cannot add itself to a record because it happens to hold the account.',
  },
  {
    heading: 'We do not lock the exit',
    body: 'You can take the record out, and closing the account does not mean asking us nicely for a copy first.',
  },
  {
    heading: 'We do not let the assistant practise medicine',
    body: 'It reads your record and explains it. It says when the answer needs a person, and it does not pretend a guess is a finding.',
  },
];

const About = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SEOHead
        title="Why OneCare exists"
        description="Health records are held by institutions, and the patient is the only person present at all of their own care. OneCare is built on that mismatch — and on decisions we can be held to."
        canonical="/about"
        jsonLd={[
          organizationSchema(),
          breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]),
        ]}
      />
      <Header />

      <MarketingHero
        eyebrow="Why OneCare exists"
        title={
          <>
            Your care is continuous.
            <br />
            <span className="text-primary">Your record is not</span>
            <span className="text-[hsl(var(--gold))]">.</span>
          </>
        }
        lede="Every place that treats you keeps a piece of your history and none of them keep all of it. The one person who was present for all of it has the worst copy — memory, and a folder of letters."
        primary={{ to: '/sign-up', label: 'Start your record' }}
        secondary={{ to: '/how-it-works', label: 'See how it works' }}
        note="Free for patients. Your record stays yours if you ever leave."
      />

      {/* ---------------------------------------------------------------
          THE MOMENT — one specific scene, not a category of problem
          --------------------------------------------------------------- */}
      <section className="border-y border-primary/10 bg-[hsl(var(--secondary))]/40">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHeading
                eyebrow="The gap"
                title="It shows up in a small question"
                lede="Not in a crisis. In the ordinary appointment where someone asks what you are taking, and the answer has to come from you."
              />
            </div>

            <div className="lg:col-span-7">
              <figure className="rounded-2xl border border-primary/15 bg-background/85 p-6 shadow-[0_1px_0_hsl(var(--primary)/0.06),0_24px_60px_-30px_hsl(var(--primary)/0.4)] sm:p-8">
                <blockquote className="font-display text-xl leading-snug sm:text-2xl">
                  “And what are you on at the moment?”
                </blockquote>
                <figcaption className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    You name the two you take every day. You forget the one you take on Tuesdays. You
                    are not sure whether the hospital changed the dose in March or told you to keep
                    the old one. The letter is somewhere at home.
                  </p>
                  <p>
                    Nothing dramatic happens. A prescription is written on an incomplete picture, a
                    result is ordered that already exists, an interaction goes unchecked. Multiply
                    that by every appointment, for everyone, for years.
                  </p>
                  <p className="text-foreground">
                    The information existed. It was simply somewhere else, in a system that had no
                    reason to talk to the one in front of you.
                  </p>
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          DECISIONS — values with a price attached
          --------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
        <SectionHeading
          eyebrow="What we decided"
          title="Four decisions, and what each one costs us"
          lede="A value nobody pays for is a slogan. These are the ones with a bill attached."
        />

        <dl className="mt-12 divide-y divide-primary/10 border-y border-primary/10">
          {DECISIONS.map(({ decision, consequence }) => (
            <div key={decision} className="grid gap-3 py-7 sm:grid-cols-12 sm:gap-8">
              <dt className="font-display text-lg leading-snug sm:col-span-5">{decision}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground sm:col-span-7">
                {consequence}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------------------------------------------------------
          REFUSALS — the part that is hard to say and easy to check
          --------------------------------------------------------------- */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
          <SectionHeading
            tone="light"
            eyebrow="What we will not build"
            title="The list matters more than the mission statement"
            lede="Each of these has been asked for. Writing them down is the only version of a promise that can be held against us later."
          />

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-primary-foreground/15 sm:grid-cols-2">
            {REFUSALS.map(({ heading, body }) => (
              <div key={heading} className="bg-primary p-6 sm:p-7">
                <h3 className="font-display text-lg leading-snug text-[hsl(var(--gold))]">
                  {heading}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-primary-foreground/75">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          WHO IT SERVES
          --------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
        <SectionHeading
          eyebrow="Who it is for"
          title="Patient first — which is what makes it work for clinicians"
          lede="A record the patient maintains is a record that is already there when they walk in, and already up to date between visits."
        />

        <HairlineGrid className="mt-12 sm:grid-cols-3">
          {[
            <Fragment key="People managing something ongoing">
              <h3 className="font-display text-lg leading-snug">People managing something ongoing</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                A condition, a set of medications, a family member's care. The readings between
                appointments are the part nobody currently sees.
              </p>
            </Fragment>,
            <Fragment key="Clinicians with their own patients">
              <h3 className="font-display text-lg leading-snug">Clinicians with their own patients</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Independent practice, or a hospital post, or both. The relationships you built
                follow you, and the hospital sees only what its patients shared with it.
              </p>
            </Fragment>,
            <Fragment key="Institutions that will be audited">
              <h3 className="font-display text-lg leading-snug">Institutions that will be audited</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Departments, staff roles that actually restrict, and a consent trail that exists
                because the system needed it — not because an audit was announced.
              </p>
            </Fragment>,
          ]}
        </HairlineGrid>

        <p className="mt-8 text-sm text-muted-foreground">
          Building on the other side of this?{' '}
          <Link
            to="/for-clinicians"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            Read the clinician case
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      </section>

      <ClosingCta
        title="Start with one thing you already know"
        lede="A medication you take, or a reading you took this morning. The record builds itself from there."
        note="Free for patients. No card, no trial clock."
      />

      <Footer />
    </div>
  );
};

export default About;
