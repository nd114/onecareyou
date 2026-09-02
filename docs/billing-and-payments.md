# Billing and Payments

**Status:** Billing shipped (invoice, line items, patient view). Payments not built — this document is where the direction is recorded so it is not lost.
**Owner:** Engineering + Commercial
**Relates to:** `docs/pricing-roadmap.md`, `docs/medplum-adoption-assessment.md`

---

## 1. Why billing belongs in a patient-controlled product

The earlier position was that claims and payments are "getting close to EHR,
which is not what OneCare is about". That reasoning still holds for *claims* —
payer adjudication, eligibility, remittance — and none of that is built.

What changed is the framing. A bill a patient can only see by asking is the same
information asymmetry the rest of this product exists to remove. The patient
already holds their record; they should hold their invoice too, itemised, without
having to ring anyone to find out what a number is for.

So the line drawn is: **the patient's view of what they owe and why is in scope.
Payer claims processing is not.**

## 2. What is built

- `fhir_invoices` and `fhir_invoice_items`, FHIR R4 `Invoice`-shaped
- The patient sees their own **issued** invoices on their dashboard, with every
  line item, expandable — a total with no breakdown is a demand, not a bill
- A clinician raises an invoice from the patient's Billing tab; it reaches the
  patient the moment it is issued, with nothing to send
- Drafts stay with the practice, deliberately: a patient watching a number change
  while it is still being decided cannot usefully ask about any version of it
- Overdue is distinguished from merely unpaid, and a cancelled invoice is never
  chased

**Money is stored in minor units (kobo, cents) as `bigint`, never as a float.**
`0.1 + 0.2` is not `0.3` in binary floating point, and a rounding error in a
balance is something a person has to be refunded for. The only division by 100
happens at display time, after all arithmetic. `Intl.NumberFormat` renders it, so
a Nigerian patient sees ₦ with the separators they expect.

The total is summed **by the database** from the line items, not by any client. A
client that computes its own total eventually computes a different one, and the
patient finds the disagreement.

## 3. What is not built, and the shape it should take

Nothing collects money. The patient-facing card says to contact the practice,
because a Pay button that does nothing is worse than no button.

### 3.1 Taking payments

The likely shape, for when this is picked up:

| Piece | Note |
| --- | --- |
| **Provider** | Paystack or Flutterwave for Nigeria — both settle in NGN, both do bank transfer, card and USSD, which matters where card penetration is low. Stripe does not serve Nigeria for payouts |
| **Initiation** | An edge function creates the charge. The amount comes from the invoice row, never from the client — a client-supplied amount is a client-chosen amount |
| **Confirmation** | Webhook to an edge function, signature verified, which updates `paid_minor`. Never the browser: a redirect back from a payment page is a claim, not a receipt |
| **Idempotency** | A provider reference stored per payment attempt, unique-constrained, so a retried webhook cannot double-credit |
| **Partial payment** | Already supported — `paid_minor` is separate from `total_minor` and the invoice only becomes `balanced` when they meet |

A `fhir_payments` table (FHIR `PaymentReconciliation`) is the natural home for
attempts and their provider references. It does not exist yet.

### 3.2 Platform fees

`fhir_invoices.platform_fee_minor` exists and is always zero. It is recorded per
invoice rather than derived at read time **on purpose**: the rate will change,
and an invoice raised last year must keep the rate it was raised under. Deriving
it from the current rate would silently restate history.

`practices.revenue_share_pct` already exists and is the natural source for the
rate at issue time.

Open commercial questions, which are not engineering's to answer:

1. **Who bears the fee** — added on top of the patient's bill, or taken out of
   the practice's settlement? These are different products and different
   conversations with a hospital.
2. **Percentage, flat, or capped.** A percentage on a large hospital bill gets
   objectionable fast; a cap is usually what makes it signable.
3. **Whether OneCare is merchant of record.** Taking the money and remitting to
   the practice is a much heavier regulatory position in Nigeria (CBN licensing,
   settlement accounts, KYC on practices) than facilitating a payment that
   settles directly to the practice's own provider account. **The lighter option
   should be the default until there is a reason it cannot be.**
4. **Refunds and disputes.** Who decides, and out of whose money.

Question 3 is the one to answer first, because it determines whether this is an
integration or a licensed business.

## 4. What is deliberately absent

- **No claims, eligibility or remittance.** That is a payer product with a
  different buyer and a different compliance surface. The earlier call stands.
- **No coded charge items.** A line item carries the description typed, and a
  practice's own code when it has one. No CPT or NHIS code is invented — the same
  rule as `docs/loinc-and-coding-policy.md`.
- **No deletion.** A bill raised and withdrawn is part of the record; FHIR has
  `cancelled` and `entered-in-error`. The table grants no DELETE and has no
  DELETE policy, asserted in the test suite with the privilege deliberately
  granted so the refusal has to come from the missing policy.
- **No patient-side write.** A patient cannot mark their own invoice paid. When
  payments exist, the webhook does that, server-side.

## 5. Before demonstrating this

It is honest to show: itemised bills the patient can see and understand, raised
by the practice, in the right currency, with overdue flagged.

It is **not** honest to imply payment collection works. If asked, the position is
that the billing record is built and payment collection is a provider integration
that has not been started, pending the merchant-of-record decision in §3.2.
