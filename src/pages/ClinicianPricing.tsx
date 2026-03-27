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

const ClinicianPricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isClinician } = useClinicianProfile();
  const { subscription, createCheckout, loading, tier: currentTier } = useClinicianSubscription();
  const [showAnnual, setShowAnnual] = useState(false);

  const tiers: { key: 'solo' | 'pro' | 'enterprise'; highlight?: boolean }[] = [
    { key: 'solo' },
    { key: 'pro', highlight: true },
    { key: 'enterprise' },
  ];

  const handleSubscribe = async (tier: 'solo' | 'pro' | 'enterprise') => {
    if (!user) {
      navigate('/clinician/sign-up');
      return;
    }
    
    if (!isClinician) {
      navigate('/clinician/sign-up');
      return;
    }

    if (tier === 'enterprise') {
      navigate('/clinician/enterprise-inquiry');
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
        description="HIPAA-ready clinician portal with continuous patient monitoring, clinical guidance tools, and care coordination. Start free or choose a plan that fits your practice."
        canonical="/clinician/pricing"
      />
      {isClinician ? <ClinicianHeader /> : <Header />}
      
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
            and seamless care coordination—all at a fraction of traditional EHR costs.
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
          {tiers.map(({ key, highlight }, index) => {
            const tierInfo = CLINICIAN_TIER_INFO[key];
            const price = showAnnual ? getAnnualPrice(tierInfo.price) : tierInfo.price;
            const period = showAnnual ? 'year' : 'month';
            
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`h-full relative ${highlight ? 'border-primary shadow-lg scale-105' : ''}`}>
                  {highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="gradient-primary border-0">Most Popular</Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-2xl">{tierInfo.name}</CardTitle>
                    <CardDescription>
                      {key === 'solo' && 'For independent practitioners'}
                      {key === 'pro' && 'For growing practices'}
                      {key === 'enterprise' && 'For healthcare organizations'}
                    </CardDescription>
                    
                    <div className="pt-4">
                      {key === 'enterprise' && (
                        <span className="text-sm text-muted-foreground">From </span>
                      )}
                      <span className="text-4xl font-bold">${price}</span>
                      <span className="text-muted-foreground">/{period}</span>
                    </div>
                    
                    {showAnnual && (
                      <p className="text-sm text-green-600">
                        ${tierInfo.price * 2} savings vs monthly
                      </p>
                    )}
                    
                    <p className="text-sm font-medium text-primary mt-2">
                      {tierInfo.patientLimit === 999999 
                        ? 'Unlimited patients' 
                        : `Up to ${tierInfo.patientLimit} patients`}
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
                        <>Contact Sales <ArrowRight className="h-4 w-4 ml-2" /></>
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

        {/* Feature Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-4xl mx-auto mb-16"
        >
          <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Feature</th>
                  <th className="text-center py-3 px-4">Solo</th>
                  <th className="text-center py-3 px-4">Pro</th>
                  <th className="text-center py-3 px-4">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Patient Limit', solo: '25', pro: '100', enterprise: 'Unlimited' },
                  { feature: 'Vital Alerts', solo: true, pro: true, enterprise: true },
                  { feature: 'Custom Alert Thresholds', solo: true, pro: true, enterprise: true },
                  { feature: 'Clinical Guidance Tools', solo: true, pro: true, enterprise: true },
                  { feature: 'Patient Adherence Reports', solo: true, pro: true, enterprise: true },
                  { feature: 'Email & Push Notifications', solo: true, pro: true, enterprise: true },
                  { feature: 'Guidance Templates', solo: false, pro: 'Coming soon', enterprise: 'Coming soon' },
                  { feature: 'Analytics Dashboard', solo: 'Basic', pro: 'Coming soon', enterprise: 'Coming soon' },
                  { feature: 'Team Members', solo: false, pro: 'Coming soon', enterprise: 'Coming soon' },
                  { feature: 'EHR/FHIR Integration', solo: false, pro: false, enterprise: true },
                  { feature: 'API Access', solo: false, pro: false, enterprise: 'Coming soon' },
                  { feature: 'HIPAA BAA', solo: false, pro: false, enterprise: true },
                  { feature: 'Support', solo: 'Email', pro: 'Priority', enterprise: 'Dedicated' },
                ].map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-3 px-4 font-medium">{row.feature}</td>
                    <td className="text-center py-3 px-4">
                      {typeof row.solo === 'boolean' ? (
                        row.solo ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />
                      ) : row.solo}
                    </td>
                    <td className="text-center py-3 px-4">
                      {typeof row.pro === 'boolean' ? (
                        row.pro ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />
                      ) : row.pro}
                    </td>
                    <td className="text-center py-3 px-4">
                      {typeof row.enterprise === 'boolean' ? (
                        row.enterprise ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />
                      ) : row.enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        {/* Why Marpe Banner */}
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
                  See how we compare to Epic, Veradigm, HealthBridge, and other patient portals
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
