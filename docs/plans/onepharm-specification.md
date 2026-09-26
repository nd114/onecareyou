# OnePharm — System Architecture and Engineering Specification

Status: blueprint (not built). Owned as a separate product from OneCare.
Last updated: 26 September 2026.

OnePharm is a neutral digital prescription switch. A doctor issues a prescription once; any
pharmacy can check it is genuine, record what was given out, and the prescription cannot then be
used a second time anywhere else. OneCare is its first customer, not its owner.

---

## 1. Why it exists

- In Nigeria and most of Africa, prescriptions are paper with a handwritten signature. They are
  easy to forge, can be taken to several pharmacies, and the doctor never learns whether the
  medicine was collected.
- The United States (Surescripts) and Canada (PrescribeIT, provincial systems) already run
  electronic prescription networks. Most of Africa has nothing equivalent.
- Pharmacies mostly run simple till and stock software, or nothing beyond a paper book. Any
  solution must work without asking them to replace what they already use.

### The switch analogy
| Card payments | OnePharm |
| --- | --- |
| Issuing bank | Prescribing hospital or clinic system (OneCare, other EHRs) |
| Payment switch | OnePharm central ledger |
| Merchant terminal | Pharmacy counter (web page, scanner, or till software) |
| Scheme rules and registries | Pharmacy and medical councils, health insurers |

---

## 2. Standards adopted

- **HL7 FHIR R4** — `MedicationRequest` for issuing, `MedicationDispense` for fulfilment, so
  hospital systems can integrate with what they already speak.
- **NCPDP SCRIPT concepts** — structured strength, form, quantity qualifier, days supply and
  refill count instead of free text.
- **Ed25519 signatures** — small enough to fit inside a QR code, fast enough to verify on a phone
  with no internet connection.
- **W3C Verifiable Credentials** — tamper-evident proof of prescriber licence and facility
  registration.
- **RxNorm / local formulary codes** — drug identity, with a mapping table per country.

---

## 3. Architecture

```text
                               ┌────────────────────────────────────────────────────────┐
                               │                    ONEPHARM SWITCH                     │
                               │                                                        │
┌──────────────────────────┐   │  ┌────────────────────┐      ┌──────────────────────┐  │   ┌──────────────────────────┐
│     PRESCRIBER NODE      │   │  │   API gateway &    │      │    State machine     │  │   │     DISPENSER NODE       │
│  (OneCare / other EHR)   │───┼─>│   mTLS ingress     │─────>│ (atomic lock engine) │──┼──>│  • Dispense web app      │
│                          │   │  └────────────────────┘      └──────────┬───────────┘  │   │  • Scanner wedge         │
│  • Clinician signs       │   │                                         │              │   │  • Retail till software  │
│  • Token generated       │<──┼─────────────────────────────────────────┼──────────────┼───│  • USSD / SMS bridge     │
│  • Ingests dispense hook │   │                                         ▼              │   │                          │
└──────────────────────────┘   │                              ┌──────────────────────┐  │   └──────────────────────────┘
                               │                              │  Anti-replay ledger  │  │
                               │                              │ (Postgres + Redis)   │  │
                               │                              └──────────────────────┘  │
                               └────────────────────────────────────────────────────────┘
```

### 3.1 Prescriber tier (inbound)
- **Connected systems** — OneCare and any other EHR call `POST /v1/prescriptions`.
- **Standalone prescriber portal** (`doctor.onepharm.health`) — for independent doctors with no
  EHR. Licence-verified login, type the order, sign, print or send by SMS/WhatsApp.
- **Signing** — the private key belongs to the prescriber (held in an HSM-backed key service, one
  key per registered prescriber). The switch never signs on a doctor's behalf.

### 3.2 Core switch
- **API gateway** — API key plus mTLS, per-facility rate limits (token bucket), strict schema
  validation, idempotency on `request_id`.
- **State machine** — the only source of truth for whether a prescription can still be used.
- **Anti-replay ledger** — append-only record of every scan, claim, refusal and refill request;
  used for dispute resolution, insurer adjudication and fraud analytics.

### 3.3 Dispenser tier (three ways in, pharmacy chooses)
| Tier | How it works | Pharmacy effort |
| --- | --- | --- |
| A. Zero-install web app | `dispense.onepharm.health` in any browser; camera or USB scanner reads the code | None |
| B. Scanner wedge | Small background agent watches for `OP*` barcode input, checks the switch, types the drug details into their existing till screen | Install once |
| C. Direct integration | Their till/stock software calls the API: scan reduces stock, records the sale and claims the token in one step | Done by their software supplier |
| No computer at all | Same web app on a phone | None |

---

## 4. Prescription lifecycle

```text
[ DRAFT ] ──doctor signs──> [ ACTIVE_UNCLAIMED ]
                                   │
                        scan at counter (5 min lease)
                                   ▼
                           [ IN_DISPENSING ]
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
        [ PARTIALLY_DISPENSED ]        [ FULLY_DISPENSED ]
                     │                           │
        further claim against balance ───────────┘

Other terminal states: EXPIRED (past validity), REVOKED (prescriber cancels before any claim).
```

Rules:
- A claim is only accepted against `ACTIVE_UNCLAIMED` or `PARTIALLY_DISPENSED`.
- `IN_DISPENSING` is a short lease so two counters cannot claim the same script at once. The lease
  auto-releases after five minutes if the counter never confirms.
- Nothing is deleted. A cancelled or expired prescription keeps its full history.
- Refills are separate claims against `refills_remaining`, each with its own dispense record.

### Concurrency guarantee
A claim runs inside a single transaction with a row lock (`SELECT … FOR UPDATE NOWAIT`) plus a
distributed lock keyed on the token. A second terminal attempting the same token during the lease
receives `409 Conflict` naming the terminal that holds it. There is no path in which two counters
both succeed.

---

## 5. Data model

```json
{
  "prescription_id": "rx_01J8K3M90ZQW2B4E",
  "rx_token": "OP-982-411",
  "qr_payload": "https://rx.onepharm.health/claim?t=<signed-compact-token>",
  "status": "ACTIVE_UNCLAIMED",
  "created_at": "2026-09-26T02:50:00Z",
  "expires_at": "2026-10-26T02:50:00Z",
  "country": "NG",
  "prescriber": {
    "source_system": "onecare_ehr",
    "facility_id": "fac_lmc_01",
    "facility_name": "Lagos Metro Clinic",
    "doctor_id": "usr_dr_adebayo",
    "doctor_name": "Dr. T. Adebayo",
    "license_number": "MDCN/R/58291",
    "signature_alg": "Ed25519",
    "signature": "<base64>"
  },
  "patient": {
    "anonymous_identifier": "anon_pt_882194",
    "demographics": { "initials": "O. J.", "birth_year": 1984, "gender": "male" },
    "phone_masked": "+234 803 *** 1234"
  },
  "items": [
    {
      "item_id": "item_01",
      "drug_code": "RxNorm:866514",
      "drug_name": "Metformin hydrochloride 500 MG oral tablet",
      "generic_allowed": true,
      "dosage_sig": "Take 1 tablet twice daily with breakfast and dinner",
      "quantity": 60,
      "quantity_unit": "tablets",
      "days_supply": 30,
      "refills_authorized": 2,
      "refills_remaining": 2,
      "controlled_schedule": null
    }
  ],
  "dispense_history": []
}
```

**Minimum necessary data.** The switch holds prescription metadata only — no diagnoses, no notes,
no full patient record. The patient is identified by a token plus enough demographics for the
pharmacist to confirm they are serving the right person.

---

## 6. API contract (`api.onepharm.health`)

All calls: TLS 1.3, mTLS or bearer token per registered facility, idempotency key required on
writes.

### 6.1 Issue — `POST /v1/prescriptions`
Called by a connected EHR or the prescriber portal when a doctor signs.

Request: the object in section 5 (without `status`, `dispense_history`, tokens).

Response `201`:
```json
{
  "status": "success",
  "prescription_id": "rx_01J8K3M90ZQW2B4E",
  "rx_token": "OP-982-411",
  "qr_url": "https://rx.onepharm.health/claim?t=<signed-compact-token>",
  "qr_png_url": "https://rx.onepharm.health/qr/OP-982-411.png",
  "sms_status": "queued",
  "expires_at": "2026-10-26T02:50:00Z"
}
```

### 6.2 Verify — `GET /v1/prescriptions/verify/:rx_token`
Called on scan, before anything is handed over. Read-only, no state change.

- `200` — genuine and usable: prescriber, facility, licence, patient demographics, items,
  remaining balance, refills remaining, warnings.
- `409` — already used: original dispensing pharmacy, pharmacist licence, timestamp, and whether a
  refill remains.
- `410` — expired or revoked, with the reason.
- `404` — unknown token (possible forgery; logged for fraud review).

### 6.3 Claim — `POST /v1/prescriptions/:rx_token/dispense`
```json
{
  "pharmacy": {
    "license_number": "PCN/P/29104",
    "facility_name": "Medplus Lekki Phase 1",
    "pharmacist_name": "Pharm. E. Okon",
    "terminal_id": "TERM_LEKKI_03"
  },
  "dispensed_items": [
    {
      "item_id": "item_01",
      "dispensed_drug_name": "Glucophage 500mg",
      "quantity_dispensed": 60,
      "is_substitution": true,
      "substitution_reason": "formulary_generic"
    }
  ],
  "pos_receipt_number": "POS-20260926-0921"
}
```
Response `200`:
```json
{
  "status": "FULLY_DISPENSED",
  "remaining_balance": 0,
  "refills_remaining": 2,
  "confirmation_receipt_code": "RCP-98241"
}
```

### 6.4 Partial claim and balance
A claim smaller than the prescribed quantity moves the item to `PARTIALLY_DISPENSED` and records
the balance. Any pharmacy may serve the balance later; each claim is a separate ledger entry.

### 6.5 Out of stock — `POST /v1/prescriptions/:rx_token/decline`
Records that a pharmacy could not serve it, leaves the token active, and (with patient consent)
returns nearby partner pharmacies reporting stock.

### 6.6 Refill request — `POST /v1/prescriptions/:rx_token/refill-request`
Pharmacist or patient asks for more. If `refills_remaining > 0` the switch authorises directly;
otherwise it raises a request to the issuing facility and notifies the prescriber.

### 6.7 Revoke — `POST /v1/prescriptions/:rx_token/revoke`
Prescriber-only, and only while unclaimed.

### 6.8 Webhooks to the prescribing system
Signed with `X-OnePharm-Signature` (HMAC-SHA256 over the raw body), retried with exponential
backoff for 24 hours, every delivery logged.

Events: `prescription.dispensed`, `prescription.partially_dispensed`,
`prescription.refill_requested`, `prescription.declined_out_of_stock`, `prescription.expired`,
`prescription.suspected_forgery`.

```json
{
  "event": "prescription.dispensed",
  "event_id": "evt_99214_dispense",
  "timestamp": "2026-09-26T03:15:22Z",
  "prescription_id": "rx_01J8K3M90ZQW2B4E",
  "dispense_status": "FULLY_DISPENSED",
  "dispensing_facility": "Medplus Lekki Phase 1",
  "pharmacist_license": "PCN/P/29104",
  "patient_identifier": "anon_pt_882194"
}
```

### 6.9 Registry endpoints
- `GET /v1/pharmacies/:license` — is this pharmacy registered and in good standing.
- `GET /v1/prescribers/:license` — is this prescriber licensed to prescribe, and what scope.

---

## 7. Working when the power and internet do not

Three levels, applied by risk:

1. **Offline authenticity (always available).** The QR payload carries a signed compact token:
   prescription id, prescriber licence, facility, drug code, strength, quantity, expiry,
   signature. The dispense web app caches trusted public keys, so with no connection at all the
   pharmacist can still confirm the script is genuine and read the exact dosage. What offline
   verification cannot tell them is whether someone else already claimed it.
2. **USSD / SMS claim (broadband down, cellular up).** The pharmacist dials
   `*384*40*<TOKEN>*<PIN>#` or sends a short encrypted SMS. The switch replies in plain text:
   `APPROVED: Metformin 500mg x60. Token locked.` or `ALREADY CLAIMED 24/09 Medplus Ikeja.`
   Payload stays under 80 bytes.
3. **Provisional offline claim (last resort, low-risk drugs only).** For a defined low-risk
   formulary, the pharmacy may record the claim locally and forward it when connectivity returns
   (store and forward, signed by the terminal). If a conflict surfaces on sync, both parties and
   the prescriber are notified and the ledger records the collision.

**Controlled substances never permit level 3.** They require a live online or USSD claim.

Other resilience measures: multi-region deployment with a read replica per country, a published
status page, and a documented degradation policy so pharmacies always know what they may do when
the network is unreachable.

---

## 8. Security, fraud and abuse

| Risk | Control |
| --- | --- |
| Forged or copied QR code | Signature check plus central claim state; a photocopy claims once and then reads as used everywhere |
| Screenshot shared with a relative | Same — one claim per authorised quantity; patient demographics shown for counter-side confirmation |
| Two counters scanning at once | Lease lock; second attempt is refused by design |
| Pharmacy claiming without dispensing | Claims tied to a licence and terminal; anomaly scoring on volume, hour, drug mix; insurer reconciliation |
| Doctor licence misuse | Licence verified against the council registry at onboarding and re-checked periodically; keys revocable instantly |
| Enumerating tokens | Tokens are high-entropy and short-lived; strict rate limits; failed lookups logged and alerted |
| Data over-collection | Minimum-necessary schema; no clinical notes ever reach the switch |
| Insider access | Full audit log, no hard deletes, separation of duties, no unrestricted production data access |

Signing keys are rotated on a published schedule, with overlapping validity so cached public keys
keep working offline through a rotation window. Revocation lists are distributed to dispensing
clients on every connected session.

---

## 9. Regulatory and legal position

- Likely treated as a health information network and possibly a prescription intermediary. Needs
  local legal opinion before launch in each country, starting with Nigeria (PCN, MDCN, NAFDAC,
  NHIA, NDPA data protection).
- Electronic prescription validity varies: some jurisdictions still require a paper copy. The
  printed slip carrying the QR code satisfies both worlds.
- Controlled substances are a separate, stricter workstream (identity assurance on the prescriber,
  no offline claim, tighter retention) and should not gate the first launch.
- Data residency: patient-linked records stay in-country where required.
- Clear public positioning: OnePharm verifies and records prescriptions. It does not practise
  pharmacy, does not advise on treatment, and is not a dispensing business.

---

## 10. Partners and go-to-market

Three tiers, in this order:
1. **Pharmacy software suppliers** — one integration brings hundreds or thousands of counters.
   Offer them a share of the switch fee.
2. **Anchor pharmacy chains** — a few recognised names create day-one volume and credibility.
3. **Regulators, councils and health insurers** — legitimacy, and in the insurers' case, a second
   revenue line from claim adjudication.

**The local anchor play.** Launch inside one partner hospital so its doctors stop using paper
pads. Then equip the 10–15 pharmacies within walking distance with the free scanning page. Patient
habit does the rest, and nearby clinics ask to join.

### Rough economics (Nigeria, illustrative — needs validating against real volumes)
At a ₦50 fee per cleared prescription, with roughly ₦20 shared with software suppliers:
| Annual cleared scripts | Gross | Net at ₦30 |
| --- | --- | --- |
| 3 million | ₦150m | ₦90m |
| 25 million | ₦1.25bn | ₦750m |
| 80 million | ₦4bn | ₦2.4bn |

Additional lines: insurer claim adjudication per script, anonymised supply insight for
manufacturers (only with strict privacy rules and regulator approval), and restock marketplace
commission. Costs per transaction are a fraction of a naira, so margins are high and capital needs
are low; the real investment is field sales, support and compliance.

---

## 11. Build phases

| Phase | Scope | Exit test |
| --- | --- | --- |
| 0. Spec and legal | This document, Nigerian legal opinion, council conversations | Written go-ahead on approach |
| 1. Core switch | Issue, verify, claim, partial, revoke; ledger; signing service | Two counters cannot both claim one script |
| 2. Dispense web app | Scan, verify, claim, receipt; offline signature check | A pharmacist with no training completes a claim in under 30 seconds |
| 3. Prescriber connector | OneCare integration plus the standalone portal, webhooks back | Doctor sees "collected" in the chart automatically |
| 4. Offline paths | USSD/SMS claim, provisional offline claim for low-risk drugs | Claim succeeds with broadband unplugged |
| 5. Till integrations | Wedge agent plus one supplier's direct API | A scan reduces stock and claims the token in one action |
| 6. Network opening | Public API, supplier onboarding, registry checks, status page | A hospital with no OneCare relationship goes live unaided |

---

## 12. How OneCare interfaces with it

OneCare is customer number one, nothing more. The relationship:

- OneCare keeps the record, the notes, the messaging and the vault. OnePharm only handles the
  prescription token and its fulfilment state.
- A clinician signing a medication order in OneCare triggers an outbound issue call. OneCare stores
  the returned token and QR on the visit summary and in the patient's vault under "Active
  prescriptions".
- The patient shows the QR at any participating pharmacy — no app, no account.
- A dispense webhook comes back into OneCare, which records it as verified provenance
  (`source: onepharm_dispensed`), updates medication status to collected, and closes the loop for
  the clinician.
- OneCare's integration lives behind one adapter module so the switch can be swapped, self-hosted
  or replaced per country without touching clinical screens.
- If OnePharm is unreachable, OneCare still prints a medication summary clearly labelled
  "Clinical record copy — not a pharmacy prescription", exactly as today.

See `roadmap.md` for the sequencing of the OneCare-side work.
