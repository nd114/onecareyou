import { useState } from 'react';
import { SEOHead } from '@/components/seo/SEOHead';
import { breadcrumbSchema, productSchema } from '@/components/seo/structuredData';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, X, Sparkles, HelpCircle, Crown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { STRIPE_PRICES, PRICE_INFO, FREE_FEATURE_DETAIL, PREMIUM_FEATURE_DETAIL, COMING_SOON_FEATURES } from '@/lib/pricing-constants';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const freeFeatures = FREE_FEATURE_DETAIL;
const premiumFeatures = PREMIUM_FEATURE_DETAIL;

const faqs = [
  {
    question: 'Can I switch plans at any time?',
    answer: 'Yes! You can upgrade to Premium at any time. If you downgrade, the change will take effect at the end of your current billing period.',
  },
  {
    question: 'What\'s the difference between Free and Premium?',
    answer: 'The Free plan lets you track up to 3 medications with all core features including vitals tracking and Care Circle sharing. Premium unlocks unlimited medications, family member profiles, AI lab report parsing, health reports export, and more.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards including Visa, MasterCard, and American Express.',
  },
  {
    question: 'Can I cancel my subscription?',
    answer: 'Yes, you can cancel anytime from your account settings. You\'ll continue to have Premium access until the end of your current billing period.',
  },
  {
    question: 'Is my health data secure?',
    answer: 'Yes, we take data security seriously. Your health information is encrypted and never sold or shared with third parties. See our Privacy Policy for full details on how we protect your data.',
  },
  {
    question: 'How does billing work?',
    answer: 'You can choose monthly or annual billing. Annual plans offer significant savings. Your subscription will automatically renew unless you cancel before the renewal date.',
  },
];

const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true);
  const { user, profile } = useAuth();
  const { createCheckout, loading, isPremium } = useSubscription();

  const monthlyPrice = PRICE_INFO.premium_monthly.price;
  const annualPrice = PRICE_INFO.premium_annual.price;
  const annualMonthly = (annualPrice / 12).toFixed(2);
  const savingsPercent = Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100);

  const handleSubscribe = () => {
    const priceId = isAnnual ? STRIPE_PRICES.premium_annual : STRIPE_PRICES.premium_monthly;
    createCheckout(priceId);
  };

  const currentTier = profile?.subscription_tier || 'free';
  const isCurrentPlan = (plan: string) => {
    if (plan === 'free') return currentTier === 'free';
    if (plan === 'premium') return currentTier === 'premium' || currentTier === 'family' || currentTier === 'enterprise';
    return false;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead
        title="Pricing — Free & Premium Health Tracking Plans"
        description="Compare OneCare plans. Start free with medication tracking and vitals monitoring. Upgrade to Premium for unlimited medications, health vault, AI lab parsing, and family profiles."
        canonical="/pricing"
        jsonLd={[
          breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }]),
          productSchema('OneCare Premium', 'Premium health tracking with unlimited medications, family profiles, and AI-powered features', '9.99'),
        ]}
      />
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
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Start free and upgrade when you're ready. No hidden fees, cancel anytime.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-3">
              <span className={`text-sm font-medium ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
                Monthly
              </span>
              <Switch
                checked={isAnnual}
                onCheckedChange={setIsAnnual}
              />
              <span className={`text-sm font-medium ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
                Annual
              </span>
              {isAnnual && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  Save {savingsPercent}%
                </Badge>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Card className={`h-full relative ${isCurrentPlan('free') ? 'border-primary shadow-lg' : 'border-border/50'}`}>
                {isCurrentPlan('free') && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                      Your Current Plan
                    </span>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl">Free</CardTitle>
                  <CardDescription>Everything you need for daily health tracking</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-muted-foreground">/forever</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <ul className="space-y-3 mb-8">
                    {freeFeatures.map((feature) => (
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
                    className="w-full"
                    variant="outline"
                    asChild
                    disabled={isCurrentPlan('free')}
                  >
                    <Link to={user ? "/dashboard" : "/sign-up"}>
                      {isCurrentPlan('free') ? 'Current Plan' : 'Get Started'}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Premium Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <Card className={`h-full relative ${isCurrentPlan('premium') ? 'border-primary shadow-lg shadow-primary/10' : 'border-primary/50 shadow-lg shadow-primary/10'}`}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold gradient-primary text-primary-foreground flex items-center gap-1">
                    <Crown className="h-3 w-3" />
                    {isCurrentPlan('premium') ? 'Your Current Plan' : 'Most Popular'}
                  </span>
                </div>
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl">Premium</CardTitle>
                  <CardDescription>Deeper insights for proactive health management</CardDescription>
                  <div className="pt-4">
                    {isAnnual ? (
                      <>
                        <span className="text-4xl font-bold">${annualMonthly}</span>
                        <span className="text-muted-foreground">/month</span>
                        <p className="text-sm text-muted-foreground mt-1">
                          Billed ${annualPrice}/year
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-bold">${monthlyPrice}</span>
                        <span className="text-muted-foreground">/month</span>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <ul className="space-y-3 mb-8">
                    {premiumFeatures.map((feature) => (
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
                  {user ? (
                    isCurrentPlan('premium') ? (
                      <Button className="w-full" variant="outline" disabled>
                        Current Plan
                      </Button>
                    ) : (
                      <Button 
                        className="w-full gradient-primary border-0"
                        onClick={handleSubscribe}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Crown className="mr-2 h-4 w-4" />
                            Unlock Full Access
                          </>
                        )}
                      </Button>
                    )
                  ) : (
                    <Button className="w-full gradient-primary border-0" asChild>
                      <Link to="/sign-up">Get Started</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Coming Soon Roadmap */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-md mx-auto mt-12 text-center"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Coming Soon</h3>
            <div className="flex flex-wrap justify-center gap-2">
              {COMING_SOON_FEATURES.map((feature) => (
                <Badge key={feature} variant="outline" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>
          </motion.div>

          {/* Clinician Link */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-sm text-muted-foreground mt-8"
          >
            Are you a healthcare provider?{' '}
            <Link to="/clinician/pricing" className="text-primary hover:underline font-medium">
              View clinician plans
            </Link>
          </motion.p>
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
