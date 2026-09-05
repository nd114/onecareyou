import { describe, it, expect } from 'vitest';
import { invoiceTotals, filterInvoices, invoiceMatchesFilter } from '@/lib/practice-invoices';
import type { InvoiceRow } from '@/lib/fhir/invoice';

const NOW = new Date(2026, 8, 10, 12, 0, 0);

let n = 0;
function inv(over: Partial<InvoiceRow> = {}): InvoiceRow {
  n += 1;
  return {
    id: `inv-${n}`,
    practice_id: 'prac-1',
    patient_user_id: 'user-1',
    encounter_id: null,
    status: 'issued',
    invoice_number: `INV-${n}`,
    issued_at: '2026-09-01T10:00:00.000Z',
    due_at: null,
    currency: 'USD',
    total_minor: 10000,
    paid_minor: 0,
    platform_fee_minor: 0,
    note: null,
    resource: null,
    created_by: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

describe('invoiceTotals', () => {
  it('adds up what was billed, paid and is still owed', () => {
    const [usd] = invoiceTotals(
      [inv({ total_minor: 10000, paid_minor: 2500 }), inv({ total_minor: 5000, paid_minor: 5000 })],
      NOW,
    );
    expect(usd.billedMinor).toBe(15000);
    expect(usd.paidMinor).toBe(7500);
    expect(usd.outstandingMinor).toBe(7500);
    expect(usd.count).toBe(2);
  });

  it('never adds two currencies together', () => {
    const totals = invoiceTotals(
      [
        inv({ currency: 'USD', total_minor: 10000 }),
        inv({ currency: 'NGN', total_minor: 900000 }),
        inv({ currency: 'USD', total_minor: 5000 }),
      ],
      NOW,
    );
    expect(totals).toHaveLength(2);
    expect(totals.map((t) => t.currency)).toEqual(['NGN', 'USD']); // biggest book first
    expect(totals.find((t) => t.currency === 'USD')!.billedMinor).toBe(15000);
    expect(totals.find((t) => t.currency === 'NGN')!.billedMinor).toBe(900000);
  });

  it('leaves cancelled invoices out of the ledger entirely', () => {
    const totals = invoiceTotals(
      [inv({ status: 'cancelled', total_minor: 99999 }), inv({ total_minor: 10000 })],
      NOW,
    );
    expect(totals).toHaveLength(1);
    expect(totals[0].billedMinor).toBe(10000);
    expect(totals[0].count).toBe(1);
  });

  it('counts drafts without banking them', () => {
    // A draft has not been sent, so nobody owes it. Showing it as a receivable
    // would tell a practice it is owed money it has never asked for.
    const [usd] = invoiceTotals(
      [inv({ status: 'draft', total_minor: 40000 }), inv({ total_minor: 10000 })],
      NOW,
    );
    expect(usd.billedMinor).toBe(10000);
    expect(usd.outstandingMinor).toBe(10000);
    expect(usd.count).toBe(1);
    expect(usd.draftCount).toBe(1);
  });

  it('separates overdue from merely unpaid', () => {
    const [usd] = invoiceTotals(
      [
        inv({ total_minor: 10000, due_at: '2026-09-01T00:00:00.000Z' }), // past due
        inv({ total_minor: 3000, due_at: '2026-09-30T00:00:00.000Z' }), // not yet
        inv({ total_minor: 2000, due_at: null }), // no date given
      ],
      NOW,
    );
    expect(usd.outstandingMinor).toBe(15000);
    expect(usd.overdueMinor).toBe(10000);
  });

  it('is empty rather than zeroed for an empty ledger', () => {
    expect(invoiceTotals([], NOW)).toEqual([]);
  });

  it('reads a bigint that arrived as a string', () => {
    const [usd] = invoiceTotals([inv({ total_minor: '12500', paid_minor: '2500' })], NOW);
    expect(usd.billedMinor).toBe(12500);
    expect(usd.outstandingMinor).toBe(10000);
  });
});

describe('invoiceMatchesFilter', () => {
  const paid = inv({ total_minor: 10000, paid_minor: 10000 });
  const owing = inv({ total_minor: 10000, paid_minor: 0, due_at: '2026-09-30T00:00:00.000Z' });
  const late = inv({ total_minor: 10000, paid_minor: 0, due_at: '2026-09-01T00:00:00.000Z' });
  const draft = inv({ status: 'draft' });
  const dead = inv({ status: 'cancelled' });

  it('finds what is still owed, and does not count drafts as owed', () => {
    expect(invoiceMatchesFilter(owing, 'outstanding', NOW)).toBe(true);
    expect(invoiceMatchesFilter(late, 'outstanding', NOW)).toBe(true);
    expect(invoiceMatchesFilter(draft, 'outstanding', NOW)).toBe(false);
    expect(invoiceMatchesFilter(paid, 'outstanding', NOW)).toBe(false);
  });

  it('finds what is late', () => {
    expect(invoiceMatchesFilter(late, 'overdue', NOW)).toBe(true);
    expect(invoiceMatchesFilter(owing, 'overdue', NOW)).toBe(false);
  });

  it('calls settled invoices paid, and cancelled ones neither', () => {
    expect(invoiceMatchesFilter(paid, 'paid', NOW)).toBe(true);
    expect(invoiceMatchesFilter(dead, 'paid', NOW)).toBe(false);
    expect(invoiceMatchesFilter(draft, 'paid', NOW)).toBe(false);
  });

  it('shows everything under "all", including the cancelled ones', () => {
    expect(filterInvoices([paid, owing, late, draft, dead], 'all', NOW)).toHaveLength(5);
  });
});
