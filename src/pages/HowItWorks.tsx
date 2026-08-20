import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { Play, ArrowRight, Clock, Captions, Stethoscope, HeartPulse } from "lucide-react";

import { SEOHead } from "@/components/seo/SEOHead";
import { breadcrumbSchema, videoSchema } from "@/components/seo/structuredData";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand-constants";
import { cn } from "@/lib/utils";

import patientVideo from "@/assets/onecare-patient-walkthrough.mp4.asset.json";
import patientPoster from "@/assets/patient-walkthrough-poster.jpg.asset.json";
import clinicianVideo from "@/assets/onecare-clinician-walkthrough.mp4.asset.json";
import clinicianPoster from "@/assets/clinician-walkthrough-poster.jpg.asset.json";

type Audience = "patients" | "clinicians";

const TOURS = {
  patients: {
    label: "For patients",
    icon: HeartPulse,
    eyebrow: "Watch · Patient walkthrough",
    headline: "See how OneCare works,",
    headlineAccent: "in under four minutes.",
    lede:
      "A real, unedited tour of the patient app — recorded live on a demo account. No slides, no stock footage: the actual screens you'll use, narrated end to end.",
    runtime: "3 min 44 sec",
    duration: "PT3M44S",
    uploadDate: "2026-08-20",
    video: patientVideo.url,
    poster: patientPoster.url,
    videoName: "OneCare — Patient Walkthrough",
    videoDescription:
      "A guided tour of OneCare for patients: Today and your wellness routine, vitals, medications, the Health Vault, Care Circle sharing and the AI assistant.",
    chaptersTitle: "Six chapters, in the order you'd meet them.",
    chapters: [
      {
        title: "Getting started",
        body: "Sign in with email or Google, then onboarding sets your name, date of birth and country — which fixes your units and emergency numbers.",
      },
      {
        title: "Today",
        body: "Your wellness routine for the day: medication times, appointments and tasks — with catch-up reminders for anything missed.",
      },
      {
        title: "My Health",
        body: "Vitals across a 90-day view, medications with interaction checks, and the Health Vault with folders, AI summaries and document viewing.",
      },
      {
        title: "Care Team",
        body: "Messages with each clinician, and a Care Circle that decides exactly which categories each clinician or hospital can see.",
      },
      {
        title: "Learn & Ask AI",
        body: "An assistant that explains your record and proposes changes — nothing is written until you approve it. Simple Mode strips it back to plain conversation.",
      },
      {
        title: "Privacy & everyday use",
        body: "Granular AI consent, a full audit trail of every access, offline queuing for vitals and doses, and care record snapshots you keep forever.",
      },
    ],
  },
  clinicians: {
    label: "For clinicians",
    icon: Stethoscope,
    eyebrow: "Watch · Clinician walkthrough",
    headline: "Follow patients between visits,",
    headlineAccent: "without another record system.",
    lede:
      "The clinician surface, recorded live on a demo practice: one triage inbox, one chart per patient, and a clear record of who did what.",
    runtime: "3 min 31 sec",
    duration: "PT3M31S",
    uploadDate: "2026-08-20",
    video: clinicianVideo.url,
    poster: clinicianPoster.url,
    videoName: "OneCare — Clinician Walkthrough",
    videoDescription:
      "A guided tour of OneCare for clinicians: the Today triage inbox, patient panels with provenance, guidance, dictations and scribe, practice management, audit trail and enterprise tenancy.",
    chaptersTitle: "Six chapters, from sign-up to sign-off.",
    chapters: [
      {
        title: "Access & BAA",
        body: "Sign up, complete title, specialty, licence and country, and sign the business associate agreement before any patient data is exposed.",
      },
      {
        title: "Today",
        body: "One triage inbox ordered by urgency: vital alerts, unread messages, guidance awaiting a reply and open practice tasks — actionable in place.",
      },
      {
        title: "Patients",
        body: "A paginated, searchable list, then a patient chart with medications, vitals carrying their source, documents, guidance, encounters and notes.",
      },
      {
        title: "Communicate",
        body: "Structured guidance the patient can answer, threaded messages, clinical templates, and dictations that draft a SOAP note you edit and sign.",
      },
      {
        title: "Assistant",
        body: "The clinician assistant proposes, you approve, then it applies and writes the action to the log — it never writes first and never prescribes.",
      },
      {
        title: "Practice & compliance",
        body: "Tasks, encounters, team roles, institution patients, pooled storage and an exportable audit trail of who accessed which patient and when.",
      },
    ],
  },
} satisfies Record<Audience, Record<string, unknown>>;

export default function HowItWorks() {
  const [params, setParams] = useSearchParams();
  const initial: Audience = params.get("audience") === "clinicians" ? "clinicians" : "patients";
  const [audience, setAudience] = useState<Audience>(initial);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const tour = TOURS[audience];

  useEffect(() => {
    setStarted(false);
  }, [audience]);

  const select = (next: Audience) => {
    setAudience(next);
    const p = new URLSearchParams(params);
    if (next === "clinicians") p.set("audience", "clinicians");
    else p.delete("audience");
    setParams(p, { replace: true });
  };

  const play = () => {
    setStarted(true);
    void videoRef.current?.play();
  };

  const jsonLd = useMemo(
    () => [
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "How It Works", path: "/how-it-works" },
      ]),
      ...(["patients", "clinicians"] as Audience[]).map((key) =>
        videoSchema({
          name: TOURS[key].videoName,
          description: TOURS[key].videoDescription,
          thumbnailUrl: `${BRAND.urls.published}${TOURS[key].poster}`,
          contentUrl: `${BRAND.urls.published}${TOURS[key].video}`,
          duration: TOURS[key].duration,
          uploadDate: TOURS[key].uploadDate,
        }),
      ),
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="How It Works — Patient & Clinician Walkthroughs"
        description="Guided video walkthroughs of OneCare: the patient app for vitals, medications and sharing, and the clinician surface with its triage inbox, charts, scribe and audit trail."
        canonical="/how-it-works"
        jsonLd={jsonLd}
      />
      <Header />

      {/* Hero + player */}
      <section className="relative overflow-hidden pt-16 pb-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-32 h-[36rem] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.16),transparent_70%)]"
        />
        <div className="container relative">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <p className="eyebrow text-primary mb-4">{tour.eyebrow}</p>
            <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight">
              {tour.headline}
              <span className="block text-accent">{tour.headlineAccent}</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl">{tour.lede}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> {tour.runtime}
              </span>
              <span className="inline-flex items-center gap-2">
                <Captions className="h-4 w-4 text-primary" /> Narrated walkthrough
              </span>
              <span className="inline-flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" /> Demo data only
              </span>
            </div>
          </motion.div>

          {/* Audience switcher */}
          <div
            role="tablist"
            aria-label="Choose a walkthrough"
            className="mt-10 inline-flex rounded-full border border-primary/15 bg-card p-1"
          >
            {(["patients", "clinicians"] as Audience[]).map((key) => {
              const Icon = TOURS[key].icon;
              const active = audience === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => select(key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {TOURS[key].label}
                </button>
              );
            })}
          </div>

          <motion.div
            key={audience}
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-8"
          >
            <div className="relative rounded-3xl border border-primary/15 bg-card p-2 shadow-2xl">
              <div className="relative overflow-hidden rounded-2xl bg-muted">
                <video
                  ref={videoRef}
                  className="block w-full aspect-video"
                  src={tour.video}
                  poster={tour.poster}
                  controls={started}
                  playsInline
                  preload="metadata"
                  title={tour.videoName}
                />
                {!started && (
                  <button
                    type="button"
                    onClick={play}
                    aria-label={`Play the ${tour.videoName}`}
                    className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-foreground/35 backdrop-blur-[1px] transition-colors hover:bg-foreground/45"
                  >
                    <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform group-hover:scale-105">
                      <Play className="h-8 w-8 translate-x-0.5" />
                    </span>
                    <span className="font-display text-lg font-bold text-background drop-shadow">
                      Play the walkthrough
                    </span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Chapters */}
      <section className="py-20 bg-muted/30 border-y border-border">
        <div className="container">
          <div className="max-w-2xl mb-12">
            <p className="eyebrow text-primary mb-3">What you'll see</p>
            <h2 className="font-display text-3xl md:text-4xl font-bold">{tour.chaptersTitle}</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tour.chapters.map((c, i) => (
              <motion.div
                key={`${audience}-${c.title}`}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-primary/12 bg-card p-6"
              >
                <span className="font-display text-3xl font-bold text-primary/30">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-lg font-bold mt-2 mb-2">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-link to the other tour */}
      <section className="py-20">
        <div className="container">
          <div className="rounded-3xl border border-primary/20 bg-card/60 p-10 md:p-14 flex flex-col md:flex-row md:items-center gap-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              {audience === "patients" ? (
                <Stethoscope className="h-7 w-7 text-primary" />
              ) : (
                <HeartPulse className="h-7 w-7 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <p className="eyebrow text-primary mb-2">
                {audience === "patients" ? "Clinician walkthrough" : "Patient walkthrough"}
              </p>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
                {audience === "patients"
                  ? "Want the clinician side instead?"
                  : "See what your patients see."}
              </h2>
              <p className="text-muted-foreground max-w-2xl">
                {audience === "patients"
                  ? "Triage inbox, patient panels, the ambient scribe, practice management and enterprise oversight — narrated the same way."
                  : "The patient app your patients live in: wellness routine, vitals, Health Vault and the sharing controls that decide what you can see."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => select(audience === "patients" ? "clinicians" : "patients")}
            >
              Watch it <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center rounded-3xl gradient-primary p-12">
            <h2 className="font-display text-3xl font-bold text-primary-foreground mb-4">
              Ready to try it yourself?
            </h2>
            <p className="text-lg text-primary-foreground/90 mb-8">
              {audience === "clinicians"
                ? "Create a clinician account and start following patients between visits."
                : "Create a free account and bring your care team into the picture."}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to={audience === "clinicians" ? "/clinician/sign-up" : "/sign-up"}>
                  Get started free
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link to={audience === "clinicians" ? "/for-clinicians" : "/features"}>
                  {audience === "clinicians" ? "For clinicians" : "Explore features"}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
