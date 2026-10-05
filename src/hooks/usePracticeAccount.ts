import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { edgeFunctionError } from '@/lib/edge-function-error';
import { limitErrorKind } from '@/lib/limit-errors';

/**
 * The owner's account page reads one database function, practice_account_overview,
 * and writes through four more. All of them are newer than the generated types
 * file, so they are called through a cast and described here.
 *
 * The page never shows a guess as a fact: a function that is missing (the
 * migration has not been applied to this database yet) is reported as
 * "unavailable", which is a different state from "the call failed" and from "you
 * have nothing".
 */

export interface AccountMember {
  user_id: string;
  name: string;
  role: string;
  clinical_seat: boolean;
  is_clinical: boolean;
  status: string;
}

export interface ScribeMemberUsage {
  user_id: string;
  name: string;
  used_minutes: number;
  cap_minutes: number | null;
}

export type PartnerStatus = 'none' | 'requested' | 'active';

export interface PracticeAccountOverview {
  practice: { id: string; name: string; tenant_type: string | null; tier: string | null };
  seats: {
    clinician: { used: number; limit: number | null; addon_price_usd: number | null };
    staff: { used: number; purchased: number; price_usd: number | null };
  };
  patients: { used: number; limit: number | null };
  storage: { used_gb: number; limit_gb: number | null };
  scribe: {
    pool_minutes: number;
    used_minutes: number;
    pack_minutes_remaining: number;
    period_start: string | null;
    period_end: string | null;
    per_member: ScribeMemberUsage[];
  };
  partner: {
    status: PartnerStatus;
    revenue_share_pct: number | null;
    referral_slug: string | null;
  };
  members: AccountMember[];
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : num(v, 0);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).map(rec) : [];

/**
 * Shapes the jsonb answer. Missing numbers read as zero and a missing limit as
 * "no limit stated", which is what the database means by null.
 */
export function normaliseOverview(raw: unknown): PracticeAccountOverview | null {
  const o = rec(raw);
  if (Object.keys(o).length === 0) return null;
  const practice = rec(o.practice);
  const seats = rec(o.seats);
  const clin = rec(seats.clinician);
  const staff = rec(seats.staff);
  const patients = rec(o.patients);
  const storage = rec(o.storage);
  const scribe = rec(o.scribe);
  const partner = rec(o.partner);
  const status = partner.status === 'requested' || partner.status === 'active' ? partner.status : 'none';

  return {
    practice: {
      id: str(practice.id) ?? '',
      name: str(practice.name) ?? 'Practice',
      tenant_type: str(practice.tenant_type),
      tier: str(practice.tier),
    },
    seats: {
      clinician: {
        used: num(clin.used),
        limit: numOrNull(clin.limit),
        addon_price_usd: numOrNull(clin.addon_price_usd),
      },
      staff: {
        used: num(staff.used),
        purchased: num(staff.purchased),
        price_usd: numOrNull(staff.price_usd),
      },
    },
    patients: { used: num(patients.used), limit: numOrNull(patients.limit) },
    storage: { used_gb: num(storage.used_gb), limit_gb: numOrNull(storage.limit_gb) },
    scribe: {
      pool_minutes: num(scribe.pool_minutes),
      used_minutes: num(scribe.used_minutes),
      pack_minutes_remaining: num(scribe.pack_minutes_remaining),
      period_start: str(scribe.period_start),
      period_end: str(scribe.period_end),
      per_member: list(scribe.per_member).map((m) => ({
        user_id: str(m.user_id) ?? '',
        name: str(m.name) ?? 'Team member',
        used_minutes: num(m.used_minutes),
        cap_minutes: numOrNull(m.cap_minutes),
      })),
    },
    partner: {
      status,
      revenue_share_pct: numOrNull(partner.revenue_share_pct),
      referral_slug: str(partner.referral_slug),
    },
    members: list(o.members).map((m) => ({
      user_id: str(m.user_id) ?? '',
      name: str(m.name) ?? 'Team member',
      role: str(m.role) ?? 'staff',
      clinical_seat: m.clinical_seat === true,
      is_clinical: m.is_clinical === true,
      status: str(m.status) ?? 'active',
    })),
  };
}

/**
 * Whether an error means "this function is not in the database" rather than
 * "it ran and failed". PostgREST answers PGRST202 for an unknown function and
 * Postgres 42883 for an undefined one.
 */
export function isMissingFunctionError(error: unknown): boolean {
  const e = rec(error);
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|function .* does not exist/i.test(message)
  );
}

export class OverviewUnavailableError extends Error {
  constructor() {
    super('overview_unavailable');
    this.name = 'OverviewUnavailableError';
  }
}

export const ACCOUNT_OVERVIEW_KEY = 'practice-account-overview';

// Cast: newer than the generated types file.
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (
    fn: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>)(name, args);

export function usePracticeAccountOverview(practiceId?: string | null) {
  const query = useQuery({
    queryKey: [ACCOUNT_OVERVIEW_KEY, practiceId],
    enabled: !!practiceId,
    staleTime: 30_000,
    // An unapplied migration will not fix itself between two attempts.
    retry: (count, error) => !(error instanceof OverviewUnavailableError) && count < 1,
    queryFn: async (): Promise<PracticeAccountOverview> => {
      const { data, error } = await rpc('practice_account_overview', { _practice_id: practiceId });
      if (error) {
        if (isMissingFunctionError(error)) throw new OverviewUnavailableError();
        throw error;
      }
      const overview = normaliseOverview(data);
      if (!overview) throw new OverviewUnavailableError();
      return overview;
    },
  });

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    unavailable: query.error instanceof OverviewUnavailableError,
    error: query.error && !(query.error instanceof OverviewUnavailableError) ? query.error : null,
    refetch: query.refetch,
  };
}

export const SEAT_LIMIT_MESSAGE =
  'All clinician seats are in use, so nobody else can take one. Add a clinician seat under Add-ons, or free one first. Existing members and their access are unaffected.';

function useRefreshAccount(practiceId?: string | null) {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [ACCOUNT_OVERVIEW_KEY, practiceId] }),
      // Whoever was switched may be the person looking at the page, and the
      // seat counts feed the banners and the team screen.
      queryClient.invalidateQueries({ queryKey: ['clinician-capabilities'] }),
      queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
      queryClient.invalidateQueries({ queryKey: ['practice-members'] }),
    ]);
  }, [queryClient, practiceId]);
}

export function useSetClinicalSeat(practiceId?: string | null) {
  const refresh = useRefreshAccount(practiceId);
  return useMutation({
    mutationFn: async ({ userId, on }: { userId: string; on: boolean }) => {
      const { error } = await rpc('set_member_clinical_seat', {
        _practice_id: practiceId,
        _user_id: userId,
        _on: on,
      });
      if (error) throw error;
    },
    onSuccess: async (_d, { on }) => {
      await refresh();
      toast.success(on ? 'Clinical access turned on' : 'Clinical access turned off');
    },
    onError: (error: { message?: string }) => {
      const seatsFull =
        limitErrorKind(error) === 'seats' || (error.message ?? '').includes('seat_limit_reached');
      toast.error(seatsFull ? SEAT_LIMIT_MESSAGE : error.message || 'Could not change clinical access');
    },
  });
}

export function useSetScribeMemberCap(practiceId?: string | null) {
  const refresh = useRefreshAccount(practiceId);
  return useMutation({
    mutationFn: async ({ userId, capMinutes }: { userId: string; capMinutes: number | null }) => {
      const { error } = await rpc('set_scribe_member_cap', {
        _practice_id: practiceId,
        _user_id: userId,
        _cap_minutes: capMinutes,
      });
      if (error) throw error;
    },
    onSuccess: async (_d, { capMinutes }) => {
      await refresh();
      toast.success(capMinutes === null ? 'Cap removed' : 'Cap saved');
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Could not save that cap');
    },
  });
}

export function useRequestPartnership(practiceId?: string | null) {
  const refresh = useRefreshAccount(practiceId);
  return useMutation({
    mutationFn: async ({ contact, message }: { contact: string; message: string }) => {
      const { error } = await rpc('request_partnership', {
        _practice_id: practiceId,
        _contact: contact,
        _message: message,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Request sent', { description: 'Our team will be in touch.' });
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Could not send that request');
    },
  });
}

export type AddonKind = 'clinician_seat' | 'staff_seat' | 'scribe_pack';

/** Where a person goes when add-ons are not switched on yet. */
export const ADDON_CONTACT_EMAIL = 'support@onecare.you';

/** Separate so tests can observe the hand-off without navigating jsdom. */
export function redirectToCheckout(url: string) {
  window.location.assign(url);
}

/**
 * Starts a Stripe checkout for an add-on. `notConfigured` is the server saying
 * the price does not exist yet; the page then explains and offers a way to
 * ask, rather than leaving a button that does nothing.
 */
export function useAddonCheckout(practiceId?: string | null) {
  const [pending, setPending] = useState<AddonKind | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const start = useCallback(
    async (kind: AddonKind, quantity: number) => {
      if (!practiceId) return;
      setPending(kind);
      try {
        const { data, error } = await supabase.functions.invoke('create-addon-checkout', {
          body: { practice_id: practiceId, kind, quantity },
        });

        let reason: string | null = null;
        if (error) reason = (await edgeFunctionError(error)).message;
        else if (data && typeof data.error === 'string') reason = data.error;

        if (reason === 'addon_not_configured') {
          setNotConfigured(true);
          return;
        }
        if (reason) {
          toast.error(reason);
          return;
        }
        if (data && typeof data.url === 'string' && data.url) {
          redirectToCheckout(data.url);
          return;
        }
        toast.error('Checkout did not start. Please try again.');
      } catch (e) {
        toast.error((e as Error).message || 'Checkout did not start. Please try again.');
      } finally {
        setPending(null);
      }
    },
    [practiceId],
  );

  return { start, pending, notConfigured };
}
