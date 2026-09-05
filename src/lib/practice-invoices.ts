import { balanceMinor, isOverdue, isOutstanding, toMinor, type InvoiceRow } from '@/lib/fhir/invoice';

/**
 * The practice ledger, as opposed to one patient's bill.
 *
 * Billing existed only as a tab inside a patient, so "who owes us what" meant
 * opening every patient in turn. These are the same invoice rows read across
 * people.
 *
 * Totals are per currency and never summed across them. A practice that bills
 * some patients in NGN and some in USD has two numbers, not one; adding them
 * produces a figure that is wrong in both currencies and looks plausible in
 * neither.
 */

/** Statuses that are not money owed to anyone. */
const VOID_STATUSES = new Set(['cancelled', 'entered-in-error']);

/**
 * A draft has not been sent, so nobody owes it yet. isOutstanding says
 * otherwise — it answers "is there a balance", which is the right question for
 * a patient looking at their own bill and the wrong one for a practice adding
 * up what it is owed. Drafts are counted, never banked.
 */
function isBillable(row: InvoiceRow): boolean {
  return !VOID_STATUSES.has(row.status) && row.status !== 'draft';
}

export interface CurrencyTotals {
  currency: string;
  billedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  /** Issued invoices in this currency. */
  count: number;
  /** Drafts, which are in none of the money above. */
  draftCount: number;
}

export function invoiceTotals(rows: InvoiceRow[], now: Date = new Date()): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();

  for (const row of rows) {
    if (VOID_STATUSES.has(row.status)) continue;

    const currency = row.currency || 'USD';
    const totals =
      byCurrency.get(currency) ??
      {
        currency,
        billedMinor: 0,
        paidMinor: 0,
        outstandingMinor: 0,
        overdueMinor: 0,
        count: 0,
        draftCount: 0,
      };

    if (!isBillable(row)) {
      totals.draftCount += 1;
      byCurrency.set(currency, totals);
      continue;
    }

    totals.count += 1;
    totals.billedMinor += toMinor(row.total_minor);
    totals.paidMinor += toMinor(row.paid_minor);

    if (isOutstanding(row)) {
      const balance = balanceMinor(row);
      totals.outstandingMinor += balance;
      if (isOverdue(row, now)) totals.overdueMinor += balance;
    }

    byCurrency.set(currency, totals);
  }

  // Biggest book first, so a practice with one stray foreign invoice does not
  // read it as the headline.
  return [...byCurrency.values()].sort((a, b) => b.billedMinor - a.billedMinor);
}

export type InvoiceFilter = 'all' | 'outstanding' | 'overdue' | 'paid' | 'draft';

export function invoiceMatchesFilter(
  row: InvoiceRow,
  filter: InvoiceFilter,
  now: Date = new Date(),
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'draft':
      return row.status === 'draft';
    case 'outstanding':
      return isBillable(row) && isOutstanding(row);
    case 'overdue':
      return isBillable(row) && isOutstanding(row) && isOverdue(row, now);
    case 'paid':
      // Settled, rather than merely not overdue: a cancelled invoice is not paid.
      return isBillable(row) && !isOutstanding(row);
    default:
      return true;
  }
}

export function filterInvoices(
  rows: InvoiceRow[],
  filter: InvoiceFilter,
  now: Date = new Date(),
): InvoiceRow[] {
  return rows.filter((row) => invoiceMatchesFilter(row, filter, now));
}
