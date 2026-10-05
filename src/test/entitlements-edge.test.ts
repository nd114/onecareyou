import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  STORED_UNLIMITED,
  loadTierLimits,
  patientCapacity,
  remainingPatientSlots,
  storedPatientLimit,
  type TierLimitRow,
} from '../../supabase/functions/_shared/entitlements';
import { CLINICIAN_TIER_INFO } from '@/hooks/useClinicianSubscription';

type Seed = Record<string, { patient: number | null; seats: number | null; storage: number | null }>;

/**
 * Parses the tier_limits seed out of the migrations, so the test reads the same
 * figures the database is given. Every migration that inserts into tier_limits
 * is read in filename order and a later insert for a tier overrides an earlier
 * one, which is what ON CONFLICT DO UPDATE does when they run in order.
 */
function seedFromMigration(): Seed {
  const dir = resolve(__dirname, '../../supabase/migrations');
  const out: Seed = {};
  const n = (v: string) => (v === 'NULL' ? null : Number(v));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(dir, file), 'utf8');
    let from = 0;
    for (;;) {
      const start = sql.indexOf('INSERT INTO public.tier_limits', from);
      if (start < 0) break;
      const conflict = sql.indexOf('ON CONFLICT', start);
      const end = conflict < 0 ? sql.indexOf(';', start) : conflict;
      const values = sql.slice(start, end);
      for (const m of values.matchAll(/\('(\w+)',\s*(NULL|\d+),\s*(NULL|\d+),\s*(NULL|\d+),/g)) {
        out[m[1]] = { patient: n(m[2]), seats: n(m[3]), storage: n(m[4]) };
      }
      from = end;
    }
  }
  return out;
}

/** The decided figures, written out here so a change to the page alone is also caught. */
const DECIDED = {
  patients: { community: 25, solo: 150, pro: 1000, clinic: 3500, enterprise: 5000 },
  clinicianSeats: { community: 1, solo: 1, pro: 3, clinic: 10 },
} as const;

const rows = (r: Array<Partial<TierLimitRow> & { tier: string }>): Record<string, TierLimitRow> =>
  Object.fromEntries(
    r.map((x) => [
      x.tier,
      {
        patient_limit: null,
        seat_limit: null,
        storage_mb: null,
        scribe_included: false,
        scribe_minutes_monthly: null,
        ...x,
      },
    ]),
  );

describe('storedPatientLimit', () => {
  const limits = rows([
    { tier: 'solo', patient_limit: 150 },
    { tier: 'enterprise', patient_limit: null },
    { tier: 'expired', patient_limit: 0 },
  ]);
  it('returns the table figure', () => {
    expect(storedPatientLimit(limits, 'solo')).toBe(150);
    expect(storedPatientLimit(limits, 'expired')).toBe(0);
  });
  it('stores unlimited as the legacy sentinel', () => {
    expect(storedPatientLimit(limits, 'enterprise')).toBe(STORED_UNLIMITED);
  });
  it('grants nothing for an unknown tier', () => {
    expect(storedPatientLimit(limits, 'mystery')).toBe(0);
  });
});

describe('remainingPatientSlots', () => {
  it('counts down and never goes negative', () => {
    expect(remainingPatientSlots({ limit: 25, used: 20 })).toBe(5);
    expect(remainingPatientSlots({ limit: 25, used: 25 })).toBe(0);
    expect(remainingPatientSlots({ limit: 25, used: 40 })).toBe(0);
  });
  it('is unlimited for a null limit', () => {
    expect(remainingPatientSlots({ limit: null, used: 9999 })).toBe(Infinity);
  });
});

describe('loadTierLimits and patientCapacity', () => {
  it('loads rows keyed by tier and throws when the table cannot be read', async () => {
    const ok = {
      from: () => ({ select: async () => ({ data: [{ tier: 'solo', patient_limit: 150 }], error: null }) }),
      rpc: async () => ({}),
    };
    expect((await loadTierLimits(ok))['solo'].patient_limit).toBe(150);
    const bad = {
      from: () => ({ select: async () => ({ data: null, error: { message: 'denied' } }) }),
      rpc: async () => ({}),
    };
    await expect(loadTierLimits(bad)).rejects.toThrow(/tier_limits/);
  });

  it('asks for the clinician limit and count for a personal import', async () => {
    const calls: string[] = [];
    const client = {
      from: () => ({}),
      rpc: async (fn: string) => {
        calls.push(fn);
        return { data: fn === '_personal_patient_limit' ? 150 : 148, error: null };
      },
    };
    expect(await patientCapacity(client, 'u1')).toEqual({ scope: 'clinician', limit: 150, used: 148 });
    expect(calls.sort()).toEqual(['_personal_patient_count', '_personal_patient_limit']);
  });

  it('uses the practice figures when records are filed into a practice, and null is unlimited', async () => {
    const client = {
      from: () => ({}),
      rpc: async (fn: string) =>
        fn === '_practice_limits' ? { data: [{ patient_limit: null }], error: null } : { data: 7, error: null },
    };
    expect(await patientCapacity(client, 'u1', 'p1')).toEqual({ scope: 'practice', limit: null, used: 7 });
  });

  it('surfaces an rpc failure rather than treating it as unlimited', async () => {
    const client = { from: () => ({}), rpc: async () => ({ data: null, error: { message: 'nope' } }) };
    await expect(patientCapacity(client, 'u1')).rejects.toThrow();
  });
});

describe('the seeded limits match the published figures', () => {
  const seed = seedFromMigration();

  it('the page figures are the decided ones', () => {
    for (const [tier, n] of Object.entries(DECIDED.patients)) {
      expect(CLINICIAN_TIER_INFO[tier as keyof typeof CLINICIAN_TIER_INFO].patientLimit).toBe(n);
    }
  });

  it('parsed every plan', () => {
    expect(Object.keys(seed).sort()).toEqual(['clinic', 'community', 'enterprise', 'expired', 'pro', 'solo', 'trial']);
  });

  it.each(['trial', 'community', 'solo', 'pro', 'clinic', 'enterprise'] as const)(
    '%s patient limit equals the pricing page',
    (tier) => {
      expect(seed[tier]?.patient).toBe(CLINICIAN_TIER_INFO[tier].patientLimit);
    },
  );

  it('storage equals the published allowance', () => {
    const mb = (s: string) =>
      s.endsWith('TB') ? parseInt(s, 10) * 1024 * 1024 : s.endsWith('GB') ? parseInt(s, 10) * 1024 : parseInt(s, 10);
    for (const tier of ['trial', 'community', 'solo', 'pro', 'clinic', 'enterprise'] as const) {
      expect(seed[tier]?.storage).toBe(mb(CLINICIAN_TIER_INFO[tier].storage));
    }
  });

  it.each(['community', 'solo', 'pro', 'clinic'] as const)('%s included clinician seats are as decided', (tier) => {
    expect(seed[tier]?.seats).toBe(DECIDED.clinicianSeats[tier]);
  });

  it('an ended trial can add nothing', () => {
    expect(seed.expired.patient).toBe(0);
  });
});
