import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Stethoscope,
  Activity,
  Users,
  Shield,
  Inbox,
  FileText,
  ArrowRight,
  CheckCircle2,
  Building2,
  Clock,
} from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { breadcrumbSchema } from '@/components/seo/structuredData';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const valueProps = [
  {
    icon: Inbox,
    title: 'Triage Inbox',
    desc: 'Unread / Acknowledged tabs surface the patients who need you now. One click to acknowledge.',
  },
  {
    icon: Activity,
    title: 'Continuous monitoring',
    desc: 'Patient-entered vitals stream into your dashboard. Custom thresholds trigger alerts.',
  },
  {
    icon: Users,
    title: 'Shared patient pools',
    desc: 'Add team members with RBAC. Front desk, nurses, providers see only what they need.',
  },
  {
    icon: FileText,
    title: 'Health Vault sharing',
    desc: 'Patients share specific documents with you via signed URLs — no email attachments.',
  },
  {
    icon: Shield,
    title: 'HIPAA-ready + BAA',
    desc: 'AES-256 at rest, TLS in transit, audit log on every PHI interaction, BAA on Enterprise.',
  },
  {
    icon: Building2,
    title: 'EHR-friendly',
    desc: 'FHIR-based sync framework with LOINC mapping. Webhook hooks for Epic, Veradigm and friends.',
  },
];

const differentiators = [
  'Built for the post-discharge gap, not another inbox to ignore',
  '15-minute setup, no IT department',
  'Patient app is free for your patients — no friction to onboard them',
  'Per-clinician pricing, not per-patient',
  'Audit log + signature capture out of the box',
];

export default function ForClinicians() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="OneCare for Clinicians — Continuous Care After Discharge"
        description="OneCare gives healthcare providers a connected view of patient vitals, medications, and documents after discharge. HIPAA-ready, EHR-friendly, 15-minute setup."
        canonical="/for-clinicians"
        jsonLd={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'For Clinicians', path: '/for-clinicians' },
          ]),
        ]}
      />
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero py-20 lg:py-28">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center"
          >
            <Badge variant="outline" className="mb-4">
              <Stethoscope className="h-3 w-3 mr-1.5" />
              For healthcare providers
            </Badge>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              See your patients{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                between visits
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              OneCare closes the information gap between you and your patients after discharge —
              vitals, medications, adherence, and documents in one place. Less phone tag, fewer
              avoidable readmissions.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild className="gradient-primary border-0">
                <Link to="/clinician/sign-up">
                  Start free <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing?audience=clinicians">See plans</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1.5">
              <Clock className="h-3 w-3" /> Set up in under 15 minutes · No credit card required
            </p>
          </motion.div>
        </div>
      </section>

      {/* Value props */}
      <section className="py-20 bg-background">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
              Everything you need to keep patients connected
            </h2>
            <p className="text-muted-foreground">
              The post-discharge tools you wished your EHR had — without the EHR price tag.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {valueProps.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-1.5">{title}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="py-20 bg-muted/30">
        <div className="container px-4 max-w-3xl">
          <h2 className="font-display text-3xl font-bold mb-8 text-center">Why OneCare</h2>
          <ul className="space-y-3">
            {differentiators.map((d) => (
              <li key={d} className="flex items-start gap-3 bg-background rounded-lg p-4 border">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm md:text-base">{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container px-4 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="rounded-3xl gradient-primary p-10 md:p-14 text-center"
          >
            <h2 className="font-display text-3xl font-bold text-primary-foreground mb-3">
              Try OneCare with your next patient
            </h2>
            <p className="text-primary-foreground/90 mb-6 max-w-xl mx-auto">
              Sign up, invite one patient, see their vitals and adherence in your dashboard within
              the hour. If it doesn't change how you follow up, we want to hear why.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/clinician/sign-up">Create clinician account</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="bg-transparent text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/10">
                <Link to="/contact">Book a 15-minute demo</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
