# Wearables Plan — automatic readings, honestly labelled

Status: planning. Not scaffolded into the current build.

Patients should not have to type in a blood-pressure reading their cuff already took. Letting a
patient connect a device and have readings arrive on their own is the natural next step for a
record that is supposed to follow them.

**The rule that governs the whole feature:** a consumer wearable reading and a clinically
measured one must never be visually or structurally indistinguishable. Consumer devices carry
real margins of error. A clinician glancing at a chart must be able to tell, without effort,
whether a number came from a hospital cuff, a smartwatch, or the patient typing it in — and a
threshold alert must not fire on a device artefact as though it were a measured deterioration.

---

## 1. What already exists

`vitals` carries `source`, and `VitalSource` is already `'manual' | 'ehr_import' | 'device'`,
rendered by `VitalSourceBadge`. So the concept is in place; what is missing is which device, how
reliable, and what the platform does differently with it.

## 2. Provenance, in detail

`source = 'device'` is not enough on its own — "device" spans a validated Bluetooth
blood-pressure cuff and a wrist optical heart-rate sensor, which deserve different trust.

Add alongside it:

- `device_type` — cuff, optical wrist sensor, CGM, scale, pulse oximeter
- `device_make_model` — what the vendor reports
- `measurement_class` — **clinical** (a validated medical device, and hospital-recorded readings),
  **consumer** (wrist optical, estimated values), or **self_reported** (typed by hand)
- `confidence` where the vendor supplies one, kept as the vendor's own number, not reinterpreted

`measurement_class` is the field the UI and the alerting rules key off. The others are for the
record.

## 3. What changes elsewhere once this lands

- **Charts** plot consumer readings visually distinctly (lighter weight, distinct marker) and the
  legend names the split. Never the same mark as a clinical measurement.
- **Alert rules** default to firing on clinical measurements only. A clinician can opt a rule
  into consumer data deliberately, per rule — never by default. A single wrist reading should not
  page anyone.
- **Adherence and trends** may include consumer data, labelled, since direction matters more than
  absolute accuracy.
- **Clinician surfaces** show the class inline. `PatientSafetyStrip` and the vitals tab both need
  it.
- **AI summaries** must state the class when citing a reading, and must not present a consumer
  reading as a measurement. This belongs in the existing AI behaviour rules.
- **Export and EHR write-back** carry the class outward. A consumer reading must never land in a
  hospital chart as a clinical observation — see `ehr-integration-plan.md` §3.

## 4. Connection model

- The patient connects their own device account; this is their data and their choice, the same
  as any other share. Nothing about a device connection grants a clinician or hospital access —
  readings flow into the patient's record, and existing shares govern who sees them.
- Sync is pull-based on a schedule plus webhook where the vendor supports it, reusing the
  edge-function pattern already used for EHR sync.
- Volume is the practical risk: a CGM produces readings every five minutes, which is a different
  storage and charting problem from a daily weigh-in. Downsample for display, keep the raw series
  only as long as it is clinically useful, and account for it in `storage_ledger` like everything
  else.
- Disconnecting stops new readings and keeps existing ones — consistent with how every other
  relationship ends in this platform.

## 5. Sequencing

1. Provenance fields and `measurement_class`, plus the UI split. **This can ship before any
   device integration exists** and is worth doing early: it is much harder to retrofit a
   distinction into a chart people already trust.
2. One vendor end to end, chosen by what patients in the market actually wear.
3. Alerting rules that understand measurement class.
4. Additional vendors, once the first has proven the shape.

## 6. Open questions

- Which vendors matter in Nigeria specifically? The answer is unlikely to be the US default.
- Do we accept readings for a family member profile, or the account holder only?
- Retention for high-frequency series — how long is a five-minute CGM trace clinically useful?
- Does a hospital want consumer data in its own chart at all? Some will refuse it outright, which
  is a reasonable position and the export must respect it.
