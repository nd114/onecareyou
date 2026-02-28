import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart, Shield, Users, Target, Award, Sparkles, ArrowRight, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const values = [
  {
    icon: Share2,
    title: 'Care Continuity',
    description: 'We believe the care relationship shouldn\'t end when you leave the hospital. Marpe keeps you connected to your providers.',
  },
  {
    icon: Users,
    title: 'Patient Empowerment',
    description: 'Every feature puts you in control. Share what you want, with whom you want, when you want.',
  },
  {
    icon: Target,
    title: 'Accuracy & Trust',
    description: 'Our health tracking and medication database are regularly updated and verified for reliability.',
  },
  {
    icon: Award,
    title: 'Privacy & Security',
    description: 'Your health data is encrypted and never sold. We comply with healthcare data protection standards.',
  },
];

const stats = [
  { value: 'Growing', label: 'Community' },
  { value: 'Comprehensive', label: 'Drug Database' },
  { value: 'PWA', label: 'Mobile-Ready' },
  { value: '🔒', label: 'Privacy-First' },
];

const About = () => {
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
              <Heart className="h-4 w-4" />
              <span className="text-sm font-medium">Our Story</span>
            </motion.div>
            
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Eliminating{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Information Asymmetry
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              OneCare was founded to solve a critical gap in healthcare: the disconnect 
              between patients and providers after leaving the hospital. We believe 
              continuous care coordination saves lives.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-muted-foreground mb-6">
                When patients transition from hospital to home, critical health information 
                often gets lost. Doctors lose visibility, patients feel isolated, and 
                preventable complications occur.
              </p>
              <p className="text-lg text-muted-foreground mb-6">
              OneCare bridges this gap by enabling patients to share their health updates (vitals, 
              medications, and lab results) directly with their care team. No more waiting for 
              appointments to communicate critical changes.
              </p>
              <Button asChild className="gradient-primary border-0">
                <Link to="/sign-up">
                  Join Us Today
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="grid grid-cols-2 gap-4"
            >
              {stats.map((stat, index) => (
                <Card key={stat.label} className="text-center hover-lift">
                  <CardContent className="pt-6">
                    <p className="text-3xl font-bold text-primary mb-2">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-24 bg-muted/30">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Our Core Values
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              These principles guide everything we do at OneCare.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full hover-lift">
                  <CardContent className="pt-6">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <value.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{value.title}</h3>
                    <p className="text-sm text-muted-foreground">{value.description}</p>
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
            <Sparkles className="h-12 w-12 text-primary-foreground mx-auto mb-4" />
            <h2 className="font-display text-3xl font-bold text-primary-foreground mb-4">
              Ready to Get Connected?
            </h2>
            <p className="text-lg text-primary-foreground/90 mb-8">
              Join early adopters who stay connected with their healthcare providers.
            </p>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/sign-up">Create Free Account</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
