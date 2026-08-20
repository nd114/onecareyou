import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Play, ArrowRight, Clock, Captions, Stethoscope } from "lucide-react";

import { SEOHead } from "@/components/seo/SEOHead";
import { breadcrumbSchema, videoSchema } from "@/components/seo/structuredData";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand-constants";

import patientVideo from "@/assets/onecare-patient-walkthrough.mp4.asset.json";
import patientPoster from "@/assets/patient-walkthrough-poster.jpg.asset.json";

const chapters = [
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
];

export default function HowItWorks() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const play = () => {
    setStarted(true);
    void videoRef.current?.play();
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="How It Works — Watch the Patient Walkthrough"
        description="A guided video walkthrough of OneCare: log vitals, manage medications, organise your Health Vault, and control exactly who in your care team sees what."
        canonical="/how-it-works"
        jsonLd={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "How It Works", path: "/how-it-works" },
          ]),
          videoSchema({
            name: "OneCare — Patient Walkthrough",
            description:
              "A guided tour of OneCare for patients: Today and your wellness routine, vitals, medications, the Health Vault, Care Circle sharing and the AI assistant.",
            thumbnailUrl: `${BRAND.urls.published}${patientPoster.url}`,
            contentUrl: `${BRAND.urls.published}${patientVideo.url}`,
            duration: "PT3M44S",
            uploadDate: "2026-08-20",
          }),
        ]}
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
            <p className="eyebrow text-primary mb-4">Watch · Patient walkthrough</p>
            <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight">
              See how OneCare works,
              <span className="block text-accent">in under four minutes.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
              A real, unedited tour of the patient app — recorded live on a demo account.
              No slides, no stock footage: the actual screens you'll use, narrated end to end.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> 3 min 44 sec
              </span>
              <span className="inline-flex items-center gap-2">
                <Captions className="h-4 w-4 text-primary" /> Narrated walkthrough
              </span>
              <span className="inline-flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" /> Demo data only
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-12"
          >
            <div className="relative rounded-3xl border border-primary/15 bg-card p-2 shadow-2xl">
              <div className="relative overflow-hidden rounded-2xl bg-muted">
                <video
                  ref={videoRef}
                  className="block w-full aspect-video"
                  src={patientVideo.url}
                  poster={patientPoster.url}
                  controls={started}
                  playsInline
                  preload="metadata"
                  title="OneCare patient walkthrough"
                />
                {!started && (
                  <button
                    type="button"
                    onClick={play}
                    aria-label="Play the OneCare patient walkthrough"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-foreground/35 backdrop-blur-[1px] transition-colors hover:bg-foreground/45"
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
            <h2 className="font-display text-3xl md:text-4xl font-bold">
              Six chapters, in the order you'd meet them.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {chapters.map((c, i) => (
              <motion.div
                key={c.title}
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

      {/* Clinician video — coming soon */}
      <section className="py-20">
        <div className="container">
          <div className="rounded-3xl border border-dashed border-primary/25 bg-card/60 p-10 md:p-14 flex flex-col md:flex-row md:items-center gap-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Stethoscope className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <p className="eyebrow text-primary mb-2">Clinician walkthrough (coming soon)</p>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
                The clinician tour lands here next.
              </h2>
              <p className="text-muted-foreground max-w-2xl">
                Triage inbox, patient panels, the ambient scribe, practice management and
                enterprise oversight — narrated the same way. Until then, the written tour
                covers every screen.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/for-clinicians">
                For clinicians <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
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
              Create a free account and bring your care team into the picture.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/sign-up">Get started free</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link to="/features">Explore features</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
