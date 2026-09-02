import { describe, it, expect } from "vitest";
import {
  balanceMinor,
  minorUnitDigits,
  toMajor,
  toMinorUnits,
  formatMoney,
  isOutstanding,
  isOverdue,
  lineAmountMinor,
  toFhirInvoice,
  toMinor,
  type InvoiceRow,
} from "@/lib/fhir/invoice";
import { validateFhir } from "@/lib/fhir/validate";

const PATIENT = "11111111-1111-1111-1111-111111111111";

const row: InvoiceRow = {
  id: "inv-1",
  practice_id: null,
  patient_user_id: PATIENT,
  encounter_id: null,
  status: "issued",
  invoice_number: "INV-ABCD1234",
  issued_at: "2026-09-01T10:00:00.000Z",
  due_at: "2026-09-15T10:00:00.000Z",
  currency: "USD",
  total_minor: "1950000",
  paid_minor: "0",
  platform_fee_minor: "0",
  note: null,
  resource: {},
  created_by: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

describe("money is integers, all the way", () => {
  it("reads a bigint that arrived as a string", () => {
    // Postgres sends bigint over the wire as a string. Treating it as a number
    // by accident is how a total silently becomes NaN.
    expect(toMinor("1950000")).toBe(1950000);
    expect(toMinor(1950000)).toBe(1950000);
  });

  it("returns zero rather than NaN for anything unreadable", () => {
    expect(toMinor(null)).toBe(0);
    expect(toMinor(undefined)).toBe(0);
    expect(toMinor("not money")).toBe(0);
  });

  it("computes a line amount without floating point drift", () => {
    // The classic: 0.1 + 0.2 !== 0.3. In minor units there is no decimal to
    // drift, which is the whole reason for storing them this way.
    expect(lineAmountMinor(3, 1050)).toBe(3150);
    expect(lineAmountMinor(0.5, 1001)).toBe(501);
  });

  it("never reports a negative balance", () => {
    expect(balanceMinor({ total_minor: 1000, paid_minor: 1500 })).toBe(0);
    expect(balanceMinor({ total_minor: "1950000", paid_minor: "450000" })).toBe(1500000);
  });
});

describe("formatMoney", () => {
  it("shows the tenant's own currency, whichever it is", () => {
    expect(formatMoney(1950000, "USD", "en-US")).toMatch(/\$19,500\.00/);
    expect(formatMoney(1950000, "GBP", "en-GB")).toMatch(/£19,500\.00/);
    expect(formatMoney(1950000, "NGN", "en-NG")).toMatch(/19,500\.00/);
  });

  it("converts minor to major exactly once, at the end", () => {
    expect(formatMoney(1, "USD", "en-US")).toMatch(/0\.01/);
    expect(formatMoney(100, "USD", "en-US")).toMatch(/1\.00/);
  });

  it("uses the currency's own exponent, which is not always two", () => {
    // JPY has no minor unit, so 1000 stored is ¥1,000 — not ¥10.00. KWD has
    // three, so 1500 is 1.500. Dividing by 100 everywhere is right for most of
    // the world and wrong for a tenant in Tokyo or Kuwait City.
    expect(minorUnitDigits("JPY")).toBe(0);
    expect(minorUnitDigits("KWD")).toBe(3);
    expect(minorUnitDigits("USD")).toBe(2);
    expect(formatMoney(1000, "JPY", "en-US")).toMatch(/1,000/);
    expect(formatMoney(1000, "JPY", "en-US")).not.toMatch(/10\.00/);
    expect(formatMoney(1500, "KWD", "en-US")).toMatch(/1\.500/);
  });

  it("round-trips major to minor and back for every exponent", () => {
    for (const currency of ["USD", "JPY", "KWD", "NGN"] as const) {
      expect(toMajor(toMinorUnits(19.5 * (currency === "JPY" ? 100 : 1), currency), currency))
        .toBeCloseTo(19.5 * (currency === "JPY" ? 100 : 1), 3);
    }
  });

  it("prefixes an unfamiliar but well-formed code, which Intl handles", () => {
    // Checked rather than assumed: Intl formats any well-formed three-letter
    // code, so this does not reach the fallback.
    expect(formatMoney(1950000, "ZZZ" as never)).toMatch(/ZZZ.*19,500\.00/);
  });

  it("falls back to a bare number for a malformed code instead of throwing", () => {
    // '', 'zz' and 'NOTACODE' all make Intl throw RangeError. A blank where an
    // amount should be is worse than an unstyled number.
    expect(formatMoney(1950000, "NOTACODE" as never)).toBe("NOTACODE 19500.00");
  });

  it("defaults a missing currency to USD rather than failing", () => {
    // The column is NOT NULL with a CHECK, so this only guards a caller that
    // passes nothing. USD because the platform is international by default and
    // a tenant sets its own.
    expect(formatMoney(1950000, "" as never, "en-US")).toMatch(/\$/);
  });
});

describe("toFhirInvoice", () => {
  it("produces a resource that validates against FHIR R4", () => {
    expect(() => validateFhir(toFhirInvoice(row))).not.toThrow();
  });

  it("carries the reference the patient would quote on the phone", () => {
    expect(toFhirInvoice(row).identifier?.[0].value).toBe("INV-ABCD1234");
  });

  it("states the total in major units, as FHIR Money does", () => {
    // The resource is what leaves the building, and FHIR Money is decimal. The
    // integer discipline is ours, internally.
    const invoice = toFhirInvoice(row);
    expect(invoice.totalGross?.value).toBe(19500);
    expect(invoice.totalGross?.currency).toBe("USD");
  });

  it("names the patient as the subject", () => {
    expect(toFhirInvoice(row).subject?.reference).toBe(`Patient/${PATIENT}`);
  });

  it("carries the line items, and validates with them", () => {
    const invoice = toFhirInvoice(row, [
      {
        id: "i1", invoice_id: "inv-1", sequence: 1, description: "Consultation",
        code: null, quantity: 1, unit_price_minor: 1500000, amount_minor: 1500000,
      },
      {
        id: "i2", invoice_id: "inv-1", sequence: 2, description: "Full blood count",
        code: null, quantity: 1, unit_price_minor: 450000, amount_minor: 450000,
      },
    ]);
    expect(invoice.lineItem).toHaveLength(2);
    expect(invoice.lineItem?.[0].priceComponent?.[0].amount?.value).toBe(15000);
    // chargeItem[x] is required by FHIR; the validator is what caught its
    // absence, not a reading of the spec.
    expect(invoice.lineItem?.[0].chargeItemCodeableConcept?.text).toBe("Consultation");
    expect(() => validateFhir(invoice)).not.toThrow();
  });

  it("leaves lineItem absent rather than empty when there are none", () => {
    expect(toFhirInvoice(row).lineItem).toBeUndefined();
  });
});

describe("what a patient actually needs to know", () => {
  it("says an unpaid issued invoice is outstanding", () => {
    expect(isOutstanding(row)).toBe(true);
  });

  it("says a fully paid one is not", () => {
    expect(isOutstanding({ ...row, paid_minor: "1950000" })).toBe(false);
  });

  it("does not chase a cancelled invoice", () => {
    // A withdrawn bill is part of the record but is not owed, and telling a
    // patient they owe money on it would be wrong in the way that matters.
    expect(isOutstanding({ ...row, status: "cancelled" })).toBe(false);
    expect(isOutstanding({ ...row, status: "entered-in-error" })).toBe(false);
  });

  it("knows overdue from merely unpaid", () => {
    const after = new Date("2026-09-20T00:00:00.000Z");
    const before = new Date("2026-09-10T00:00:00.000Z");
    expect(isOverdue(row, after)).toBe(true);
    expect(isOverdue(row, before)).toBe(false);
  });

  it("never calls a paid or cancelled invoice overdue", () => {
    const after = new Date("2026-09-20T00:00:00.000Z");
    expect(isOverdue({ ...row, paid_minor: "1950000" }, after)).toBe(false);
    expect(isOverdue({ ...row, status: "cancelled" }, after)).toBe(false);
  });

  it("is not overdue when nobody set a due date", () => {
    expect(isOverdue({ ...row, due_at: null }, new Date("2030-01-01"))).toBe(false);
  });
});
