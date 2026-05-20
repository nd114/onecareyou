import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// Re-export from centralized SSOT
export { STRIPE_PRICES, PRICE_INFO } from '@/lib/pricing-constants';

export interface SubscriptionStatus {
  subscribed: boolean;
  tier: 'free' | 'premium' | 'family' | 'enterprise';
  subscription_end: string | null;
  is_annual: boolean;
}

export function useSubscription() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

  const checkSubscription = useCallback(async () => {
    if (!session) return null;

    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking subscription:', error);
        return null;
      }

      setSubscription(data);
      return data as SubscriptionStatus;
    } catch (error) {
      console.error('Error checking subscription:', error);
      return null;
    } finally {
      setCheckingStatus(false);
    }
  }, [session]);

  const createCheckout = useCallback(async (priceId: string) => {
    if (!session) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to subscribe to a plan.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { priceId },
      });

      if (error) {
        throw error;
      }

      if (data?.url) {
        // Open checkout in new tab
        window.open(data.url, '_blank');
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create checkout session',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session]);

  const openCustomerPortal = useCallback(async () => {
    if (!session) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to manage your subscription.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (error: any) {
      console.error('Error opening customer portal:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to open subscription management',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Auto-check subscription when session changes and refresh every 60s
  useEffect(() => {
    if (!session) return;
    checkSubscription();
    const id = setInterval(checkSubscription, 60_000);
    return () => clearInterval(id);
  }, [session, checkSubscription]);

  return {
    subscription,
    loading,
    checkingStatus,
    checkSubscription,
    createCheckout,
    openCustomerPortal,
    isPremium: subscription?.tier === 'premium' || subscription?.tier === 'family' || subscription?.tier === 'enterprise',
  };
}
