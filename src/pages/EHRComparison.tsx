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
  Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const EHRComparison = () => {
  const comparisonData = [
    {
      feature: "Data Ownership",
      onecare: "Patients own & control their data",
      traditional: "Data locked in practice systems",
      onecareDetail: "Share with any provider via invite codes",
      traditionalDetail: "Patients must request records"
    },
    {
      feature: "Family Management",
      onecare: "Track entire family in one account",
      traditional: "Individual patient records only",
      onecareDetail: "Medications, vitals, schedules for all members",
      traditionalDetail: "Separate logins per patient"
    },
    {
      feature: "Real-time Communication",
      onecare: "Bidirectional guidance system",
      traditional: "One-way push from EHR",
      onecareDetail: "Patients acknowledge, status updates instantly",
      traditionalDetail: "No patient feedback loop"
    },
    {
      feature: "Caregiver Integration",
      onecare: "Care Circle with auto-alerts",
      traditional: "No caregiver features",
      onecareDetail: "Notify family when doses missed",
      traditionalDetail: "Manual phone calls required"
    },
    {
      feature: "Multi-Provider Access",
      onecare: "Unlimited simultaneous providers",
      traditional: "Siloed per-practice",
      onecareDetail: "All specialists see same data",
      traditionalDetail: "Fax records between offices"
    },
    {
      feature: "Mobile Experience",
      onecare: "PWA with push notifications",
      traditional: "Desktop-centric interfaces",
      onecareDetail: "Works offline, native-like feel",
      traditionalDetail: "Clunky mobile portals"
    },
    {
      feature: "Cost Model",
      onecare: "Free for patients",
      traditional: "Per-seat practice licensing",
      onecareDetail: "Premium features optional",
      traditionalDetail: "$200-500/provider/month"
    }
  ];

  const advantages = [
    {
      icon: UserCircle,
      title: "Patient-Centric, Not Practice-Centric",
      description: "Traditional EHRs serve the clinic's workflow. OneCare serves the patient's health journey, with clinicians as invited collaborators.",
      color: "bg-primary/10 text-primary"
    },
    {
      icon: Share2,
      title: "True Interoperability",
      description: "No more faxing records. Patients grant access instantly via secure invite codes. All providers see the same real-time data.",
      color: "bg-accent/10 text-accent"
    },
    {
      icon: Heart,
      title: "Whole-Family Health Hub",
      description: "Manage medications, vitals, and appointments for parents, children, and dependents - all in one dashboard.",
      color: "bg-rose/10 text-rose-500"
    },
    {
      icon: Bell,
      title: "Proactive Care Alerts",
      description: "Automated notifications when doses are missed, vitals breach thresholds, or guidance goes unacknowledged.",
      color: "bg-amber/10 text-amber-500"
    },
    {
      icon: Smartphone,
      title: "Mobile-First Design",
      description: "Built as a Progressive Web App. Works on any device, supports push notifications, functions offline.",
      color: "bg-indigo/10 text-indigo-500"
    },
    {
      icon: Shield,
      title: "Privacy by Design",
      description: "Patients control exactly what each provider can see. Revoke access anytime. HIPAA-compliant infrastructure.",
      color: "bg-emerald/10 text-emerald-500"
    }
  ];

  const metrics = [
    { icon: Zap, value: "10x", label: "Faster provider onboarding" },
    { icon: Clock, value: "24/7", label: "Real-time data access" },
    { icon: DollarSign, value: "$0", label: "Cost for patients" },
    { icon: Globe, value: "50+", label: "Countries supported" }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
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
                Internal Document - Not Public
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-foreground">
                Why OneCare Beats{" "}
                <span className="text-primary">Traditional EHR Systems</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                A comparison against Vericlaim, HealthBridge Clinical, and other practice-centric 
                electronic health record systems.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">vs. Vericlaim/Veradigm</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">vs. HealthBridge Clinical</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">vs. Epic/Cerner/Allscripts</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Metrics Section */}
        <section className="py-12 bg-card border-y">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {metrics.map((metric, index) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
                    <metric.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-3xl font-bold text-foreground">{metric.value}</div>
                  <div className="text-sm text-muted-foreground">{metric.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Feature-by-Feature Comparison
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                See how OneCare stacks up against traditional EHR systems across key capabilities.
              </p>
            </motion.div>

            <div className="max-w-5xl mx-auto">
              {/* Table Header */}
              <div className="grid grid-cols-3 gap-4 mb-4 px-4">
                <div className="font-semibold text-muted-foreground">Feature</div>
                <div className="font-semibold text-primary text-center">OneCare</div>
                <div className="font-semibold text-muted-foreground text-center">Traditional EHR</div>
              </div>

              {/* Table Rows */}
              <div className="space-y-3">
                {comparisonData.map((row, index) => (
                  <motion.div
                    key={row.feature}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                  >
                    <Card className="hover-lift">
                      <CardContent className="p-4">
                        <div className="grid grid-cols-3 gap-4 items-start">
                          <div>
                            <div className="font-semibold text-foreground">{row.feature}</div>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <Check className="h-5 w-5 text-status-success" />
                              <span className="text-sm font-medium text-foreground">{row.onecare}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{row.onecareDetail}</p>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <X className="h-5 w-5 text-destructive" />
                              <span className="text-sm font-medium text-muted-foreground">{row.traditional}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{row.traditionalDetail}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Key Advantages Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Key Differentiators
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                The fundamental shifts that make OneCare a different category of health platform.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {advantages.map((advantage, index) => (
                <motion.div
                  key={advantage.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <Card className="h-full hover-lift">
                    <CardHeader>
                      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${advantage.color} mb-2`}>
                        <advantage.icon className="h-6 w-6" />
                      </div>
                      <CardTitle className="text-lg">{advantage.title}</CardTitle>
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

        {/* Integration Strategy Section */}
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
                    <Badge variant="outline" className="w-fit mb-2">Strategy</Badge>
                    <CardTitle className="text-2xl">Integration, Not Replacement</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground">
                      We're not asking clinicians to abandon their existing EHR systems. Instead, OneCare 
                      <strong className="text-foreground"> integrates with</strong> Vericlaim, HealthBridge Clinical, 
                      and other FHIR-compatible systems to become the patient-facing layer.
                    </p>
                    <div className="grid md:grid-cols-2 gap-4 pt-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">Clinicians keep their workflow</div>
                          <div className="text-sm text-muted-foreground">Continue using familiar EHR for documentation</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">Patients get modern UX</div>
                          <div className="text-sm text-muted-foreground">Mobile-first interface they actually want to use</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">Data syncs automatically</div>
                          <div className="text-sm text-muted-foreground">FHIR-based bidirectional integration</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">Bridges care gaps</div>
                          <div className="text-sm text-muted-foreground">Family management, caregiver alerts, multi-provider</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-2xl mx-auto"
            >
              <h2 className="text-3xl font-bold mb-4">Ready to Explore Integration?</h2>
              <p className="text-muted-foreground mb-8">
                If your clinicians are using Vericlaim or HealthBridge Clinical, we can build 
                a seamless connection that enhances their workflow while giving patients a 
                superior experience.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Button size="lg" className="gap-2">
                  View Integration Roadmap
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline">
                  Technical Documentation
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

export default EHRComparison;