import type { Invoice, InvoiceLineItem, Money } from "@medplum/fhirtypes";

/**
 * ISO 4217, as Medplum types it.
 *
 * Worth taking rather than using `string`: it makes the compiler refuse a
 * currency the CHECK constraint on fhir_invoices.currency would also refuse, so
 * the two layers agree without anyone maintaining a second list.
 */
export type CurrencyCode = NonNullable<Money["currency"]>;

/**
 * The neutral default, used when a tenant has not chosen one.
 *
 * USD because the platform is international rather than a Nigerian product with
 * international ambitions; a tenant anywhere sets its own in practice settings,
 * and an issued invoice then keeps the currency it was raised in.
 */
export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/**
 * Invoices, as FHIR, and the money arithmetic that goes with them.
 *
 * Amounts are minor units — cents, pence, kobo — as integers, everywhere.
 * `0.1 + 0.2` is not `0.3` in binary floating point, and a rounding error in a
 * balance is a bug somebody has to be refunded for. Nothing in this file holds
 * an amount as a float; converting to a decimal happens at the last moment, for
 * display or for the FHIR resource.
 *
 * **The minor unit is not always a hundredth.** JPY and KRW have none, so ¥1000
 * is stored as 1000; KWD and TND have three, so 1.500 KWD is 1500. Dividing by
 * 100 unconditionally is right for most of the world and wrong for a tenant in
 * Tokyo or Kuwait City, so the exponent is asked for rather than assumed.
 */

export type InvoiceStatus = "draft" | "issued" | "balanced" | "cancelled" | "entered-in-error";

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  sequence: number;
  description: string;
  code: string | null;
  quantity: number | string;
  unit_price_minor: number | string;
  amount_minor: number | string;
}

export interface InvoiceRow {
  id: string;
  practice_id: string | null;
  patient_user_id: string;
  encounter_id: string | null;
  status: string;
  invoice_number: string;
  issued_at: string | null;
  due_at: string | null;
  currency: CurrencyCode;
  total_minor: number | string;
  paid_minor: number | string;
  platform_fee_minor: number | string;
  note: string | null;
  resource: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: InvoiceItemRow[];
}

/** Postgres bigint arrives as a string over the wire. Never as a float. */
export function toMinor(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Math.round(value);
  return Number.isFinite(n) ? n : 0;
}

/** What is still owed. Never below zero, whatever the columns say. */
export function balanceMinor(row: Pick<InvoiceRow, "total_minor" | "paid_minor">): number {
  return Math.max(0, toMinor(row.total_minor) - toMinor(row.paid_minor));
}

/**
 * Minor units as money the patient recognises.
 *
 * Uses Intl so each patient sees their own currency's symbol and separators,
 * and so the number of decimal places is the currency's rather than a guess.
 * This is the one place a decimal appears, after all arithmetic is done.
 */
export function minorUnitDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || DEFAULT_CURRENCY,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

/** Minor units as the decimal amount, using the currency's own exponent. */
export function toMajor(minor: number | string, currency: string): number {
  const digits = minorUnitDigits(currency);
  return toMinor(minor) / 10 ** digits;
}

/** A decimal amount as minor units, rounded to a whole one. */
export function toMinorUnits(major: number, currency: string): number {
  const digits = minorUnitDigits(currency);
  return Math.round(major * 10 ** digits);
}

export function formatMoney(minor: number | string, currency: string, locale?: string): string {
  const amount = toMajor(minor, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || DEFAULT_CURRENCY,
    }).format(amount);
  } catch {
    // Intl handles any well-formed three-letter code, prefixing an unfamiliar
    // one — so this catches malformed input only ('', 'zz', 'NOTACODE' all
    // throw RangeError). Showing a bare number beats a blank where an amount
    // should be.
    return `${currency} ${amount.toFixed(minorUnitDigits(currency))}`;
  }
}

/** A line item's amount, computed rather than trusted, in minor units. */
export function lineAmountMinor(quantity: number, unitPriceMinor: number): number {
  return Math.round(quantity * unitPriceMinor);
}

/**
 * The FHIR Invoice for a row and its lines.
 *
 * `totalGross` is FHIR's field for what was charged; `paymentTerms` is where a
 * due date belongs. Line items carry a `priceComponent` of type `base`, which
 * is what an ordinary charge is — a discount or a tax would be its own
 * component, and none is invented here.
 */
export function toFhirInvoice(row: InvoiceRow, items: InvoiceItemRow[] = []): Invoice {
  const lineItem: InvoiceLineItem[] = items.map((item, index) => ({
    sequence: item.sequence ?? index + 1,
    // chargeItem[x] is required — a line item must say what is being charged
    // for, not only how much. The description is the honest value: a practice's
    // own service code goes in `code` when it has one, and none is invented.
    chargeItemCodeableConcept: item.code
      ? { coding: [{ code: item.code }], text: item.description }
      : { text: item.description },
    priceComponent: [
      {
        type: "base",
        code: item.code ? { text: item.code } : { text: item.description },
        amount: {
          value: toMajor(item.amount_minor, row.currency),
          currency: row.currency,
        },
      },
    ],
  }));

  const invoice: Invoice = {
    resourceType: "Invoice",
    id: row.id,
    status: row.status as Invoice["status"],
    identifier: [{ value: row.invoice_number }],
    subject: { reference: `Patient/${row.patient_user_id}` },
    totalGross: { value: toMajor(row.total_minor, row.currency), currency: row.currency },
  };

  if (row.issued_at) invoice.date = row.issued_at;
  if (lineItem.length > 0) invoice.lineItem = lineItem;
  if (row.due_at) invoice.paymentTerms = `Due ${row.due_at}`;
  if (row.note) invoice.note = [{ text: row.note }];

  return invoice;
}

/** Is there anything left to pay? Cancelled invoices are not owed. */
export function isOutstanding(row: InvoiceRow): boolean {
  if (row.status === "cancelled" || row.status === "entered-in-error") return false;
  return balanceMinor(row) > 0;
}

/** Past its due date with money still on it. */
export function isOverdue(row: InvoiceRow, now: Date = new Date()): boolean {
  if (!isOutstanding(row) || !row.due_at) return false;
  return new Date(row.due_at) < now;
}
