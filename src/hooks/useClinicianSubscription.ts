import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// Clinician Stripe price IDs.
// Ladder as of Oct 2026: Community $0, Individual $99, Practice $299, Clinic
// $649, Enterprise from $2,500 (quoted, not self-serve). The tier *keys* stay
// `solo`/`pro`/`enterprise` so existing subscriptions, Stripe metadata and
// stored patient limits keep resolving; `clinic` is a new key. There is no
// Stripe price for Clinic yet, so it is not in this map and the pricing page
// sends Clinic enquiries to the contact page rather than to checkout.
export const CLINICIAN_STRIPE_PRICES = {
  solo_monthly: 'price_1UEWquDycAbKvlfcHGRwg9HO',
  pro_monthly: 'price_1UEWqvDycAbKvlfcgkECMwx6',
  enterprise_monthly: 'price_1SuL1ADycAbKvlfcmvKgb99I',
} as const;

// Display copy for the plan cards and the pricing page. The enforced limits are
// in the tier_limits table (see useEntitlements); a test keeps the figures
// below equal to that table's, so a limit change that updates one and not the
// other fails the build. Extra clinician seats, staff seats and scribe minute
// packs are managed from the owner's account page and are not priced here.
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
      '1 clinician',
      'Up to 25 patients',
      'Vitals, medications & adherence tracking',
      'Vital threshold alerts',
      'Secure patient messaging',
      'Assistant in read-only mode',
      'No ambient scribe',
      'Guides, AI help assistant and email support (best effort)',
    ],
  },
  solo: {
    name: 'Individual',
    price: 99,
    period: 'month',
    patientLimit: 150,
    storage: '10 GB',
    features: [
      '1 clinician',
      'Up to 150 patients',
      'Everything in Community, plus:',
      'Custom alert thresholds',
      'Patient adherence reports',
      'Encounters, templates & referrals',
      'No ambient scribe minutes',
      'Email support (best effort)',
    ],
  },
  pro: {
    name: 'Practice',
    price: 299,
    period: 'month',
    patientLimit: 1000,
    storage: '30 GB',
    features: [
      '3 clinicians included; extra clinician seats $49/month',
      'Staff seats $15/month each; none included',
      'Up to 1,000 patients',
      'Everything in Individual, plus:',
      'Ambient scribe allowance: 900 minutes a month, pooled across the practice (300 per clinician seat; the owner decides how to divide them). More minutes can be added',
      '30 GB storage, plus 10 GB per added clinician',
      'Team management & patient engagement analytics',
      'Invoicing & revenue tracking',
      'Compliance & audit exports',
      'Guides, AI help assistant and email support',
    ],
  },
  clinic: {
    name: 'Clinic',
    price: 649,
    period: 'month',
    patientLimit: 3500,
    storage: '100 GB',
    features: [
      '10 clinicians included; extra clinician seats $45/month, up to 30 seats',
      'Staff seats $15/month each',
      'Up to 3,500 patients',
      'Everything in Practice, plus:',
      'Ambient scribe allowance: 3,000 minutes a month, pooled across the clinic. More minutes can be added',
      '100 GB storage, plus 10 GB per added clinician',
      'Multi-site patient routing',
      'Priority support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 2500,
    period: 'month',
    patientLimit: 5000,
    storage: '1 TB',
    features: [
      '25 clinicians and 5,000 patients',
      'Everything in Clinic, plus:',
      '15,000 scribe minutes a month, pooled',
      'Departments & sub-admins',
      'Custom subdomain & practice branding',
      'Single sign-on (SSO)',
      'EHR/FHIR connections',
      'HIPAA BAA',
      'Priority support',
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

// Feature access by minimum tier required. `clinic` is a new key that sits
// between Practice and Enterprise.
//
// ambient_scribe: Individual (solo) and Community have no scribe, by decision.
// The edge functions refuse them (encounter-scribe, clinician-dictation-process,
// voice-memo-process, transcribe-segment: 403 scribe_not_in_plan), reading the
// tier_limits table; this list is the same decision for the screen, and
// useScribePlan checks it alongside the database's scribe_included.
// assistant_actions is the clinician assistant proposing changes, not the
// scribe, and is unchanged.
export const CLINICIAN_FEATURE_TIERS = {
  engagement_analytics: ['pro', 'clinic', 'enterprise'] as string[],
  practice_branding: ['enterprise'] as string[],
  team_management: ['pro', 'clinic', 'enterprise'] as string[],
  hipaa_baa: ['enterprise'] as string[],
  ehr_integration: ['enterprise'] as string[],
  ambient_scribe: ['trial', 'pro', 'clinic', 'enterprise'] as string[],
  assistant_actions: ['trial', 'solo', 'pro', 'clinic', 'enterprise'] as string[],
  compliance_export: ['pro', 'clinic', 'enterprise'] as string[],
  revenue_tracking: ['pro', 'clinic', 'enterprise'] as string[],
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

export type ClinicianTier = 'trial' | 'community' | 'solo' | 'pro' | 'clinic' | 'enterprise' | 'expired';


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
