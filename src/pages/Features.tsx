import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  Clock, 
  Heart, 
  TrendingUp, 
  Pill, 
  Calendar,
  Bell,
  Users,
  FileText,
  Lock,
  Smartphone,
  Zap,
  ArrowRight,
  Check,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const coreFeatures = [
  {
    icon: Users,
    title: 'Care Circle',
    description: 'Share your health data securely with healthcare providers and caregivers for continuous outpatient care.',
    details: [
      'Invite providers with secure access codes',
      'Granular permission controls',
      'Shared health data access',
      'No appointments needed for updates'
    ]
  },
  {
    icon: TrendingUp,
    title: 'Vitals & Lab Tracking',
    description: 'Monitor your health metrics and share them with your care team in real-time.',
    details: [
      '18+ vital types supported',
      'Upload lab reports with AI extraction',
      'Historical charts and trends',
      'Providers see shared updates'
    ]
  },
  {
    icon: Shield,
    title: 'Drug Interaction Checking',
    description: 'Real-time analysis of potential interactions: keeping both you and your providers informed.',
    details: [
      'Check interactions across all medications',
      'Severity levels from low to high risk',
      'Actionable recommendations',
      'Comprehensive medication database'
    ]
  },
  {
    icon: Smartphone,
    title: 'Photo Medication Identification',
    description: 'Use your camera to identify pills and add medications quickly by scanning barcodes or photos.',
    details: [
      'AI-powered pill identification',
      'Barcode scanning for instant lookup',
      'Automatic dosage and name extraction',
      'Supports many common medications'
    ]
  },
  {
    icon: Clock,
    title: 'Smart Scheduling',
    description: 'Customizable medication reminders that fit your daily routine.',
    details: [
      'Multiple daily time slots',
      'Flexible frequency options',
      'Adherence tracking for providers',
      'Calendar view of doses'
    ]
  },
];

const additionalFeatures = [
  { icon: Pill, title: 'Multi-Type Support', description: 'Track prescriptions, OTC, vitamins, supplements, and herbal remedies' },
  { icon: Heart, title: 'Health Profile', description: 'Store allergies, conditions, blood type: accessible to your care team' },
  { icon: Bell, title: 'Smart Notifications', description: 'Timely reminders that adapt to your schedule' },
  { icon: FileText, title: 'Health Reports', description: 'Export comprehensive reports for doctor visits' },
  { icon: Lock, title: 'Privacy First', description: 'Encrypted storage and secure data transmission' },
  { icon: Share2, title: 'Provider Integration', description: 'Works seamlessly with your healthcare team' },
];

const Features = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-hero py-24">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6"
            >
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">Powerful Features</span>
            </motion.div>
            
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Stay Connected to Your{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Care Team
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Discover the tools designed to keep you connected with your healthcare providers 
              even after leaving the hospital. No more information gaps.
            </p>

            <Button size="lg" asChild className="gradient-primary border-0">
              <Link to="/sign-up">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-24 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Core Features
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The essential tools that keep you connected with your healthcare providers.
            </p>
          </motion.div>

          <div className="space-y-12">
            {coreFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="overflow-hidden">
                  <div className={`grid md:grid-cols-2 ${index % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
                    <CardHeader className={`p-8 ${index % 2 === 1 ? 'md:order-2' : ''}`}>
                      <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <feature.icon className="h-7 w-7 text-primary" />
                      </div>
                      <CardTitle className="text-2xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className={`p-8 bg-muted/30 ${index % 2 === 1 ? 'md:order-1' : ''}`}>
                      <ul className="space-y-3">
                        {feature.details.map((detail) => (
                          <li key={detail} className="flex items-center gap-3">
                            <Check className="h-5 w-5 text-primary flex-shrink-0" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features */}
      <section className="py-24 bg-muted/30">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              And Much More
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Additional features to support your complete health journey.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {additionalFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="h-full hover-lift">
                  <CardContent className="pt-6">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
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
            className="max-w-4xl mx-auto text-center rounded-3xl gradient-primary p-12"
          >
            <h2 className="font-display text-3xl font-bold text-primary-foreground mb-4">
              Ready to Stay Connected?
            </h2>
            <p className="text-lg text-primary-foreground/90 mb-8">
              Start your free account and keep your care team informed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/sign-up">Get Started Free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="bg-transparent border-white/30 text-white hover:bg-white/10">
                <Link to="/pricing">View Pricing</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Features;
