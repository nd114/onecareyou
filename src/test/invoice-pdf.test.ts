import { describe, it, expect } from 'vitest';
import { renderInvoicePdf, invoicePdfFile } from '@/lib/invoice-pdf';
import type { InvoiceRow } from '@/lib/fhir/invoice';

/**
 * A smoke test over the PDF renderer, which is also the only thing standing
 * between a jspdf upgrade and a silently broken invoice download. Nothing here
 * inspects layout — it checks that a real PDF comes out with the numbers in it.
 */
const invoice: InvoiceRow = {
  id: 'inv-1',
  practice_id: 'prac-1',
  patient_user_id: 'user-1',
  encounter_id: null,
  status: 'issued',
  invoice_number: 'INV-2026-0042',
  issued_at: '2026-09-01T10:00:00.000Z',
  due_at: '2026-09-30T10:00:00.000Z',
  currency: 'USD',
  // Postgres bigints arrive as strings; the renderer has to cope with both.
  total_minor: '12500',
  paid_minor: 2500,
  platform_fee_minor: 0,
  note: 'Consultation and follow-up.',
  resource: null,
  created_by: 'user-2',
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      invoice_id: 'inv-1',
      sequence: 1,
      description: 'Initial consultation',
      code: '99213',
      quantity: 1,
      unit_price_minor: '10000',
      amount_minor: '10000',
    },
    {
      id: 'item-2',
      invoice_id: 'inv-1',
      sequence: 2,
      description: 'Blood panel',
      code: null,
      quantity: '1',
      unit_price_minor: 2500,
      amount_minor: 2500,
    },
  ],
};

function pdfText(bytes: Uint8Array) {
  return new TextDecoder('latin1').decode(bytes);
}

describe('renderInvoicePdf', () => {
  it('produces a real PDF with the invoice actually drawn into it', () => {
    const bytes = new Uint8Array(renderInvoicePdf(invoice, 'Mitchell Medical').output('arraybuffer'));
    expect(pdfText(bytes.slice(0, 5))).toBe('%PDF-');
    // jsPDF writes uncompressed text streams, so the words are in the bytes.
    // Checking the size alone passes on an entirely blank document.
    const text = pdfText(bytes);
    expect(text).toContain('INV-2026-0042');
    expect(text).toContain('Mitchell Medical');
    expect(text).toContain('Initial consultation');
  });

  it('adds the line items up and shows what is still owed', () => {
    const text = pdfText(new Uint8Array(renderInvoicePdf(invoice).output('arraybuffer')));
    expect(text).toContain('125.00'); // total: 12500 minor units
    expect(text).toContain('25.00'); // paid
    expect(text).toContain('100.00'); // balance
  });

  it('survives an invoice with no line items and no practice', () => {
    const bare = { ...invoice, items: undefined, note: null };
    const bytes = new Uint8Array(renderInvoicePdf(bare).output('arraybuffer'));
    expect(pdfText(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('names the file after the invoice, not after a counter', () => {
    const file = invoicePdfFile(invoice, 'Mitchell Medical');
    expect(file.name).toContain('INV-2026-0042');
    expect(file.name.endsWith('.pdf')).toBe(true);
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBeGreaterThan(1000);
  });
});
