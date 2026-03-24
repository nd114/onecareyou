import { motion } from 'framer-motion';
import { SEOHead } from '@/components/seo/SEOHead';
import { organizationSchema, webApplicationSchema } from '@/components/seo/structuredData';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  Clock, 
  Heart, 
  TrendingUp, 
  Pill, 
  Calendar,
  Check,
  ArrowRight,
  Sparkles,
  Users,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { Footer } from '@/components/layout/Footer';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';

const features = [
  {
    icon: Share2,
    title: 'Care Coordination',
    description: 'Seamlessly share your health data with doctors, specialists, and caregivers for continuous outpatient care.',
  },
  {
    icon: Users,
    title: 'Provider Access',
    description: 'Give your healthcare providers shared access to your vitals and medications without appointments.',
  },
  {
    icon: TrendingUp,
    title: 'Health Tracking',
    description: 'Track vitals, medications, and lab results. Your care team sees updates when shared.',
  },
  {
    icon: Shield,
    title: 'Safety Alerts',
    description: 'Automatic medication interaction checking keeps you and your providers informed of risks.',
  },
  {
    icon: Clock,
    title: 'Smart Scheduling',
    description: 'Intelligent medication reminders that adapt to your lifestyle with customizable time slots.',
  },
  {
    icon: Heart,
    title: 'Health Profile',
    description: 'Store allergies, conditions, and emergency contacts: instantly accessible to your care team.',
  },
];

const howItWorks = [
  {
    step: 1,
    title: 'Sign Up & Set Up Your Profile',
    description: 'Create your account, add your health information, allergies, and medications.',
  },
  {
    step: 2,
    title: 'Track Your Health Daily',
    description: 'Log vitals, take medications on schedule, and use photo scanning to add new medications.',
  },
  {
    step: 3,
    title: 'Invite Your Care Team',
    description: 'Generate secure share links for your doctors and caregivers to access your data.',
  },
  {
    step: 4,
    title: 'Stay Connected Continuously',
    description: 'Your providers see your shared updates. Receive guidance and instructions directly in the app.',
  },
];

import { LANDING_FREE_FEATURES, LANDING_PREMIUM_FEATURES } from '@/lib/pricing-constants';

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Everything you need for daily health tracking',
    features: [...LANDING_FREE_FEATURES],
    cta: 'Start Free',
    popular: false,
  },
  {
    name: 'Premium',
    price: '$9.99',
    period: '/month',
    description: 'Deeper insights for proactive health management',
    features: [...LANDING_PREMIUM_FEATURES],
    cta: 'Unlock Full Access',
    popular: true,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const Landing = () => {
  const { isClinician } = useClinicianProfile();

  return (
    <div className="min-h-screen flex flex-col">
      {isClinician ? <ClinicianHeader /> : <Header />}
      
      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-hero">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(69,162,158,0.15),transparent)]" />
        <div className="container relative py-24 md:py-32 lg:py-40">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6"
            >
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Early Access Beta</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wide">Beta</span>
            </motion.div>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Bridge the Gap Between{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Patient & Provider
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              OneCare eliminates information asymmetry. Continue sharing your health updates with doctors 
              after leaving the hospital - no appointments needed. Your care team stays informed.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="gradient-primary border-0 text-lg h-12 px-8">
                <Link to="/sign-up">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg h-12 px-8" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                Learn More
              </Button>
            </div>
            
            <div className="mt-6 text-sm text-muted-foreground">
              <span>Are you a healthcare provider? </span>
              <Link to="/clinician/sign-up" className="text-primary font-medium hover:underline">
                Register as a Clinician →
              </Link>
            </div>
          </motion.div>

          {/* Hero Image/Illustration */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-16 max-w-5xl mx-auto"
          >
            <div className="relative rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
              <div className="p-6 md:p-8">
                {/* Mock Dashboard Preview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {['Adherence', 'Daily Doses', 'Health Markers', 'Providers'].map((label, i) => (
                    <div key={label} className={`p-4 rounded-xl text-primary-foreground stat-card-${i + 1}`}>
                      <p className="text-sm opacity-90">{label}</p>
                      <p className="text-2xl font-bold">{[87, 6, 4, 2][i]}{i === 0 ? '%' : ''}</p>
                    </div>
                  ))}
                </div>
                <div className="h-32 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Users className="h-8 w-8 mx-auto mb-2 text-primary/60" />
                    <span className="text-sm">Continuous Care Coordination</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Continuous Care,{' '}
              <span className="text-primary">Beyond the Hospital</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Give your healthcare providers visibility into your health journey—even after you leave the hospital.
            </p>
          </motion.div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature, index) => (
              <motion.div key={feature.title} variants={item}>
                <Card className="h-full hover-lift border-border/50 bg-card/50">
                  <CardHeader>
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-muted/30">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start free and upgrade when you need more. No hidden fees.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`h-full relative ${plan.popular ? 'border-primary shadow-lg shadow-primary/10' : 'border-border/50'}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold gradient-primary text-primary-foreground">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="pt-4">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-3">
                          <Check className="h-5 w-5 text-primary flex-shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button 
                      className={`w-full ${plan.popular ? 'gradient-primary border-0' : ''}`}
                      variant={plan.popular ? 'default' : 'outline'}
                      asChild
                    >
                      <Link to="/sign-up">{plan.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Get started in minutes and stay connected with your healthcare team.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {howItWorks.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="text-center">
                  <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center mx-auto mb-4 text-primary-foreground text-2xl font-bold">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                {index < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[calc(50%+40px)] w-[calc(100%-80px)] h-0.5 bg-border" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center rounded-3xl gradient-primary p-12 md:p-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to Connect with Your Care Team?
            </h2>
            <p className="text-lg text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
              Join early adopters who stay connected with their healthcare providers 
              after leaving the hospital. Start your free account today.
            </p>
            <Button size="lg" variant="secondary" asChild className="text-lg h-12 px-8">
              <Link to="/sign-up">
                Create Free Account
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Landing;
