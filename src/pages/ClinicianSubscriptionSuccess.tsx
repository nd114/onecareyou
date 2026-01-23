import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ArrowRight, Loader2, Users, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { useClinicianSubscription, CLINICIAN_TIER_INFO } from '@/hooks/useClinicianSubscription';

const ClinicianSubscriptionSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkSubscription, subscription } = useClinicianSubscription();
  const [isLoading, setIsLoading] = useState(true);

  const tier = searchParams.get('tier') as 'solo' | 'pro' | 'enterprise' | null;
  const tierInfo = tier ? CLINICIAN_TIER_INFO[tier] : null;

  useEffect(() => {
    const verify = async () => {
      await checkSubscription();
      setIsLoading(false);
    };
    verify();
  }, [checkSubscription]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-16 px-4 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Verifying your subscription...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-16 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl mx-auto"
        >
          {/* Success Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6"
            >
              <Check className="h-12 w-12 text-green-600" />
            </motion.div>
            <h1 className="text-3xl font-bold mb-2">Welcome to {tierInfo?.name || 'Pro'}!</h1>
            <p className="text-muted-foreground text-lg">
              Your subscription is now active. You're ready to provide better care.
            </p>
          </div>

          {/* Subscription Details */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-semibold">
                    {subscription?.patient_limit === 999999 
                      ? 'Unlimited' 
                      : `Up to ${subscription?.patient_limit || tierInfo?.patientLimit}`}
                  </p>
                  <p className="text-sm text-muted-foreground">Patients</p>
                </div>
                <div>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-semibold">Real-time</p>
                  <p className="text-sm text-muted-foreground">Vital Alerts</p>
                </div>
                <div>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-semibold">{tier === 'enterprise' ? 'BAA Included' : 'Secure'}</p>
                  <p className="text-sm text-muted-foreground">{tier === 'enterprise' ? 'HIPAA Ready' : 'Platform'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Next Steps */}
          <div className="space-y-4 mb-8">
            <h2 className="font-semibold text-lg">Get Started:</h2>
            <div className="space-y-3">
              {[
                { step: 1, text: 'Invite your first patients to connect with you', action: '/clinician/dashboard' },
                { step: 2, text: 'Set up custom alert thresholds for vital monitoring', action: '/clinician/dashboard' },
                { step: 3, text: 'Explore guidance templates and clinical tools', action: '/clinician/settings' },
              ].map(({ step, text, action }) => (
                <div key={step} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                    {step}
                  </div>
                  <p className="flex-1">{text}</p>
                  <Button variant="ghost" size="sm" onClick={() => navigate(action)}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Enterprise BAA Prompt */}
          {tier === 'enterprise' && (
            <Card className="mb-8 border-primary">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Complete Your HIPAA BAA</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      As an Enterprise subscriber, you have access to our HIPAA Business Associate Agreement. 
                      Sign it now to ensure full compliance.
                    </p>
                    <Button onClick={() => navigate('/clinician/baa')}>
                      Sign BAA Agreement
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="outline" onClick={() => navigate('/clinician/settings')}>
              Manage Subscription
            </Button>
            <Button className="gradient-primary border-0" onClick={() => navigate('/clinician/dashboard')}>
              Go to Dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default ClinicianSubscriptionSuccess;
