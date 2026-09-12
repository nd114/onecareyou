import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRole } from '@/hooks/useAdminRole';
import { CLINICIAN_TIER_INFO } from '@/hooks/useClinicianSubscription';
import { PRICE_INFO } from '@/lib/pricing-constants';
import { toast } from 'sonner';

export interface TierCount {
  tier: string;
  status?: string;
  count: number;
}

export interface RevenueOverview {
  tenants_by_tier: TierCount[];
  clinicians_by_tier: TierCount[];
  patients_by_tier: TierCount[];
  trials: {
    tenants: number;
    clinicians: number;
    lapsing_within_7_days: number;
    already_lapsed: number;
  };
  cancellations: {
    last_30_days: number;
    last_90_days: number;
    tenants_deactivated: number;
  };
  invoices: {
    unpaid_count: number;
    unpaid_minor: number;
    overdue_count: number;
    platform_fee_minor: number;
    issued_last_30_days: number;
  };
  revenue_share: {
    tenant_count: number;
    highest_pct: number;
    attributed_patients: number;
  };
  storage: {
    allowance_gb: number;
    used_bytes: number;
    tenants_over_75_pct: number;
  };
  checked_at: string;
}

export interface RevenueTenant {
  id: string;
  name: string;
  tenant_type: string | null;
  subscription_tier: string;
  subscription_status: string;
  subscription_ends_at: string | null;
  days_remaining: number | null;
  member_count: number;
  connected_patients: number;
  patient_limit: number | null;
  member_limit: number | null;
  storage_limit_gb: number | null;
  storage_bytes: number;
  revenue_share_pct: number;
  unpaid_invoice_count: number;
  unpaid_invoice_minor: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

/**
 * What a tier is worth stays in the pricing constants, so a price change is a
 * one-line edit there rather than a migration. The database counts who is on
 * what; the arithmetic happens here.
 *
 * Every subscription is priced at its monthly rate, because nothing records
 * which ones bill annually — `practices` and `clinician_profiles` carry a
 * Stripe subscription id and a tier, and no interval. Annual plans are two
 * months free, so each annual subscriber is counted about a sixth high. The
 * page says so rather than presenting the total as exact; the real figure
 * lives in Stripe until a billing interval is stored alongside the tier.
 */
function monthlyPriceForTier(tier: string): number {
  const info = CLINICIAN_TIER_INFO[tier as keyof typeof CLINICIAN_TIER_INFO];
  return info ? info.price : 0;
}

function patientMonthlyPrice(tier: string): number {
  return tier === 'premium' ? PRICE_INFO.premium_monthly.price : 0;
}

export interface RecurringRevenue {
  tenantMonthly: number;
  clinicianMonthly: number;
  patientMonthly: number;
  total: number;
  payingTenants: number;
  payingClinicians: number;
  payingPatients: number;
  /**
   * Tiers carried by real accounts that the pricing constants have no price
   * for. They contribute nothing to the total, and a run rate that is quietly
   * short is worse than one that admits what it could not price — so they are
   * named rather than rounded to zero in silence.
   */
  unpricedTiers: string[];
}

/** Tiers that are free on purpose, rather than tiers we failed to recognise. */
const FREE_BY_DESIGN = new Set(['trial', 'community', 'free', 'none']);

export function useAdminRevenue() {
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ['admin-revenue-overview'],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<RevenueOverview | null> => {
      const { data, error } = await supabase.rpc('admin_revenue_overview');
      if (error) throw error;
      return (data ?? null) as unknown as RevenueOverview | null;
    },
  });

  const tenants = useQuery({
    queryKey: ['admin-revenue-tenants'],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<RevenueTenant[]> => {
      const { data, error } = await supabase.rpc('admin_revenue_tenants');
      if (error) throw error;
      return (data || []) as RevenueTenant[];
    },
  });

  // Only a subscription that is actually running counts towards the run rate.
  const recurring = useMemo<RecurringRevenue>(() => {
    const o = overview.data;
    const live = (status?: string) =>
      !status || ['active', 'trialing', 'past_due'].includes(status);

    const unpriced = new Set<string>();
    const noteIfUnknown = (tier: string, count: number, known: boolean) => {
      if (count > 0 && !known && !FREE_BY_DESIGN.has(tier)) unpriced.add(tier);
    };

    let tenantMonthly = 0;
    let payingTenants = 0;
    for (const row of o?.tenants_by_tier ?? []) {
      const price = monthlyPriceForTier(row.tier);
      noteIfUnknown(row.tier, row.count, row.tier in CLINICIAN_TIER_INFO);
      if (price > 0 && live(row.status)) {
        tenantMonthly += price * row.count;
        payingTenants += row.count;
      }
    }

    let clinicianMonthly = 0;
    let payingClinicians = 0;
    for (const row of o?.clinicians_by_tier ?? []) {
      const price = monthlyPriceForTier(row.tier);
      noteIfUnknown(row.tier, row.count, row.tier in CLINICIAN_TIER_INFO);
      if (price > 0 && live(row.status)) {
        clinicianMonthly += price * row.count;
        payingClinicians += row.count;
      }
    }

    let patientMonthly = 0;
    let payingPatients = 0;
    for (const row of o?.patients_by_tier ?? []) {
      const price = patientMonthlyPrice(row.tier);
      noteIfUnknown(row.tier, row.count, row.tier === 'premium');
      if (price > 0) {
        patientMonthly += price * row.count;
        payingPatients += row.count;
      }
    }

    return {
      tenantMonthly,
      clinicianMonthly,
      patientMonthly,
      total: tenantMonthly + clinicianMonthly + patientMonthly,
      payingTenants,
      payingClinicians,
      payingPatients,
      unpricedTiers: [...unpriced].sort(),
    };
  }, [overview.data]);

  const extendTrial = useMutation({
    mutationFn: async ({ practiceId, days }: { practiceId: string; days: number }) => {
      const { data, error } = await supabase.rpc('admin_extend_trial', {
        _practice_id: practiceId,
        _days: days,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success('Runway extended');
      queryClient.invalidateQueries({ queryKey: ['admin-revenue-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-revenue-overview'] });
      queryClient.invalidateQueries({ queryKey: ['admin-attention-queue'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not extend the trial'),
  });

  return {
    overview: overview.data ?? null,
    tenants: tenants.data ?? [],
    recurring,
    isLoading: overview.isLoading || tenants.isLoading,
    extendTrial: extendTrial.mutate,
    isExtending: extendTrial.isPending,
  };
}
