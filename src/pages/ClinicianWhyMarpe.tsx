import { motion } from "framer-motion";
import { 
  Check, 
  X, 
  Users, 
  Heart, 
  Shield, 
  Smartphone, 
  Bell, 
  Share2,
  Building2,
  UserCircle,
  ArrowRight,
  Zap,
  Clock,
  DollarSign,
  Globe,
  TrendingUp,
  Activity,
  BarChart3,
  FileText,
  Link2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { Footer } from "@/components/layout/Footer";
import { useNavigate } from "react-router-dom";

const ClinicianWhyMarpe = () => {
  const navigate = useNavigate();

  const comparisonData = [
    {
      feature: "Data Ownership Model",
      marpe: { value: "Patient-owned, clinician-invited", good: true },
      veradigm: { value: "Practice-owned, patient requests", good: false },
      epic: { value: "Practice-owned, portal access", good: false },
      healthbridge: { value: "Practice-owned", good: false },
    },
    {
      feature: "Family Management",
      marpe: { value: "Full family health hub", good: true },
      veradigm: { value: "Individual records only", good: false },
      epic: { value: "Proxy access (limited)", good: false },
      healthbridge: { value: "Not available", good: false },
    },
    {
      feature: "Multi-Provider View",
      marpe: { value: "All providers see same data", good: true },
      veradigm: { value: "Siloed per practice", good: false },
      epic: { value: "Care Everywhere (complex)", good: false },
      healthbridge: { value: "Single practice", good: false },
    },
    {
      feature: "Caregiver Alerts",
      marpe: { value: "Automated Care Circle", good: true },
      veradigm: { value: "None", good: false },
      epic: { value: "None", good: false },
      healthbridge: { value: "None", good: false },
    },
    {
      feature: "Real-time Communication",
      marpe: { value: "Bidirectional with status", good: true },
      veradigm: { value: "One-way messaging", good: false },
      epic: { value: "MyChart messages", good: false },
      healthbridge: { value: "Portal messages", good: false },
    },
    {
      feature: "Adherence Analytics",
      marpe: { value: "Dose-level tracking + export", good: true },
      veradigm: { value: "Rx fill data only", good: false },
      epic: { value: "Limited", good: false },
      healthbridge: { value: "Not available", good: false },
    },
    {
      feature: "Mobile Experience",
      marpe: { value: "PWA with push notifications", good: true },
      veradigm: { value: "Desktop-first", good: false },
      epic: { value: "MyChart app", good: false },
      healthbridge: { value: "Basic portal", good: false },
    },
    {
      feature: "Patient Cost",
      marpe: { value: "Free forever", good: true },
      veradigm: { value: "N/A (practice pays)", good: false },
      epic: { value: "Free portal", good: true },
      healthbridge: { value: "N/A", good: false },
    },
    {
      feature: "International Drugs",
      marpe: { value: "190+ countries database", good: true },
      veradigm: { value: "US-only", good: false },
      epic: { value: "US-centric", good: false },
      healthbridge: { value: "Regional", good: false },
    },
  ];

  const uniqueAdvantages = [
    {
      icon: Users,
      title: "Whole-Family Health Hub",
      description: "Track medications, vitals, and appointments for parents, children, and dependents in one dashboard. No other EHR offers this.",
      stat: "5+",
      statLabel: "Family members per account",
      color: "bg-primary/10 text-primary"
    },
    {
      icon: Share2,
      title: "Multi-Provider Transparency",
      description: "Patients share the same data with ALL their providers simultaneously. No more faxing records between offices.",
      stat: "∞",
      statLabel: "Simultaneous providers",
      color: "bg-accent/10 text-accent"
    },
    {
      icon: Bell,
      title: "Caregiver Alert Network",
      description: "Automated notifications to family caregivers when doses are missed. Critical for elderly care and chronic conditions.",
      stat: "24/7",
      statLabel: "Automated monitoring",
      color: "bg-amber-500/10 text-amber-500"
    },
    {
      icon: BarChart3,
      title: "Adherence Analytics Export",
      description: "Dose-level compliance data that your EHR can ingest via FHIR. Insight you can't get from prescription fill data.",
      stat: "95%",
      statLabel: "More granular than Rx fills",
      color: "bg-emerald-500/10 text-emerald-500"
    },
    {
      icon: Globe,
      title: "International Drug Database",
      description: "Medication information for 190+ countries via FDA, EMA, and Mendeley IDD. Serve international patients confidently.",
      stat: "190+",
      statLabel: "Countries covered",
      color: "bg-indigo-500/10 text-indigo-500"
    },
    {
      icon: Link2,
      title: "FHIR Integration Layer",
      description: "Bidirectional sync with your existing EHR. Marpe becomes the patient-facing layer while you keep your workflow.",
      stat: "2-way",
      statLabel: "Data synchronization",
      color: "bg-rose-500/10 text-rose-500"
    },
  ];

  const integrationBenefits = [
    {
      title: "You Keep Your Workflow",
      description: "Continue documenting in Veradigm, Epic, or HealthBridge. Marpe syncs automatically via FHIR."
    },
    {
      title: "Patients Get Modern UX",
      description: "Mobile-first PWA they'll actually use, with push notifications and offline support."
    },
    {
      title: "Fill the Gaps",
      description: "Family management, caregiver alerts, and multi-provider visibility that your EHR doesn't provide."
    },
    {
      title: "Export Adherence Data",
      description: "Dose-level compliance analytics that can be ingested back into your clinical workflow."
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ClinicianHeader />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden gradient-hero">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-4xl mx-auto text-center"
            >
              <Badge variant="secondary" className="mb-4">
                For Clinicians
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-foreground">
                Why Choose{" "}
                <span className="text-primary">Marpe</span>?
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                A patient-centric layer that complements your existing EHR, filling gaps 
                that Veradigm, Epic, and HealthBridge Clinical don't address.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Button size="lg" onClick={() => navigate('/clinician/signup')} className="gradient-primary border-0">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate('/clinician/pricing')}>
                  View Pricing
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Key Message */}
        <section className="py-12 bg-card border-y">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-2xl font-bold mb-4">Integration, Not Replacement</h2>
              <p className="text-muted-foreground text-lg">
                We're not asking you to abandon your EHR. Marpe is the <strong className="text-foreground">patient-facing layer</strong> that 
                integrates with your existing system, giving patients a modern experience while you keep your clinical workflow.
              </p>
            </div>
          </div>
        </section>

        {/* Unique Advantages Grid */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Capabilities Your EHR Doesn't Offer
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                These features fill critical gaps in patient engagement and care coordination.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {uniqueAdvantages.map((advantage, index) => (
                <motion.div
                  key={advantage.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <Card className="h-full hover-lift">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${advantage.color}`}>
                          <advantage.icon className="h-6 w-6" />
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">{advantage.stat}</div>
                          <div className="text-xs text-muted-foreground">{advantage.statLabel}</div>
                        </div>
                      </div>
                      <CardTitle className="text-lg mt-3">{advantage.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-sm">{advantage.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Feature Comparison
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                See how Marpe stacks up against traditional EHR patient portals.
              </p>
            </motion.div>

            <div className="max-w-6xl mx-auto overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-semibold">Feature</th>
                    <th className="p-4 text-center">
                      <div className="font-bold text-primary">Marpe</div>
                    </th>
                    <th className="p-4 text-center">
                      <div className="font-semibold text-muted-foreground">Veradigm</div>
                    </th>
                    <th className="p-4 text-center">
                      <div className="font-semibold text-muted-foreground">Epic MyChart</div>
                    </th>
                    <th className="p-4 text-center">
                      <div className="font-semibold text-muted-foreground">HealthBridge</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row, index) => (
                    <motion.tr
                      key={row.feature}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="border-b hover:bg-muted/50"
                    >
                      <td className="p-4 font-medium">{row.feature}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Check className="h-4 w-4 text-status-success flex-shrink-0" />
                          <span className="text-sm">{row.marpe.value}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {row.veradigm.good ? (
                            <Check className="h-4 w-4 text-status-success flex-shrink-0" />
                          ) : (
                            <X className="h-4 w-4 text-destructive flex-shrink-0" />
                          )}
                          <span className="text-sm text-muted-foreground">{row.veradigm.value}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {row.epic.good ? (
                            <Check className="h-4 w-4 text-status-success flex-shrink-0" />
                          ) : (
                            <X className="h-4 w-4 text-destructive flex-shrink-0" />
                          )}
                          <span className="text-sm text-muted-foreground">{row.epic.value}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {row.healthbridge.good ? (
                            <Check className="h-4 w-4 text-status-success flex-shrink-0" />
                          ) : (
                            <X className="h-4 w-4 text-destructive flex-shrink-0" />
                          )}
                          <span className="text-sm text-muted-foreground">{row.healthbridge.value}</span>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Integration Strategy */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                  <CardHeader>
                    <Badge variant="outline" className="w-fit mb-2">How It Works</Badge>
                    <CardTitle className="text-2xl">Seamless EHR Integration</CardTitle>
                    <CardDescription>
                      Marpe connects to your existing system via FHIR, becoming the patient engagement layer
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      {integrationBenefits.map((benefit, index) => (
                        <div key={benefit.title} className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-primary">{index + 1}</span>
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{benefit.title}</div>
                            <div className="text-sm text-muted-foreground">{benefit.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Adherence Data Highlight */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="grid md:grid-cols-2 gap-8 items-center"
              >
                <div>
                  <Badge variant="secondary" className="mb-4">Exclusive Data</Badge>
                  <h2 className="text-3xl font-bold mb-4">
                    Medication Adherence Analytics
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Traditional EHRs only see prescription fill data. Marpe tracks <strong className="text-foreground">actual dose-by-dose compliance</strong>, 
                    giving you insight into what happens between pharmacy visits.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-status-success" />
                      <span>Dose-level tracking (not just Rx fills)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-status-success" />
                      <span>Per-medication compliance breakdown</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-status-success" />
                      <span>Time-of-day pattern analysis</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-status-success" />
                      <span>FHIR export for EHR integration</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-card rounded-xl border p-6">
                  <div className="text-center mb-4">
                    <div className="text-5xl font-bold text-primary">87%</div>
                    <div className="text-muted-foreground">30-Day Adherence Rate</div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Metformin 500mg</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-status-success rounded-full" style={{ width: '92%' }} />
                        </div>
                        <span className="font-medium">92%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Lisinopril 10mg</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-status-success rounded-full" style={{ width: '85%' }} />
                        </div>
                        <span className="font-medium">85%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Atorvastatin 20mg</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: '78%' }} />
                        </div>
                        <span className="font-medium">78%</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t text-center">
                    <Button variant="outline" size="sm" className="gap-2">
                      <FileText className="h-4 w-4" />
                      Export to EHR (FHIR)
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-2xl mx-auto"
            >
              <h2 className="text-3xl font-bold mb-4">Ready to Enhance Your Patient Engagement?</h2>
              <p className="text-muted-foreground mb-8">
                Start your 14-day free trial. No credit card required. 
                Connect your existing EHR and see the difference.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Button size="lg" onClick={() => navigate('/clinician/signup')} className="gradient-primary border-0 gap-2">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate('/clinician/enterprise-inquiry')}>
                  Enterprise Inquiry
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ClinicianWhyMarpe;
