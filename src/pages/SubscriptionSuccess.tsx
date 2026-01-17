import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';

const SubscriptionSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { user } = useAuth();
  const { checkSubscription, subscription, checkingStatus } = useSubscription();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    // Check subscription status after successful checkout
    const verifySubscription = async () => {
      if (user) {
        await checkSubscription();
        setVerified(true);
      }
    };

    // Small delay to allow Stripe to process
    const timer = setTimeout(verifySubscription, 2000);
    return () => clearTimeout(timer);
  }, [user, checkSubscription]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-16 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Card className="border-primary/20 shadow-xl">
            <CardHeader className="pb-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto mb-4"
              >
                <div className="h-20 w-20 rounded-full gradient-primary flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-primary-foreground" />
                </div>
              </motion.div>
              <CardTitle className="text-3xl">Welcome to Premium!</CardTitle>
              <CardDescription className="text-lg">
                Your subscription is now active
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              {checkingStatus ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Verifying subscription...</span>
                </div>
              ) : verified && subscription?.subscribed ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-primary/5 rounded-lg p-4 border border-primary/20"
                >
                  <div className="flex items-center justify-center gap-2 text-primary font-medium">
                    <Sparkles className="h-5 w-5" />
                    <span>Premium features unlocked!</span>
                  </div>
                  {subscription.subscription_end && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Your subscription renews on {new Date(subscription.subscription_end).toLocaleDateString()}
                    </p>
                  )}
                </motion.div>
              ) : null}

              <div className="space-y-3 text-left bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold">What's included:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Unlimited medications tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    AI-powered lab report parsing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Advanced vitals tracking & history
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Care Circle sharing with providers
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Health reports export (PDF, CSV)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Priority email support
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button asChild className="flex-1 gradient-primary border-0">
                  <Link to="/dashboard">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <Link to="/settings">
                    Manage Subscription
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default SubscriptionSuccess;
