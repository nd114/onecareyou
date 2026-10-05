/**
 * Add-on billing logic that has no Deno or Stripe-SDK dependency, so vitest can
 * test it (see src/test/addon-events.test.ts). Two edge functions use it:
 *
 *   create-addon-checkout  validates the request and decides whether the caller's
 *                          plan can buy the add-on, and which Stripe price to use.
 *   stripe-webhook         turns a verified Stripe event into one call of
 *                          apply_addon_change (or into "ignore" / "log only").
 *
 * Nothing here touches the network, a database or a secret. It never sees card
 * data, and it carries no patient data: a practice id, an add-on kind, a count
 * and a Stripe event id are the whole vocabulary.
 */

export type AddonKind = 'clinician_seat' | 'staff_seat' | 'scribe_pack';

export const ADDON_KINDS: readonly AddonKind[] = ['clinician_seat', 'staff_seat', 'scribe_pack'];

/** Largest quantity one checkout may ask for. The plan's own seat_max still applies. */
export const MAX_QUANTITY: Record<AddonKind, number> = {
  clinician_seat: 100,
  staff_seat: 500,
  scribe_pack: 50,
};

/** apply_addon_change refuses a change larger than this; matched so we never send one. */
export const MAX_APPLY_QTY = 1000;
export const MAX_PACK_MINUTES = 100000;

/** Environment variables that hold Stripe price ids (created by the founder in Stripe). */
export const PRICE_ENV = {
  clinician_seat_practice: 'STRIPE_PRICE_CLINICIAN_SEAT_PRACTICE',
  clinician_seat_clinic: 'STRIPE_PRICE_CLINICIAN_SEAT_CLINIC',
  staff_seat: 'STRIPE_PRICE_STAFF_SEAT',
  scribe_pack: 'STRIPE_PRICE_SCRIBE_PACK',
} as const;

/** Environment variable: how many scribe minutes one pack unit holds. */
export const PACK_MINUTES_ENV = 'STRIPE_SCRIBE_PACK_MINUTES';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_ID_RE = /^price_[A-Za-z0-9]+$/;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function isAddonKind(v: unknown): v is AddonKind {
  return typeof v === 'string' && (ADDON_KINDS as readonly string[]).includes(v);
}

/** A whole number from a number or a numeric string, or null. */
function wholeNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d{1,9}$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** Minutes per pack: a whole number 1..100000, or null. */
export function parsePackMinutes(v: unknown): number | null {
  const n = wholeNumber(v);
  return n !== null && n >= 1 && n <= MAX_PACK_MINUTES ? n : null;
}

// ---------------------------------------------------------------------------
// create-addon-checkout
// ---------------------------------------------------------------------------

export interface CheckoutRequest {
  practice_id: string;
  kind: AddonKind;
  quantity: number;
}

export type CheckoutValidation =
  | { ok: true; value: CheckoutRequest }
  | { ok: false; error: string };

/** Request body: {practice_id, kind, quantity}. Quantity must be a whole number. */
export function validateCheckoutRequest(body: unknown): CheckoutValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request' };
  }
  const b = body as Record<string, unknown>;
  if (!isUuid(b.practice_id)) return { ok: false, error: 'A valid practice is required' };
  if (!isAddonKind(b.kind)) return { ok: false, error: 'Unknown add-on' };
  if (typeof b.quantity !== 'number' || !Number.isInteger(b.quantity)) {
    return { ok: false, error: 'Quantity must be a whole number' };
  }
  const max = MAX_QUANTITY[b.kind];
  if (b.quantity < 1 || b.quantity > max) {
    return { ok: false, error: `Quantity must be between 1 and ${max}` };
  }
  return { ok: true, value: { practice_id: b.practice_id, kind: b.kind, quantity: b.quantity } };
}

/** The slice of practice_account_overview this decision reads. */
export interface OverviewForCheckout {
  practice?: { tenant_type?: string | null; tier?: string | null } | null;
  seats?: {
    clinician?: { included?: number | null; purchased?: number | null; max?: number | null } | null;
    staff?: { model?: string | null } | null;
  } | null;
}

export type Eligibility =
  | { ok: true; priceEnv: string }
  | { ok: false; code: string; error: string };

/** Plans whose price list has add-on clinician seats, and the price variable for each. */
const CLINICIAN_PRICE_ENV_BY_TIER: Record<string, string> = {
  pro: PRICE_ENV.clinician_seat_practice,
  clinic: PRICE_ENV.clinician_seat_clinic,
};

/** Plans that can buy scribe packs. Never Individual (solo), Community, trial or expired. */
const SCRIBE_PACK_TIERS = new Set(['pro', 'clinic', 'enterprise']);

/**
 * Whether this practice's plan can buy the add-on, and which price variable it
 * uses. The same rules apply_addon_change enforces again when the payment lands;
 * checking here stops a person paying for something that cannot be applied.
 */
export function checkoutEligibility(kind: AddonKind, quantity: number, ov: OverviewForCheckout): Eligibility {
  const tenant = ov.practice?.tenant_type ?? null;
  const tier = ov.practice?.tier ?? null;
  const staffModel = ov.seats?.staff?.model ?? null;

  if (kind === 'scribe_pack') {
    if (!tier || !SCRIBE_PACK_TIERS.has(tier)) {
      return { ok: false, code: 'not_applicable', error: 'Scribe minutes packs are not available on this plan' };
    }
    return { ok: true, priceEnv: PRICE_ENV.scribe_pack };
  }

  if (tenant !== 'practice' || staffModel !== 'staff_paid') {
    return {
      ok: false,
      code: 'not_applicable',
      error:
        kind === 'clinician_seat'
          ? 'Extra clinician seats are not available on this plan'
          : 'Paid staff seats are not available on this plan',
    };
  }

  if (kind === 'staff_seat') return { ok: true, priceEnv: PRICE_ENV.staff_seat };

  const priceEnv = tier ? CLINICIAN_PRICE_ENV_BY_TIER[tier] : undefined;
  if (!priceEnv) {
    return { ok: false, code: 'not_applicable', error: 'Extra clinician seats are not available on this plan' };
  }
  const c = ov.seats?.clinician;
  if (c?.included === null || c?.included === undefined) {
    return { ok: false, code: 'not_applicable', error: 'This plan already has no clinician seat limit' };
  }
  const max = c.max ?? null;
  if (max !== null) {
    const have = c.included + (c.purchased ?? 0);
    if (have + quantity > max) {
      const room = Math.max(0, max - have);
      return {
        ok: false,
        code: 'seat_max',
        error: `This plan allows at most ${max} clinicians; you can add ${room} more`,
      };
    }
  }
  return { ok: true, priceEnv };
}

/** The price id in the environment, or null when unset or not shaped like a Stripe price. */
export function resolvePriceId(
  priceEnv: string,
  env: Record<string, string | undefined>,
): string | null {
  const v = (env[priceEnv] ?? '').trim();
  return PRICE_ID_RE.test(v) ? v : null;
}

/** Seats renew monthly (subscription); a pack is bought once (payment). */
export function checkoutModeFor(kind: AddonKind): 'subscription' | 'payment' {
  return kind === 'scribe_pack' ? 'payment' : 'subscription';
}

export interface CheckoutMetadataInput {
  practice_id: string;
  kind: AddonKind;
  quantity: number;
  initiated_by: string;
  pack_minutes?: number | null;
}

/** Stripe metadata values are strings. No names, emails or patient data go in. */
export function buildCheckoutMetadata(i: CheckoutMetadataInput): Record<string, string> {
  const m: Record<string, string> = {
    practice_id: i.practice_id,
    kind: i.kind,
    quantity: String(i.quantity),
    initiated_by: i.initiated_by,
  };
  if (i.kind === 'scribe_pack' && i.pack_minutes) m.pack_minutes = String(i.pack_minutes);
  return m;
}

// ---------------------------------------------------------------------------
// stripe-webhook
// ---------------------------------------------------------------------------

export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: unknown; previous_attributes?: unknown };
}

export interface MapConfig {
  /** Fallback minutes per pack when the session carries none (STRIPE_SCRIBE_PACK_MINUTES). */
  packMinutes: number | null;
}

export type AddonAction =
  | {
      action: 'apply';
      stripe_event_id: string;
      practice_id: string;
      addon: AddonKind;
      qty: number;
      pack_minutes: number | null;
    }
  | { action: 'log'; stripe_event_id: string; reason: string }
  | { action: 'ignore'; stripe_event_id: string; reason: string }
  | { action: 'invalid'; stripe_event_id: string; reason: string };

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Sum of item quantities in a Stripe list ({data:[{quantity}]}), or null when unreadable. */
function sumItemQuantities(items: unknown): number | null {
  const list = rec(items)?.data;
  if (!Array.isArray(list) || list.length === 0) return null;
  let total = 0;
  for (const it of list) {
    const q = rec(it)?.quantity;
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 0) return null;
    total += q;
  }
  return total;
}

type MetaRead =
  | { state: 'none' }
  | { state: 'incomplete' }
  | { state: 'ok'; practice_id: string; kind: AddonKind; raw: Record<string, unknown> };

/**
 * Add-on objects carry practice_id and kind in metadata. An object with neither
 * belongs to another flow (the clinician plan checkout uses the same Stripe
 * account) and is simply not ours; one with only some of them is a fault worth
 * logging.
 */
function readMeta(object: Record<string, unknown>): MetaRead {
  const m = rec(object.metadata);
  const hasId = !!m && m.practice_id !== undefined && m.practice_id !== '';
  const hasKind = !!m && m.kind !== undefined && m.kind !== '';
  if (!m || (!hasId && !hasKind)) return { state: 'none' };
  if (!isUuid(m.practice_id) || !isAddonKind(m.kind)) return { state: 'incomplete' };
  return { state: 'ok', practice_id: m.practice_id, kind: m.kind, raw: m };
}

/**
 * One verified Stripe event to one action.
 *
 *   checkout.session.completed       seats: +quantity; pack: +quantity packs
 *   customer.subscription.updated    seat quantity change: new minus previous
 *   customer.subscription.deleted    all seats on that subscription removed
 *   invoice.payment_failed           log only (no seat changes in this step)
 *   anything else                    ignored
 *
 * The Stripe event id travels with the action; apply_addon_change keys on it, so
 * Stripe's redelivery of the same event does nothing the second time.
 */
export function mapStripeEvent(event: StripeEventLike, config: MapConfig): AddonAction {
  const id = event.id;
  const ignore = (reason: string): AddonAction => ({ action: 'ignore', stripe_event_id: id, reason });
  const invalid = (reason: string): AddonAction => ({ action: 'invalid', stripe_event_id: id, reason });

  const obj = rec(event.data?.object);

  switch (event.type) {
    case 'invoice.payment_failed':
      return { action: 'log', stripe_event_id: id, reason: 'payment_failed' };

    case 'checkout.session.completed': {
      if (!obj) return invalid('missing_object');
      const meta = readMeta(obj);
      if (meta.state === 'none') return ignore('not_an_addon');
      if (meta.state === 'incomplete') return invalid('missing_metadata');
      const paid = obj.payment_status;
      if (paid !== 'paid' && paid !== 'no_payment_required') return ignore('not_paid');
      const qty = wholeNumber(meta.raw.quantity);
      if (qty === null || qty < 1 || qty > MAX_APPLY_QTY) return invalid('bad_quantity');
      let packMinutes: number | null = null;
      if (meta.kind === 'scribe_pack') {
        packMinutes = parsePackMinutes(meta.raw.pack_minutes) ?? config.packMinutes;
        if (packMinutes === null) return invalid('pack_minutes_unknown');
      }
      return {
        action: 'apply',
        stripe_event_id: id,
        practice_id: meta.practice_id,
        addon: meta.kind,
        qty,
        pack_minutes: packMinutes,
      };
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      if (!obj) return invalid('missing_object');
      const meta = readMeta(obj);
      if (meta.state === 'none') return ignore('not_an_addon');
      if (meta.state === 'incomplete') return invalid('missing_metadata');
      if (meta.kind === 'scribe_pack') return ignore('not_a_seat_subscription');

      const now = sumItemQuantities(obj.items);
      let delta: number;
      if (event.type === 'customer.subscription.deleted') {
        if (now === null || now === 0) return ignore('no_seats');
        delta = -now;
      } else {
        const prevItems = rec(event.data.previous_attributes)?.items;
        const before = prevItems === undefined ? null : sumItemQuantities(prevItems);
        if (now === null || before === null) return ignore('no_quantity_change');
        delta = now - before;
        if (delta === 0) return ignore('no_quantity_change');
      }
      if (Math.abs(delta) > MAX_APPLY_QTY) return invalid('bad_quantity');
      return {
        action: 'apply',
        stripe_event_id: id,
        practice_id: meta.practice_id,
        addon: meta.kind,
        qty: delta,
        pack_minutes: null,
      };
    }

    default:
      return ignore('unhandled_event_type');
  }
}

/** The named arguments for apply_addon_change. */
export function applyArgs(a: Extract<AddonAction, { action: 'apply' }>) {
  return {
    _practice_id: a.practice_id,
    _addon: a.addon,
    _qty: a.qty,
    _stripe_event_id: a.stripe_event_id,
    _pack_minutes: a.pack_minutes,
  };
}

/**
 * apply_addon_change statuses. Every one is answered to Stripe with 200: a
 * refusal (rejected_in_use, rejected_seat_max, ...) is a business outcome that a
 * retry cannot change, and a duplicate is the idempotency guard doing its job.
 * Only 'applied' and 'duplicate' are quiet; the rest are logged as warnings so
 * someone can follow up.
 */
export function classifyApplyStatus(status: unknown): { level: 'info' | 'warn'; status: string } {
  const s = typeof status === 'string' ? status : 'unknown';
  return { level: s === 'applied' || s === 'duplicate' ? 'info' : 'warn', status: s };
}

/**
 * A database error that no retry can fix (bad arguments, SQLSTATE 22023) is
 * logged and answered 200 so Stripe does not redeliver it for days. Anything
 * else (connection, permission, timeout) answers 500 so Stripe retries; the
 * event-id guard makes a retry safe.
 */
export function isPermanentRpcError(err: { code?: string | null } | null | undefined): boolean {
  return !!err && err.code === '22023';
}

export type WebhookPrecheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * Before any signature maths: only POST, a configured signing secret, and a
 * signature header. Unsigned requests are rejected here; a signed one that does
 * not verify is rejected by the Stripe library in the function.
 */
export function precheckWebhook(input: {
  method: string;
  signature: string | null | undefined;
  secretConfigured: boolean;
}): WebhookPrecheck {
  if (input.method !== 'POST') return { ok: false, status: 405, error: 'method_not_allowed' };
  if (!input.secretConfigured) return { ok: false, status: 500, error: 'webhook_not_configured' };
  if (!input.signature || !input.signature.trim()) return { ok: false, status: 400, error: 'missing_signature' };
  return { ok: true };
}
