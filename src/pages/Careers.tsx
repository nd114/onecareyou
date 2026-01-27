import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Heart, 
  MapPin, 
  Clock, 
  Briefcase, 
  Users, 
  Globe2, 
  Stethoscope,
  TrendingUp,
  Megaphone,
  ArrowRight,
  Mail,
  CheckCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface JobListing {
  id: string;
  title: string;
  category: string;
  type: 'paid' | 'unpaid';
  commitment: string;
  location: string;
  description: string;
  icon: React.ReactNode;
}

const jobListings: JobListing[] = [
  {
    id: 'sdr',
    title: 'Sales Development Representative',
    category: 'Sales',
    type: 'paid',
    commitment: 'Part-time / Contract',
    location: 'Remote',
    description: 'Drive clinic outreach, schedule demos, and help healthcare providers discover how Marpe can transform patient care coordination.',
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    id: 'content',
    title: 'Healthcare Content Specialist',
    category: 'Marketing',
    type: 'paid',
    commitment: 'Contract',
    location: 'Remote',
    description: 'Create compelling patient education content, case studies, and thought leadership pieces for healthcare professionals.',
    icon: <Megaphone className="h-5 w-5" />,
  },
  {
    id: 'clinical-advisor',
    title: 'Clinical Advisory Board',
    category: 'Advisory',
    type: 'unpaid',
    commitment: 'Flexible',
    location: 'Remote',
    description: 'Physicians and nurses who want to shape the future of remote patient monitoring. Validate features, provide credibility, and help us build what healthcare really needs.',
    icon: <Stethoscope className="h-5 w-5" />,
  },
  {
    id: 'product-panel',
    title: 'Product Feedback Panel',
    category: 'Advisory',
    type: 'unpaid',
    commitment: 'Flexible',
    location: 'Remote',
    description: 'Clinicians who want early access to new features and the opportunity to influence product direction through regular feedback sessions.',
    icon: <Users className="h-5 w-5" />,
  },
];

const values = [
  {
    icon: <Heart className="h-6 w-6" />,
    title: 'Patient-First',
    description: 'Every decision starts with how it impacts patient outcomes and safety.',
  },
  {
    icon: <Globe2 className="h-6 w-6" />,
    title: 'Remote-First',
    description: 'Work from anywhere. We believe great talent isn\'t limited by geography.',
  },
  {
    icon: <Users className="h-6 w-6" />,
    title: 'Lean & Agile',
    description: 'Small team, big impact. Every person here makes a real difference.',
  },
  {
    icon: <Stethoscope className="h-6 w-6" />,
    title: 'Clinical Credibility',
    description: 'We work closely with healthcare professionals to build what they actually need.',
  },
];

const Careers = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 md:py-32 gradient-hero overflow-hidden">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mx-auto text-center"
            >
              <Badge variant="secondary" className="mb-4">
                Join Our Team
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
                Help Us Transform
                <span className="text-primary block mt-2">Patient Care</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                We're building the bridge between patients and their care teams. 
                Join us in making medication management and remote monitoring accessible to everyone.
              </p>
              <Button size="lg" asChild>
                <a href="#positions">
                  View Open Positions
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-16 md:py-24">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Work With Us</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                We're a mission-driven team passionate about improving healthcare through technology.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="h-full text-center hover-lift">
                    <CardHeader>
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
                        {value.icon}
                      </div>
                      <CardTitle className="text-lg">{value.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{value.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Open Positions */}
        <section id="positions" className="py-16 md:py-24 bg-muted/30">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Open Positions</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                We're looking for passionate individuals to join our growing team. 
                All positions are remote-friendly.
              </p>
            </motion.div>

            <div className="max-w-4xl mx-auto space-y-4">
              {jobListings.map((job, index) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="hover-lift">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          {job.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg">{job.title}</h3>
                            <Badge 
                              variant={job.type === 'paid' ? 'default' : 'outline'}
                              className={job.type === 'paid' ? 'bg-green-600 hover:bg-green-700' : ''}
                            >
                              {job.type === 'paid' ? 'Paid' : 'Unpaid Advisory'}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-2">
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3.5 w-3.5" />
                              {job.category}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {job.commitment}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {job.location}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{job.description}</p>
                        </div>
                        <Button variant="outline" size="sm" className="shrink-0" asChild>
                          <a href={`mailto:careers@marpe.care?subject=Application: ${job.title}`}>
                            Apply
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 md:py-24">
          <div className="container px-4">
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-12"
              >
                <h2 className="text-3xl md:text-4xl font-bold mb-4">What We Offer</h2>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  'Flexible, remote-first work environment',
                  'Meaningful work that impacts patient lives',
                  'Direct access to founders and decision-making',
                  'Opportunity to shape a growing healthcare platform',
                  'Competitive compensation (for paid roles)',
                  'Equity options for key contributors',
                  'Learning and growth in a fast-paced startup',
                  'Work with passionate healthcare and tech professionals',
                ].map((benefit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-4 rounded-lg bg-muted/50"
                  >
                    <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 bg-primary text-primary-foreground">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-2xl mx-auto text-center"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Don't See the Right Role?
              </h2>
              <p className="text-primary-foreground/80 mb-8">
                We're always looking for talented people who share our mission. 
                Send us your resume and tell us how you'd like to contribute.
              </p>
              <Button size="lg" variant="secondary" asChild>
                <a href="mailto:careers@marpe.care">
                  <Mail className="mr-2 h-4 w-4" />
                  Get in Touch
                </a>
              </Button>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Careers;
