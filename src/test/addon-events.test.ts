import { describe, expect, it } from 'vitest';
import {
  applyArgs,
  buildCheckoutMetadata,
  checkoutEligibility,
  checkoutModeFor,
  classifyApplyStatus,
  isPermanentRpcError,
  mapStripeEvent,
  parsePackMinutes,
  precheckWebhook,
  resolvePriceId,
  validateCheckoutRequest,
  type AddonAction,
  type OverviewForCheckout,
  type StripeEventLike,
} from '../../supabase/functions/_shared/addon-events';

const PRACTICE = '11111111-2222-4333-8444-555555555555';
const USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CFG = { packMinutes: 500 };

function event(type: string, object: unknown, previous?: unknown, id = 'evt_1'): StripeEventLike {
  return { id, type, data: { object, previous_attributes: previous } };
}

const items = (...q: number[]) => ({ data: q.map((quantity) => ({ quantity })) });
const meta = (kind: string, extra: Record<string, string> = {}) => ({
  practice_id: PRACTICE,
  kind,
  initiated_by: USER,
  ...extra,
});

describe('validateCheckoutRequest', () => {
  const ok = { practice_id: PRACTICE, kind: 'staff_seat', quantity: 3 };

  it('accepts each kind with a whole quantity in range', () => {
    for (const kind of ['clinician_seat', 'staff_seat', 'scribe_pack']) {
      expect(validateCheckoutRequest({ ...ok, kind }).ok).toBe(true);
    }
  });

  it('rejects an unknown kind, a bad practice id and a non-object', () => {
    expect(validateCheckoutRequest({ ...ok, kind: 'storage_pack' }).ok).toBe(false);
    expect(validateCheckoutRequest({ ...ok, practice_id: 'nope' }).ok).toBe(false);
    expect(validateCheckoutRequest(null).ok).toBe(false);
    expect(validateCheckoutRequest([]).ok).toBe(false);
  });

  it('rejects zero, negative, fractional, string, NaN and over-limit quantities', () => {
    for (const quantity of [0, -1, 1.5, '3', NaN, Infinity, null, undefined, 101]) {
      expect(validateCheckoutRequest({ ...ok, kind: 'clinician_seat', quantity }).ok, String(quantity)).toBe(false);
    }
    expect(validateCheckoutRequest({ ...ok, kind: 'scribe_pack', quantity: 51 }).ok).toBe(false);
    expect(validateCheckoutRequest({ ...ok, kind: 'staff_seat', quantity: 501 }).ok).toBe(false);
    expect(validateCheckoutRequest({ ...ok, kind: 'staff_seat', quantity: 500 }).ok).toBe(true);
  });
});

describe('checkoutEligibility', () => {
  const ov = (
    tier: string,
    over: Partial<{ tenant: string; model: string; included: number | null; purchased: number; max: number | null }> = {},
  ): OverviewForCheckout => ({
    practice: { tenant_type: over.tenant ?? 'practice', tier },
    seats: {
      clinician: {
        included: over.included === undefined ? 3 : over.included,
        purchased: over.purchased ?? 0,
        max: over.max === undefined ? null : over.max,
      },
      staff: { model: over.model ?? 'staff_paid' },
    },
  });

  it('uses the Practice price for pro and the Clinic price for clinic', () => {
    const a = checkoutEligibility('clinician_seat', 1, ov('pro'));
    const b = checkoutEligibility('clinician_seat', 1, ov('clinic', { included: 10, max: 30 }));
    expect(a).toEqual({ ok: true, priceEnv: 'STRIPE_PRICE_CLINICIAN_SEAT_PRACTICE' });
    expect(b).toEqual({ ok: true, priceEnv: 'STRIPE_PRICE_CLINICIAN_SEAT_CLINIC' });
  });

  it('respects the plan seat_max, counting seats already bought', () => {
    const clinic = (purchased: number) => ov('clinic', { included: 10, max: 30, purchased });
    expect(checkoutEligibility('clinician_seat', 20, clinic(0)).ok).toBe(true);
    const over = checkoutEligibility('clinician_seat', 21, clinic(0));
    expect(over).toMatchObject({ ok: false, code: 'seat_max' });
    expect(checkoutEligibility('clinician_seat', 6, clinic(15))).toMatchObject({ ok: false, code: 'seat_max' });
    expect(checkoutEligibility('clinician_seat', 5, clinic(15)).ok).toBe(true);
  });

  it('refuses clinician seats off the staff_paid practice plans', () => {
    for (const bad of [
      ov('solo', { model: 'shared' }),
      ov('community', { model: 'shared' }),
      ov('trial', { model: 'shared' }),
      ov('enterprise', { model: 'unlimited', tenant: 'hospital', included: 25 }),
      ov('pro', { tenant: 'hospital' }),
    ]) {
      expect(checkoutEligibility('clinician_seat', 1, bad)).toMatchObject({ ok: false, code: 'not_applicable' });
    }
  });

  it('refuses clinician seats on a plan with unlimited seats', () => {
    expect(checkoutEligibility('clinician_seat', 1, ov('pro', { included: null }))).toMatchObject({
      ok: false,
      code: 'not_applicable',
    });
  });

  it('sells staff seats only on staff_paid practice plans', () => {
    expect(checkoutEligibility('staff_seat', 2, ov('pro'))).toEqual({
      ok: true,
      priceEnv: 'STRIPE_PRICE_STAFF_SEAT',
    });
    expect(checkoutEligibility('staff_seat', 2, ov('solo', { model: 'shared' })).ok).toBe(false);
    expect(checkoutEligibility('staff_seat', 2, ov('enterprise', { model: 'unlimited' })).ok).toBe(false);
    expect(checkoutEligibility('staff_seat', 2, ov('pro', { tenant: 'hospital' })).ok).toBe(false);
  });

  it('sells scribe packs to practice, clinic and enterprise, never Individual or Community', () => {
    for (const tier of ['pro', 'clinic', 'enterprise']) {
      expect(checkoutEligibility('scribe_pack', 1, ov(tier)), tier).toEqual({
        ok: true,
        priceEnv: 'STRIPE_PRICE_SCRIBE_PACK',
      });
    }
    for (const tier of ['solo', 'community', 'trial', 'expired']) {
      expect(checkoutEligibility('scribe_pack', 1, ov(tier, { model: 'shared' })), tier).toMatchObject({
        ok: false,
        code: 'not_applicable',
      });
    }
  });

  it('refuses an empty overview rather than guessing', () => {
    expect(checkoutEligibility('scribe_pack', 1, {}).ok).toBe(false);
    expect(checkoutEligibility('staff_seat', 1, {}).ok).toBe(false);
    expect(checkoutEligibility('clinician_seat', 1, {}).ok).toBe(false);
  });
});

describe('price ids, mode and metadata', () => {
  it('reads a price id only when it is set and shaped like one', () => {
    expect(resolvePriceId('X', { X: 'price_1Abc23' })).toBe('price_1Abc23');
    expect(resolvePriceId('X', { X: ' price_1Abc23 ' })).toBe('price_1Abc23');
    expect(resolvePriceId('X', {})).toBeNull();
    expect(resolvePriceId('X', { X: '' })).toBeNull();
    expect(resolvePriceId('X', { X: 'prod_123' })).toBeNull();
    expect(resolvePriceId('X', { X: 'price_a b' })).toBeNull();
  });

  it('is a subscription for seats and a one-off payment for packs', () => {
    expect(checkoutModeFor('clinician_seat')).toBe('subscription');
    expect(checkoutModeFor('staff_seat')).toBe('subscription');
    expect(checkoutModeFor('scribe_pack')).toBe('payment');
  });

  it('builds string-only metadata, with pack minutes only for packs', () => {
    const seat = buildCheckoutMetadata({
      practice_id: PRACTICE,
      kind: 'staff_seat',
      quantity: 3,
      initiated_by: USER,
      pack_minutes: 500,
    });
    expect(seat).toEqual({ practice_id: PRACTICE, kind: 'staff_seat', quantity: '3', initiated_by: USER });
    const pack = buildCheckoutMetadata({
      practice_id: PRACTICE,
      kind: 'scribe_pack',
      quantity: 2,
      initiated_by: USER,
      pack_minutes: 500,
    });
    expect(pack.pack_minutes).toBe('500');
    expect(Object.values(pack).every((v) => typeof v === 'string')).toBe(true);
  });

  it('parses minutes per pack as a whole number 1..100000', () => {
    expect(parsePackMinutes('500')).toBe(500);
    expect(parsePackMinutes(500)).toBe(500);
    for (const bad of [undefined, null, '', '0', '-5', '1.5', 'abc', '100001', 5.5]) {
      expect(parsePackMinutes(bad), String(bad)).toBeNull();
    }
  });
});

describe('mapStripeEvent: checkout.session.completed', () => {
  const session = (kind: string, extra: Record<string, string> = {}, over: Record<string, unknown> = {}) => ({
    payment_status: 'paid',
    metadata: meta(kind, { quantity: '2', ...extra }),
    ...over,
  });

  it('adds purchased clinician seats', () => {
    expect(mapStripeEvent(event('checkout.session.completed', session('clinician_seat')), CFG)).toEqual({
      action: 'apply',
      stripe_event_id: 'evt_1',
      practice_id: PRACTICE,
      addon: 'clinician_seat',
      qty: 2,
      pack_minutes: null,
    });
  });

  it('adds purchased staff seats', () => {
    const a = mapStripeEvent(event('checkout.session.completed', session('staff_seat')), CFG);
    expect(a).toMatchObject({ action: 'apply', addon: 'staff_seat', qty: 2, pack_minutes: null });
  });

  it('adds a scribe pack, taking minutes from the session metadata first', () => {
    const a = mapStripeEvent(event('checkout.session.completed', session('scribe_pack', { pack_minutes: '750' })), CFG);
    expect(a).toMatchObject({ action: 'apply', addon: 'scribe_pack', qty: 2, pack_minutes: 750 });
  });

  it('falls back to the configured minutes when the session has none', () => {
    const a = mapStripeEvent(event('checkout.session.completed', session('scribe_pack')), CFG);
    expect(a).toMatchObject({ action: 'apply', pack_minutes: 500 });
  });

  it('reports a pack with no minutes anywhere as invalid, not applied', () => {
    const a = mapStripeEvent(event('checkout.session.completed', session('scribe_pack')), { packMinutes: null });
    expect(a).toMatchObject({ action: 'invalid', reason: 'pack_minutes_unknown' });
  });

  it('ignores a session that is not an add-on (the clinician plan checkout)', () => {
    const a = mapStripeEvent(
      event('checkout.session.completed', { payment_status: 'paid', metadata: { tier: 'pro' } }),
      CFG,
    );
    expect(a).toMatchObject({ action: 'ignore', reason: 'not_an_addon' });
    expect(mapStripeEvent(event('checkout.session.completed', { payment_status: 'paid' }), CFG)).toMatchObject({
      action: 'ignore',
    });
  });

  it('flags partial or malformed metadata as invalid', () => {
    const bits: Record<string, unknown>[] = [
      { practice_id: PRACTICE },
      { kind: 'staff_seat', quantity: '1' },
      { practice_id: 'not-a-uuid', kind: 'staff_seat', quantity: '1' },
      { practice_id: PRACTICE, kind: 'storage_pack', quantity: '1' },
    ];
    for (const metadata of bits) {
      const a = mapStripeEvent(event('checkout.session.completed', { payment_status: 'paid', metadata }), CFG);
      expect(a, JSON.stringify(metadata)).toMatchObject({ action: 'invalid', reason: 'missing_metadata' });
    }
  });

  it('flags a missing or silly quantity as invalid', () => {
    for (const quantity of [undefined, '0', '-1', 'x', '1001', '1.5']) {
      const metadata = meta('staff_seat', quantity === undefined ? {} : { quantity });
      const a = mapStripeEvent(event('checkout.session.completed', { payment_status: 'paid', metadata }), CFG);
      expect(a, String(quantity)).toMatchObject({ action: 'invalid', reason: 'bad_quantity' });
    }
  });

  it('waits for payment: an unpaid session is not applied', () => {
    const a = mapStripeEvent(event('checkout.session.completed', session('staff_seat', {}, { payment_status: 'unpaid' })), CFG);
    expect(a).toMatchObject({ action: 'ignore', reason: 'not_paid' });
  });

  it('handles a missing object without throwing', () => {
    expect(mapStripeEvent(event('checkout.session.completed', null), CFG)).toMatchObject({ action: 'invalid' });
  });
});

describe('mapStripeEvent: customer.subscription.updated', () => {
  const sub = (kind: string, now: number[]) => ({ metadata: meta(kind), items: items(...now) });

  it('applies the increase when seats go up', () => {
    const a = mapStripeEvent(
      event('customer.subscription.updated', sub('staff_seat', [5]), { items: items(3) }),
      CFG,
    ) as Extract<AddonAction, { action: 'apply' }>;
    expect(a).toMatchObject({ action: 'apply', addon: 'staff_seat', qty: 2, practice_id: PRACTICE });
    expect(a.pack_minutes).toBeNull();
  });

  it('applies a reduction as a negative change (the reduction path)', () => {
    const a = mapStripeEvent(
      event('customer.subscription.updated', sub('clinician_seat', [2]), { items: items(5) }),
      CFG,
    );
    expect(a).toMatchObject({ action: 'apply', addon: 'clinician_seat', qty: -3 });
  });

  it('ignores updates that do not change the quantity', () => {
    const noPrev = mapStripeEvent(event('customer.subscription.updated', sub('staff_seat', [3]), { status: 'active' }), CFG);
    expect(noPrev).toMatchObject({ action: 'ignore', reason: 'no_quantity_change' });
    const noAttrs = mapStripeEvent(event('customer.subscription.updated', sub('staff_seat', [3])), CFG);
    expect(noAttrs).toMatchObject({ action: 'ignore', reason: 'no_quantity_change' });
    const same = mapStripeEvent(
      event('customer.subscription.updated', sub('staff_seat', [3]), { items: items(3) }),
      CFG,
    );
    expect(same).toMatchObject({ action: 'ignore', reason: 'no_quantity_change' });
  });

  it('ignores subscriptions that are not add-ons, and a scribe_pack subscription', () => {
    expect(
      mapStripeEvent(
        event('customer.subscription.updated', { metadata: { tier: 'pro' }, items: items(1) }, { items: items(2) }),
        CFG,
      ),
    ).toMatchObject({ action: 'ignore', reason: 'not_an_addon' });
    expect(
      mapStripeEvent(event('customer.subscription.updated', sub('scribe_pack', [2]), { items: items(1) }), CFG),
    ).toMatchObject({ action: 'ignore' });
  });

  it('flags missing metadata on an add-on subscription as invalid', () => {
    const a = mapStripeEvent(
      event('customer.subscription.updated', { metadata: { kind: 'staff_seat' }, items: items(3) }, { items: items(2) }),
      CFG,
    );
    expect(a).toMatchObject({ action: 'invalid', reason: 'missing_metadata' });
  });
});

describe('mapStripeEvent: customer.subscription.deleted', () => {
  it('removes every seat on the subscription', () => {
    const a = mapStripeEvent(
      event('customer.subscription.deleted', { metadata: meta('staff_seat'), items: items(4) }),
      CFG,
    );
    expect(a).toMatchObject({ action: 'apply', addon: 'staff_seat', qty: -4 });
  });

  it('sums several items', () => {
    const a = mapStripeEvent(
      event('customer.subscription.deleted', { metadata: meta('clinician_seat'), items: items(2, 3) }),
      CFG,
    );
    expect(a).toMatchObject({ qty: -5 });
  });

  it('ignores a deleted subscription with no seats or no add-on metadata', () => {
    expect(
      mapStripeEvent(event('customer.subscription.deleted', { metadata: meta('staff_seat'), items: items(0) }), CFG),
    ).toMatchObject({ action: 'ignore', reason: 'no_seats' });
    expect(
      mapStripeEvent(event('customer.subscription.deleted', { metadata: { tier: 'solo' }, items: items(1) }), CFG),
    ).toMatchObject({ action: 'ignore', reason: 'not_an_addon' });
  });
});

describe('mapStripeEvent: other events', () => {
  it('only logs invoice.payment_failed', () => {
    const a = mapStripeEvent(event('invoice.payment_failed', { id: 'in_1' }), CFG);
    expect(a).toMatchObject({ action: 'log', reason: 'payment_failed' });
  });

  it('ignores event types it does not know', () => {
    for (const type of ['customer.created', 'invoice.paid', 'payment_intent.succeeded', 'customer.subscription.created', 'charge.refunded']) {
      expect(mapStripeEvent(event(type, { metadata: meta('staff_seat') }), CFG), type).toMatchObject({
        action: 'ignore',
        reason: 'unhandled_event_type',
      });
    }
  });

  it('carries the Stripe event id on every result, for idempotency', () => {
    const e = event('checkout.session.completed', { payment_status: 'paid', metadata: meta('staff_seat', { quantity: '1' }) }, undefined, 'evt_xyz');
    const a = mapStripeEvent(e, CFG) as Extract<AddonAction, { action: 'apply' }>;
    expect(a.stripe_event_id).toBe('evt_xyz');
    expect(applyArgs(a)).toEqual({
      _practice_id: PRACTICE,
      _addon: 'staff_seat',
      _qty: 1,
      _stripe_event_id: 'evt_xyz',
      _pack_minutes: null,
    });
    expect(mapStripeEvent(event('customer.created', {}, undefined, 'evt_abc'), CFG).stripe_event_id).toBe('evt_abc');
  });

  it('maps the same event the same way twice (duplicate delivery is the database guard\'s job)', () => {
    const e = event('customer.subscription.updated', { metadata: meta('staff_seat'), items: items(4) }, { items: items(2) }, 'evt_dup');
    expect(mapStripeEvent(e, CFG)).toEqual(mapStripeEvent(e, CFG));
  });
});

describe('answering Stripe', () => {
  it('treats every apply_addon_change status as a 200-able outcome', () => {
    for (const s of ['applied', 'duplicate']) {
      expect(classifyApplyStatus(s)).toEqual({ level: 'info', status: s });
    }
    for (const s of [
      'rejected_in_use',
      'rejected_seat_max',
      'rejected_negative',
      'not_applicable',
      'unknown_practice',
      'invalid',
      'unknown_addon',
    ]) {
      expect(classifyApplyStatus(s)).toEqual({ level: 'warn', status: s });
    }
    expect(classifyApplyStatus(undefined)).toEqual({ level: 'warn', status: 'unknown' });
  });

  it('retries only transient database errors', () => {
    expect(isPermanentRpcError({ code: '22023' })).toBe(true);
    expect(isPermanentRpcError({ code: '42501' })).toBe(false);
    expect(isPermanentRpcError({ code: '57014' })).toBe(false);
    expect(isPermanentRpcError({})).toBe(false);
    expect(isPermanentRpcError(null)).toBe(false);
  });
});

describe('precheckWebhook (unsigned requests)', () => {
  const base = { method: 'POST', signature: 't=1,v1=abc', secretConfigured: true };

  it('lets a signed POST through to verification', () => {
    expect(precheckWebhook(base)).toEqual({ ok: true });
  });

  it('rejects an unsigned request with 400', () => {
    for (const signature of [null, undefined, '', '   ']) {
      expect(precheckWebhook({ ...base, signature })).toEqual({ ok: false, status: 400, error: 'missing_signature' });
    }
  });

  it('refuses anything but POST', () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      expect(precheckWebhook({ ...base, method })).toMatchObject({ ok: false, status: 405 });
    }
  });

  it('fails closed when the signing secret is not configured', () => {
    expect(precheckWebhook({ ...base, secretConfigured: false })).toMatchObject({ ok: false, status: 500 });
  });
});
