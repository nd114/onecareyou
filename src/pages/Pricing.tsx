import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, X, Sparkles, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for getting started with medication tracking',
    features: [
      { text: 'Track up to 3 medications', included: true },
      { text: 'Basic interaction checking', included: true },
      { text: 'Daily schedule view', included: true },
      { text: 'Health profile storage', included: true },
      { text: 'Mobile-friendly access', included: true },
      { text: 'Vitals tracking', included: false },
      { text: 'Care Circle sharing', included: false },
      { text: 'AI lab report parsing', included: false },
      { text: 'Health reports export', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: 'Start Free',
    popular: false,
  },
  {
    name: 'Premium',
    price: '$9.99',
    period: '/month',
    description: 'For comprehensive health management',
    features: [
      { text: 'Unlimited medications', included: true },
      { text: 'Advanced interaction database', included: true },
      { text: 'Daily schedule view', included: true },
      { text: 'Health profile storage', included: true },
      { text: 'Mobile-friendly access', included: true },
      { text: 'Vitals & lab tracking', included: true },
      { text: 'Care Circle sharing', included: true },
      { text: 'AI lab report parsing', included: true },
      { text: 'Health reports export', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Go Premium',
    popular: true,
  },
  {
    name: 'Family',
    price: '$19.99',
    period: '/month',
    description: 'Manage health for the whole family',
    features: [
      { text: 'Up to 5 family members', included: true },
      { text: 'All Premium features', included: true },
      { text: 'Family dashboard', included: true },
      { text: 'Caregiver access controls', included: true },
      { text: 'Shared reminders', included: true },
      { text: 'Family health calendar', included: true },
      { text: 'Multi-user Care Circle', included: true },
      { text: 'Bulk report export', included: true },
      { text: 'Family analytics', included: true },
      { text: 'Dedicated support', included: true },
    ],
    cta: 'Start Family Plan',
    popular: false,
  },
];

const faqs = [
  {
    question: 'Can I switch plans at any time?',
    answer: 'Yes! You can upgrade or downgrade your plan at any time. If you upgrade, you\'ll be charged the prorated difference. If you downgrade, the change will take effect at the end of your billing cycle.',
  },
  {
    question: 'Is there a free trial for Premium?',
    answer: 'Yes, we offer a 14-day free trial for Premium plans. You can try all features risk-free before committing.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, MasterCard, American Express) as well as PayPal and Apple Pay.',
  },
  {
    question: 'Is my health data secure?',
    answer: 'Absolutely. We use bank-level encryption to protect your data. Your health information is never sold or shared with third parties. See our Privacy Policy for details.',
  },
  {
    question: 'Can I cancel my subscription?',
    answer: 'Yes, you can cancel anytime from your account settings. Your data will remain accessible, and you\'ll continue to have access until the end of your billing period.',
  },
  {
    question: 'Do you offer refunds?',
    answer: 'We offer a 30-day money-back guarantee. If you\'re not satisfied with Premium, contact us within 30 days for a full refund.',
  },
];

const Pricing = () => {
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
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Simple Pricing</span>
            </motion.div>
            
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
              Choose the Plan That{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Fits Your Needs
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start free and upgrade when you're ready. No hidden fees, cancel anytime.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
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
                        <li key={feature.text} className="flex items-center gap-3">
                          {feature.included ? (
                            <Check className="h-5 w-5 text-primary flex-shrink-0" />
                          ) : (
                            <X className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                          )}
                          <span className={`text-sm ${!feature.included ? 'text-muted-foreground/50' : ''}`}>
                            {feature.text}
                          </span>
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

      {/* FAQs */}
      <section className="py-24 bg-muted/30">
        <div className="container max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
              <HelpCircle className="h-4 w-4" />
              <span className="text-sm font-medium">FAQs</span>
            </div>
            <h2 className="font-display text-3xl font-bold mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground">
              Everything you need to know about our pricing.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
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
              Still Have Questions?
            </h2>
            <p className="text-lg text-primary-foreground/90 mb-8">
              Our team is here to help. Reach out anytime.
            </p>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/contact">Contact Us</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Pricing;
