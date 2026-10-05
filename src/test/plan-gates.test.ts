import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PAID_PATIENT_TIERS,
  checkPatientAi,
  checkScribe,
  decidePatientAi,
  decideScribe,
  gateBody,
  patientHasPlus,
  scribeIncluded,
} from '../../supabase/functions/_shared/plan-gates';
import type { TierLimitRow } from '../../supabase/functions/_shared/entitlements';

const row = (tier: string, scribe: boolean): TierLimitRow => ({
  tier,
  patient_limit: null,
  seat_limit: null,
  storage_mb: null,
  scribe_included: scribe,
  scribe_minutes_monthly: null,
});
const LIMITS = Object.fromEntries(
  [
    row('trial', true),
    row('community', false),
    row('solo', false),
    row('pro', true),
    row('clinic', true),
    row('enterprise', true),
    row('expired', false),
  ].map((r) => [r.tier, r]),
);

describe('patient AI is Plus only', () => {
  it('treats premium, family and enterprise as paid, exactly like useSubscription.isPremium', () => {
    expect([...PAID_PATIENT_TIERS].sort()).toEqual(['enterprise', 'family', 'premium']);
    for (const t of PAID_PATIENT_TIERS) expect(decidePatientAi(t)).toEqual({ allow: true });
  });

  it('refuses free, missing and unknown tiers with 403 plus_required', () => {
    for (const t of ['free', null, '', 'expired', 'something-new']) {
      expect(decidePatientAi(t)).toMatchObject({ allow: false, status: 403, error: 'plus_required', retryable: false });
    }
    expect(patientHasPlus('free')).toBe(false);
    expect(patientHasPlus(undefined)).toBe(false);
  });

  it('answers a failed lookup with a retryable 503, never an allow and never a permanent lock', () => {
    expect(decidePatientAi('error')).toMatchObject({ allow: false, status: 503, error: 'plan_check_failed', retryable: true });
  });

  it('reads profiles.subscription_tier for the caller', async () => {
    const client = (data: unknown, error: unknown = null) => ({
      rpc: () => null,
      from: (t: string) => {
        expect(t).toBe('profiles');
        const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data, error }) };
        return q;
      },
    });
    expect(await checkPatientAi(client({ subscription_tier: 'premium' }), 'u')).toEqual({ allow: true });
    expect(await checkPatientAi(client({ subscription_tier: 'family' }), 'u')).toEqual({ allow: true });
    expect(await checkPatientAi(client({ subscription_tier: 'free' }), 'u')).toMatchObject({ error: 'plus_required' });
    expect(await checkPatientAi(client(null), 'u')).toMatchObject({ error: 'plus_required' });
    expect(await checkPatientAi(client(null, { message: 'db down' }), 'u')).toMatchObject({ status: 503, retryable: true });
    const throwing = {
      rpc: () => null,
      from: () => {
        throw new Error('boom');
      },
    };
    expect(await checkPatientAi(throwing, 'u')).toMatchObject({ status: 503 });
  });

  it('the refusal body carries the code a client keys on', () => {
    const d = decidePatientAi('free');
    if (d.allow) throw new Error('unreachable');
    const refusal = d as Exclude<typeof d, { allow: true }>;
    expect(gateBody(refusal)).toMatchObject({ error: 'plus_required', retryable: false });
    expect(typeof gateBody(refusal).message).toBe('string');
  });
});

describe('the scribe is not in Individual or Community', () => {
  const ent = (tier: string, scribe_included: boolean) => ({ tier, scribe_included });

  it('is refused for solo, community and expired, with 403 scribe_not_in_plan', () => {
    for (const t of ['solo', 'community', 'expired']) {
      expect(decideScribe(ent(t, false), LIMITS)).toMatchObject({ allow: false, status: 403, error: 'scribe_not_in_plan' });
    }
  });

  it('is allowed for trial, Practice, Clinic and Enterprise', () => {
    for (const t of ['trial', 'pro', 'clinic', 'enterprise']) {
      expect(decideScribe(ent(t, true), LIMITS)).toEqual({ allow: true });
    }
  });

  it('lets a clinician seated in a Practice use it when their personal profile is lower', () => {
    // entitlements_for lifts `tier` to the plan they work under; scribe_included
    // is the personal figure. Either granting it is enough.
    expect(scribeIncluded(ent('pro', false), LIMITS)).toBe(true);
    expect(decideScribe(ent('pro', false), LIMITS)).toEqual({ allow: true });
  });

  it('reads the table, not a tier name: a tier given the scribe later is allowed', () => {
    expect(decideScribe(ent('solo', false), { ...LIMITS, solo: row('solo', true) })).toEqual({ allow: true });
  });

  it('fails retryable when entitlements or the tier table cannot be read', () => {
    expect(decideScribe(null, LIMITS)).toMatchObject({ status: 503, error: 'plan_check_failed', retryable: true });
    expect(decideScribe(ent('pro', true), null)).toMatchObject({ status: 503, retryable: true });
  });

  it('checkScribe asks entitlements_for for the caller and never throws', async () => {
    const asked: unknown[] = [];
    const admin = (soloLike: boolean, fail = false) => ({
      rpc: (fn: string, args: unknown) => {
        asked.push([fn, args]);
        return fail
          ? { data: null, error: { message: 'down' } }
          : { data: [{ tier: soloLike ? 'solo' : 'pro', scribe_included: !soloLike }], error: null };
      },
      from: () => ({
        select: async () => ({ data: Object.values(LIMITS), error: null }),
      }),
    });
    expect(await checkScribe(admin(true), 'u1')).toMatchObject({ error: 'scribe_not_in_plan' });
    expect(asked[0]).toEqual(['entitlements_for', { _user: 'u1' }]);
    expect(await checkScribe(admin(false), 'u1')).toEqual({ allow: true });
    expect(await checkScribe(admin(true, true), 'u1')).toMatchObject({ status: 503, retryable: true });
  });
});

describe('the decision matches the seeded tier_limits', () => {
  it('Individual and Community have no scribe; the paid practice tiers do', () => {
    const dir = resolve(__dirname, '../../supabase/migrations');
    const seed: Record<string, boolean> = {};
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(dir, f), 'utf8');
      const i = sql.indexOf('INSERT INTO public.tier_limits');
      if (i < 0) continue;
      const block = sql.slice(i, sql.indexOf('ON CONFLICT', i));
      for (const m of block.matchAll(/\('(\w+)',\s*(?:NULL|\d+),\s*(?:NULL|\d+),\s*(?:NULL|\d+),\s*(true|false),/g)) {
        seed[m[1]] = m[2] === 'true';
      }
    }
    expect(seed.solo).toBe(false);
    expect(seed.community).toBe(false);
    for (const t of ['trial', 'pro', 'clinic', 'enterprise']) expect(seed[t]).toBe(true);
  }, 60_000);
});

describe('every gated function actually calls its gate', () => {
  const read = (fn: string) => readFileSync(resolve(__dirname, `../../supabase/functions/${fn}/index.ts`), 'utf8');

  it.each(['patient-ai-chat', 'parse-lab-report'])('%s refuses non-Plus patients', (fn) => {
    const src = read(fn);
    expect(src).toContain('checkPatientAi(');
    expect(src).toContain('gateBody(plan)');
    // The old premium-only literal locked out family and enterprise.
    expect(src).not.toMatch(/subscription_tier\s*!==\s*['"]premium['"]/);
  });

  it('summarize-health-document gates the owner, not a clinician reading a shared document', () => {
    const src = read('summarize-health-document');
    expect(src).toMatch(/isOwner && !patientHasPlus\(/);
    expect(src).not.toMatch(/subscription_tier\s*!==\s*["']premium["']/);
  });

  it.each(['encounter-scribe', 'clinician-dictation-process', 'voice-memo-process', 'transcribe-segment'])(
    '%s refuses plans without the scribe before any audio is fetched or processed',
    (fn) => {
      const src = read(fn);
      expect(src).toContain('checkScribe(');
      expect(src).toContain('gateBody(plan)');
      const gate = src.indexOf('checkScribe(');
      const firstWork = Math.min(
        ...['storage', 'req.formData', 'fetch('].map((k) => {
          const i = src.indexOf(k, gate - 1);
          return i < 0 ? Infinity : i;
        }),
      );
      expect(gate).toBeLessThan(firstWork);
    },
  );

  it('transcribe-recording (the patient recording feature) and clinician-ai-chat are left alone', () => {
    expect(read('transcribe-recording')).not.toContain('plan-gates');
    expect(read('clinician-ai-chat')).not.toContain('plan-gates');
  });
});
