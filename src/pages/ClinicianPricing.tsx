import { useState } from 'react';
import { SEOHead } from '@/components/seo/SEOHead';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Check, 
  X, 
  ArrowRight, 
  Loader2, 
  Building2, 
  Users, 
  Shield, 
  Clock,
  Zap,
  HeartPulse,
  FileText,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianSubscription, CLINICIAN_TIER_INFO, ClinicianTier } from '@/hooks/useClinicianSubscription';
import {
  ENTERPRISE_INCLUDED,
  ENTERPRISE_ONBOARDING_FEE,
  ENTERPRISE_FROM_PRICE,
  PRICING_ROADMAP,
  STAFF_SEAT_PRICE,
} from '@/lib/pricing-constants';

const ClinicianPricing = ({ audienceSlot }: { audienceSlot?: React.ReactNode } = {}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isClinician } = useClinicianProfile();
  const { subscription, createCheckout, loading, tier: currentTier } = useClinicianSubscription();
  const [showAnnual, setShowAnnual] = useState(false);

  type CardTier = 'community' | 'solo' | 'pro' | 'clinic' | 'enterprise';

  const tiers: { key: CardTier; highlight?: boolean }[] = [
    { key: 'community' },
    { key: 'solo' },
    { key: 'pro', highlight: true },
    { key: 'clinic' },
    { key: 'enterprise' },
  ];

  const handleSubscribe = async (tier: CardTier) => {
    if (!user) {
      navigate('/clinician/sign-up');
      return;
    }
    
    if (!isClinician) {
      navigate('/clinician/sign-up');
      return;
    }

    if (tier === 'community') {
      navigate('/clinician/sign-up');
      return;
    }

    if (tier === 'enterprise') {
      navigate('/clinician/enterprise-inquiry');
      return;
    }

    // Clinic has no Stripe price yet, so it is arranged with us rather than
    // sent to a checkout that would fail.
    if (tier === 'clinic') {
      navigate('/contact');
      return;
    }

    await createCheckout(tier);
  };


  const isCurrentTier = (tier: string) => {
    return currentTier === tier && subscription?.subscribed;
  };

  const getAnnualPrice = (monthlyPrice: number) => {
    return Math.round(monthlyPrice * 10); // 2 months free
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Clinician Plans & Pricing — For Healthcare Providers"
        description="HIPAA-ready clinician tools: Community free for community health workers, Individual $99/mo, Practice $299/mo, Clinic $649/mo, Enterprise from $2,500/mo for hospitals."
        canonical="/clinician/pricing"
      />
      {isClinician ? <ClinicianHeader /> : <Header />}

      {audienceSlot && (
        <div className="container px-4 pt-6">{audienceSlot}</div>
      )}

      <main className="container py-12 px-4">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-12"
        >
          <Badge variant="outline" className="mb-4">
            <HeartPulse className="h-3 w-3 mr-1" />
            For Healthcare Professionals
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl font-bold mb-4">
            Clinician Plans
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Empower your practice with continuous patient monitoring, clinical guidance tools, 
            and seamless care coordination—all at a fraction of traditional EHR costs. Community health workers and underfunded clinics start free.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className={showAnnual ? 'text-muted-foreground' : 'font-medium'}>Monthly</span>
            <Switch
              checked={showAnnual}
              onCheckedChange={setShowAnnual}
            />
            <span className={!showAnnual ? 'text-muted-foreground' : 'font-medium'}>
              Annual
              <Badge variant="secondary" className="ml-2 text-xs">
                Save 17%
              </Badge>
            </span>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 max-w-7xl mx-auto mb-6">
          {tiers.map(({ key, highlight }, index) => {
            const tierInfo = CLINICIAN_TIER_INFO[key];
            // Community is free and Enterprise is quoted, so neither has an
            // annual figure to show — only the two self-serve plans do.
            const isBillable = key === 'solo' || key === 'pro' || key === 'clinic';
            const price = isBillable && showAnnual ? getAnnualPrice(tierInfo.price) : tierInfo.price;
            const period = isBillable && showAnnual ? 'year' : 'month';
            
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`h-full relative ${highlight ? 'border-primary shadow-lg xl:scale-[1.02]' : ''}`}>
                  {highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="gradient-primary border-0">Most Popular</Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-2xl">{tierInfo.name}</CardTitle>
                    <CardDescription>
                      {key === 'community' && 'For community health workers & underfunded clinics'}
                      {key === 'solo' && 'For independent practitioners'}
                      {key === 'pro' && 'For small practices'}
                      {key === 'clinic' && 'For larger clinics and multi-site groups'}
                      {key === 'enterprise' && 'For institutions and hospitals'}
                    </CardDescription>
                    
                    <div className="pt-4">
                      {key === 'enterprise' && (
                        <span className="text-sm text-muted-foreground">From </span>
                      )}
                      <span className="text-4xl font-bold">${price.toLocaleString()}</span>
                      <span className="text-muted-foreground">/{period}</span>
                    </div>
                    
                    {isBillable && showAnnual && (
                      <p className="text-sm text-green-600">
                        ${(tierInfo.price * 2).toLocaleString()} savings vs monthly
                      </p>
                    )}
                    
                    <p className="text-sm font-medium text-primary mt-2">
                      {`Up to ${tierInfo.patientLimit.toLocaleString('en-US')} patients`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tierInfo.storage} document storage
                    </p>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <ul className="space-y-3">
                      {tierInfo.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {key === 'enterprise' && (
                      <p className="text-xs text-muted-foreground">
                        Enterprise is quoted: the final price depends on departments, clinicians,
                        storage and the integrations you choose.
                      </p>
                    )}
                    
                    <Button
                      className={`w-full ${highlight ? 'gradient-primary border-0' : ''}`}
                      variant={highlight ? 'default' : 'outline'}
                      onClick={() => handleSubscribe(key)}
                      disabled={loading || isCurrentTier(key)}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : isCurrentTier(key) ? (
                        'Current Plan'
                      ) : key === 'enterprise' ? (
                        <>Talk to Sales <ArrowRight className="h-4 w-4 ml-2" /></>
                      ) : key === 'clinic' ? (
                        <>Talk to us <ArrowRight className="h-4 w-4 ml-2" /></>
                      ) : key === 'community' ? (
                        <>Start Free <ArrowRight className="h-4 w-4 ml-2" /></>
                      ) : (
                        <>Get Started <ArrowRight className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>



        <div className="max-w-3xl mx-auto mb-16 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            Every non-clinical staff member needs a staff seat at ${STAFF_SEAT_PRICE}/month. No staff
            seats are included in any plan.
          </p>
          <p>Need more minutes or seats? Owners can add them any time from their account.</p>
          <p>
            Over a limit, you can still see and use everything you already have. Limits only stop new
            patients, seats, scribe minutes and uploads.
          </p>
          <p>
            Support: priority support is Clinic and above. Everyone else uses the guides, the AI help
            assistant and email, on a best-effort basis with no response-time promise.
          </p>
        </div>

        {/* Feature Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-5xl mx-auto mb-16"
        >
          <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Feature</th>
                  <th className="text-center py-3 px-4">Community</th>
                  <th className="text-center py-3 px-4">Individual</th>
                  <th className="text-center py-3 px-4">Practice</th>
                  <th className="text-center py-3 px-4">Clinic</th>
                  <th className="text-center py-3 px-4">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Clinician seats', community: '1', solo: '1', pro: '3 included, extra $49/mo', clinic: '10 included, extra $45/mo (up to 30)', enterprise: '25' },
                  { feature: 'Staff seats', community: false, solo: false, pro: `$${STAFF_SEAT_PRICE}/mo each, none included`, clinic: `$${STAFF_SEAT_PRICE}/mo each, none included`, enterprise: 'Scoped in agreement' },
                  { feature: 'Patient limit', community: '25', solo: '150', pro: '1,000', clinic: '3,500', enterprise: '5,000' },
                  { feature: 'Storage', community: '500 MB', solo: '10 GB', pro: '30 GB + 10 GB per added clinician', clinic: '100 GB + 10 GB per added clinician', enterprise: '1 TB' },
                  { feature: 'Vitals, medications & adherence', community: true, solo: true, pro: true, clinic: true, enterprise: true },
                  { feature: 'Vital alerts', community: true, solo: true, pro: true, clinic: true, enterprise: true },
                  { feature: 'Custom alert thresholds', community: false, solo: true, pro: true, clinic: true, enterprise: true },
                  { feature: 'Secure patient messaging', community: true, solo: true, pro: true, clinic: true, enterprise: true },
                  { feature: 'Clinical guidance tools', community: true, solo: true, pro: true, clinic: true, enterprise: true },
                  { feature: 'Encounters, templates & referrals', community: false, solo: true, pro: true, clinic: true, enterprise: true },
                  { feature: 'Ambient scribe', community: 'No', solo: 'No', pro: '900 min/mo (pooled)', clinic: '3,000 min/mo (pooled)', enterprise: '15,000 min/mo' },
                  { feature: 'Assistant actions', community: 'Read-only', solo: true, pro: true, clinic: true, enterprise: true },
                  { feature: 'Team management & analytics', community: false, solo: false, pro: true, clinic: true, enterprise: true },
                  { feature: 'Invoicing & revenue tracking', community: false, solo: false, pro: true, clinic: true, enterprise: true },
                  { feature: 'Compliance & audit exports', community: false, solo: false, pro: true, clinic: true, enterprise: true },
                  { feature: 'Multi-site routing', community: false, solo: false, pro: false, clinic: true, enterprise: true },
                  { feature: 'Departments & sub-admins', community: false, solo: false, pro: false, clinic: false, enterprise: true },
                  { feature: 'Custom subdomain & branding', community: false, solo: false, pro: false, clinic: false, enterprise: true },
                  { feature: 'Single sign-on (SSO)', community: false, solo: false, pro: false, clinic: false, enterprise: true },
                  { feature: 'EHR/FHIR connections', community: false, solo: false, pro: false, clinic: false, enterprise: true },
                  { feature: 'HIPAA BAA', community: false, solo: false, pro: false, clinic: false, enterprise: true },
                  { feature: 'Support', community: 'Guides, AI help & email', solo: 'Guides, AI help & email', pro: 'Guides, AI help & email', clinic: 'Priority', enterprise: 'Priority' },
                ].map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-3 px-4 font-medium">{row.feature}</td>
                    {(['community', 'solo', 'pro', 'clinic', 'enterprise'] as const).map((col) => {
                      const value = row[col];
                      return (
                        <td key={col} className="text-center py-3 px-4">
                          {typeof value === 'boolean' ? (
                            value ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />
                          ) : value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        </motion.div>

        {/* Enterprise & hospital sizes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="max-w-5xl mx-auto mb-16"
        >
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Enterprise &amp; hospitals</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Enterprise starts at ${ENTERPRISE_FROM_PRICE.toLocaleString('en-US')}/month for institutions
              and hospitals. We scope it with you, so the final price depends on departments, clinicians,
              storage and the integrations you choose. Onboarding assistance is a paid service: a one-time
              ${ENTERPRISE_ONBOARDING_FEE.toLocaleString('en-US')}, covering multi-department setup,
              staff onboarding and EHR integration scope.
            </p>
          </div>

          <Card className="max-w-2xl mx-auto border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                What the entry price includes
              </CardTitle>
              <CardDescription>
                From ${ENTERPRISE_FROM_PRICE.toLocaleString('en-US')}/month, quoted after scoping
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                {ENTERPRISE_INCLUDED.map((m) => (
                  <li key={m} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/clinician/enterprise-inquiry">Talk to us</Link>
              </Button>
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Institutions that want to bring their patients onto OneCare under a partnership agreement can{' '}
            <Link to="/contact" className="underline underline-offset-2">talk to us</Link>.
          </p>

          <div className="mt-6 rounded-xl border border-dashed p-4">
            <p className="text-sm font-medium mb-2">Seats, storage and what is coming</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              {PRICING_ROADMAP.map((r) => (
                <li key={r.label} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="text-foreground font-medium">{r.label}</span> — {r.detail}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{r.when}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Value Props */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-5xl mx-auto mb-16"
        >
          {[
            { icon: Clock, title: 'Setup in Minutes', desc: 'No IT department needed' },
            { icon: Shield, title: 'HIPAA Ready', desc: 'Enterprise BAA included' },
            { icon: Zap, title: 'Vital Alerts', desc: 'Never miss a critical reading' },
            { icon: Users, title: 'Patient-Friendly', desc: 'Easy onboarding for patients' },
          ].map(({ icon: Icon, title, desc }, i) => (
            <div key={i} className="text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Why OneCare banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="max-w-4xl mx-auto mb-16"
        >
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
              <div>
                <h3 className="font-semibold text-lg mb-1">Why choose OneCare over traditional EHRs?</h3>
                <p className="text-sm text-muted-foreground">
                  See how we compare to Epic, Veradigm, athenahealth, and other patient portals
                </p>
              </div>
              <Button variant="outline" asChild className="shrink-0">
                <Link to="/clinician/why-onecare">
                  Compare Platforms
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center bg-muted/50 rounded-2xl p-8 max-w-2xl mx-auto"
        >
          <h2 className="text-2xl font-bold mb-3">Questions?</h2>
          <p className="text-muted-foreground mb-6">
            Our team is here to help you find the right plan for your practice.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="outline" asChild>
              <Link to="/contact">
                <Phone className="h-4 w-4 mr-2" />
                Contact Us
              </Link>
            </Button>
            <Button asChild>
              <Link to="/clinician/sign-up">
                Start Free Trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default ClinicianPricing;
