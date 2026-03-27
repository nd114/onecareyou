import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// Clinician Stripe price IDs (Updated pricing: Solo $79, Pro $149, Enterprise $399)
export const CLINICIAN_STRIPE_PRICES = {
  solo_monthly: 'price_1SuKweDycAbKvlfcGepIUqjl',
  pro_monthly: 'price_1SuKyqDycAbKvlfcVWUKk03a',
  enterprise_monthly: 'price_1SuL1ADycAbKvlfcmvKgb99I',
} as const;

export const CLINICIAN_TIER_INFO = {
  trial: {
    name: 'Trial',
    price: 0,
    period: 'month',
    patientLimit: 5,
    features: [
      'Up to 5 patients',
      'Vital threshold alerts',
      'Clinical guidance tools',
      '14-day trial period',
    ],
  },
  solo: {
    name: 'Solo',
    price: 79,
    period: 'month',
    patientLimit: 25,
    features: [
      'Up to 25 patients',
      'Vital threshold alerts',
      'Custom alert thresholds',
      'Clinical guidance tools',
      'Patient adherence reports',
      'Email & push notifications',
      'Standard support',
    ],
  },
  pro: {
    name: 'Pro',
    price: 149,
    period: 'month',
    patientLimit: 100,
    features: [
      'Up to 100 patients',
      'Everything in Solo, plus:',
      'Patient engagement analytics',
      'Team member access (2 seats)',
      'Guidance templates (coming soon)',
      'Priority support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 399,
    period: 'month',
    patientLimit: 999999,
    features: [
      'Unlimited patients',
      'Everything in Pro, plus:',
      'Practice branding (logo & colors)',
      'Unlimited team seats',
      'HIPAA BAA included',
      'EHR/FHIR integration (coming soon)',
      'API access (coming soon)',
      'Dedicated account manager',
      'Custom onboarding',
    ],
  },
} as const;

// Feature access by minimum tier required
export const CLINICIAN_FEATURE_TIERS = {
  engagement_analytics: ['pro', 'enterprise'] as string[],
  practice_branding: ['enterprise'] as string[],
  team_management: ['pro', 'enterprise'] as string[],
  hipaa_baa: ['enterprise'] as string[],
  ehr_integration: ['enterprise'] as string[],
} as const;

export const TEAM_SEAT_LIMITS: Record<string, number> = {
  trial: 1,
  solo: 1,
  pro: 3, // owner + 2 seats
  enterprise: 999999,
};

export function hasFeatureAccess(tier: string, feature: keyof typeof CLINICIAN_FEATURE_TIERS): boolean {
  return CLINICIAN_FEATURE_TIERS[feature].includes(tier);
}

export type ClinicianTier = 'trial' | 'solo' | 'pro' | 'enterprise' | 'expired';

export interface ClinicianSubscriptionStatus {
  subscribed: boolean;
  tier: ClinicianTier;
  subscription_end: string | null;
  is_clinician: boolean;
  patient_limit: number;
  is_in_trial: boolean;
  trial_ends_at?: string;
}

export function useClinicianSubscription() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [subscription, setSubscription] = useState<ClinicianSubscriptionStatus | null>(null);

  const checkSubscription = useCallback(async () => {
    if (!session) return null;

    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-clinician-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking clinician subscription:', error);
        return null;
      }

      setSubscription(data);
      return data as ClinicianSubscriptionStatus;
    } catch (error) {
      console.error('Error checking clinician subscription:', error);
      return null;
    } finally {
      setCheckingStatus(false);
    }
  }, [session]);

  const createCheckout = useCallback(async (tier: 'solo' | 'pro' | 'enterprise') => {
    if (!session) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to subscribe to a plan.',
        variant: 'destructive',
      });
      return;
    }

    const priceId = CLINICIAN_STRIPE_PRICES[`${tier}_monthly`];
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-clinician-checkout', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { priceId, tier },
      });

      if (error) {
        throw error;
      }

      if (data?.url) {
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

  // Auto-check subscription on mount if session exists
  useEffect(() => {
    if (session) {
      checkSubscription();
    }
  }, [session, checkSubscription]);

  return {
    subscription,
    loading,
    checkingStatus,
    checkSubscription,
    createCheckout,
    openCustomerPortal,
    isSubscribed: subscription?.subscribed || false,
    isTrial: subscription?.is_in_trial || false,
    tier: subscription?.tier || 'trial',
    patientLimit: subscription?.patient_limit || 5,
  };
}
