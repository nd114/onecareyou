import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// Clinician Stripe price IDs.
// Ladder as of Sep 2026: Community $0, Individual $99, Practice $299,
// Enterprise from $2,500 (quoted, not self-serve). The tier *keys* stay
// `solo`/`pro`/`enterprise` so existing subscriptions, Stripe metadata and
// stored patient limits keep resolving; only the labels and amounts changed.
export const CLINICIAN_STRIPE_PRICES = {
  solo_monthly: 'price_1UEWquDycAbKvlfcHGRwg9HO',
  pro_monthly: 'price_1UEWqvDycAbKvlfcgkECMwx6',
  enterprise_monthly: 'price_1SuL1ADycAbKvlfcmvKgb99I',
} as const;

// Display copy for the plan cards and the pricing page. The enforced limits are
// in the tier_limits table (see useEntitlements); a test keeps the patient
// figures below equal to that table's, so a limit change that updates one and
// not the other fails the build.
export const CLINICIAN_TIER_INFO = {
  trial: {
    name: 'Trial',
    price: 0,
    period: 'month',
    patientLimit: 5,
    storage: '500 MB',
    features: [
      'Up to 5 patients',
      'Vital threshold alerts',
      'Clinical guidance tools',
      '14-day trial period',
    ],
  },
  community: {
    name: 'Community',
    price: 0,
    period: 'month',
    patientLimit: 25,
    storage: '500 MB',
    features: [
      'Up to 25 patients',
      'Vitals, medications & adherence tracking',
      'Vital threshold alerts',
      'Secure patient messaging',
      'Assistant in read-only mode',
      'Community support',
    ],
  },
  solo: {
    name: 'Individual',
    price: 99,
    period: 'month',
    patientLimit: 150,
    storage: '10 GB',
    features: [
      'Up to 150 patients',
      'Everything in Community, plus:',
      'Custom alert thresholds',
      'Ambient scribe & assistant actions (metered)',
      'Patient adherence reports',
      'Encounters, templates & referrals',
      'Email support',
    ],
  },
  pro: {
    name: 'Practice',
    price: 299,
    period: 'month',
    patientLimit: 1000,
    storage: '100 GB',
    features: [
      'Up to 1,000 patients',
      'Everything in Individual, plus:',
      'Staff seats & non-clinical roles',
      'Patient engagement analytics',
      'Invoicing & revenue tracking',
      'Compliance & audit exports',
      'Priority support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 2500,
    period: 'month',
    patientLimit: 999999,
    storage: 'Negotiated',
    features: [
      'Unlimited patients',
      'Everything in Practice, plus:',
      'Departments, patient routing & sub-admins',
      'Practice branding (logo & colors)',
      'Unlimited team seats',
      'HIPAA BAA included',
      'EHR/FHIR connections',
      'Dedicated account manager & custom onboarding',
      'Capabilities scoped in your agreement',
    ],
  },
} as const;

/**
 * The name a person should read for a stored tier key. The keys stay
 * solo/pro so existing subscriptions keep resolving; showing the key itself
 * put "Solo" and "Pro" on admin screens for plans sold as Individual and
 * Practice. An unknown key is shown as stored rather than guessed.
 */
export function clinicianTierName(key: string | null | undefined): string {
  if (!key) return '';
  const info = (CLINICIAN_TIER_INFO as Record<string, { name: string }>)[key];
  return info ? info.name : key;
}

// Feature access by minimum tier required
export const CLINICIAN_FEATURE_TIERS = {
  engagement_analytics: ['pro', 'enterprise'] as string[],
  practice_branding: ['enterprise'] as string[],
  team_management: ['pro', 'enterprise'] as string[],
  hipaa_baa: ['enterprise'] as string[],
  ehr_integration: ['enterprise'] as string[],
  ambient_scribe: ['trial', 'solo', 'pro', 'enterprise'] as string[],
  assistant_actions: ['trial', 'solo', 'pro', 'enterprise'] as string[],
  compliance_export: ['pro', 'enterprise'] as string[],
  revenue_tracking: ['pro', 'enterprise'] as string[],
  departments: ['enterprise'] as string[],
} as const;

// Team seat counts are not kept here. They live in the tier_limits table and
// are read through useEntitlements (entitlements_for). This file used to carry
// a TEAM_SEAT_LIMITS map that said 6 for the Practice plan against the pricing
// page's 5, and nothing read it; it was removed rather than corrected so there
// is one place for the number.

export function hasFeatureAccess(tier: string, feature: keyof typeof CLINICIAN_FEATURE_TIERS): boolean {
  return CLINICIAN_FEATURE_TIERS[feature].includes(tier);
}

export type ClinicianTier = 'trial' | 'community' | 'solo' | 'pro' | 'enterprise' | 'expired';


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
  // False until the first check has finished, however it finished. Every
  // default below — trial, five patients — is a guess, and a guess rendered
  // as fact is what made "Patient Limit Reached" and the upgrade card flash
  // up on load and then correct themselves.
  const [checked, setChecked] = useState(false);

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
      setChecked(true);
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

      if (data?.no_customer) {
        toast({
          title: 'No billing account yet',
          description: data.message || 'Choose a plan to start a subscription.',
        });
        return;
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
    /**
     * True once the first check has returned, success or failure. Anything
     * that hides a feature or warns about a limit has to wait for this — the
     * tier and limit above are defaults until then, not facts.
     */
    subscriptionReady: checked,
  };
}
