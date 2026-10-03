import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

/** Parses the tier_limits seed out of the migration, so the test reads the same figures the database is given. */
function seedFromMigration(): Seed {
  const sql = readFileSync(
    resolve(__dirname, '../../supabase/migrations/20261011030000_tier_limits_entitlements_and_caps.sql'),
    'utf8',
  );
  const start = sql.indexOf('INSERT INTO public.tier_limits');
  const values = sql.slice(start, sql.indexOf('ON CONFLICT', start));
  const out: Seed = {};
  const n = (v: string) => (v === 'NULL' ? null : Number(v));
  for (const m of values.matchAll(/\('(\w+)',\s*(NULL|\d+),\s*(NULL|\d+),\s*(NULL|\d+),/g)) {
    out[m[1]] = { patient: n(m[2]), seats: n(m[3]), storage: n(m[4]) };
  }
  return out;
}

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

  it('parsed every plan', () => {
    expect(Object.keys(seed).sort()).toEqual(['community', 'enterprise', 'expired', 'pro', 'solo', 'trial']);
  });

  it.each(['trial', 'community', 'solo', 'pro'] as const)('%s patient limit equals the pricing page', (tier) => {
    expect(seed[tier].patient).toBe(CLINICIAN_TIER_INFO[tier].patientLimit);
  });

  it('enterprise is unlimited, which the client info stores as the sentinel', () => {
    expect(seed.enterprise.patient).toBeNull();
    expect(CLINICIAN_TIER_INFO.enterprise.patientLimit).toBe(STORED_UNLIMITED);
  });

  it('storage equals the published allowance', () => {
    const mb = (s: string) => (s.endsWith('GB') ? parseInt(s, 10) * 1024 : parseInt(s, 10));
    for (const tier of ['trial', 'community', 'solo', 'pro'] as const) {
      expect(seed[tier].storage).toBe(mb(CLINICIAN_TIER_INFO[tier].storage));
    }
    expect(seed.enterprise.storage).toBeNull();
  });

  it('seats: Practice is 5 as published, Enterprise unlimited', () => {
    expect(seed.pro.seats).toBe(5);
    expect(seed.enterprise.seats).toBeNull();
  });

  it('an ended trial can add nothing', () => {
    expect(seed.expired.patient).toBe(0);
  });
});
