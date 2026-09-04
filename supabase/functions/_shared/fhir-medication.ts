/**
 * FHIR MedicationRequest → a `medications` row.
 *
 * Lives in `_shared` and imports nothing at all, so it runs unchanged in Deno
 * (the sync function) and in the browser test suite. That constraint is the
 * point: the mapping that decides what a patient's medication list says is
 * worth testing, and a Deno-only file cannot be.
 *
 * Two rules, both inherited from `src/lib/fhir/inbound.ts`:
 *
 *   - **Refuse rather than guess.** A resource without a readable name, or
 *     without a dose, is rejected with a reason. A medication list with a row
 *     called "unknown" is worse than one with a row missing, because the
 *     patient cannot tell it is wrong.
 *   - **Say what was dropped.** Anything mapped approximately carries a
 *     warning naming it, so a person reading the sync log can see what the
 *     sending system said that we did not keep.
 *
 * MedicationRequest, not MedicationStatement: a Request is a hospital's record
 * of what it prescribed. A Statement is somebody's account of what is being
 * taken, which is a different claim, and importing one as the other would put
 * words in the prescriber's mouth.
 */

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirQuantity {
  value?: number;
  unit?: string;
  code?: string;
}

export interface FhirDosageInstruction {
  text?: string;
  patientInstruction?: string;
  asNeededBoolean?: boolean;
  timing?: {
    repeat?: {
      frequency?: number;
      period?: number;
      periodUnit?: string;
      timeOfDay?: string[];
    };
    code?: FhirCodeableConcept;
  };
  doseAndRate?: Array<{
    doseQuantity?: FhirQuantity;
    doseRange?: { low?: FhirQuantity; high?: FhirQuantity };
  }>;
}

export interface FhirMedicationRequest {
  resourceType?: string;
  id?: string;
  status?: string;
  intent?: string;
  medicationCodeableConcept?: FhirCodeableConcept;
  medicationReference?: { display?: string; reference?: string };
  authoredOn?: string;
  requester?: { display?: string };
  dispenseRequest?: { validityPeriod?: { start?: string; end?: string } };
  note?: Array<{ text?: string }>;
  dosageInstruction?: FhirDosageInstruction[];
}

export interface MedicationRowCandidate {
  user_id: string;
  name: string;
  dosage: string;
  frequency: string;
  times_of_day: string[];
  type: string;
  instructions: string | null;
  prescriber: string | null;
  start_date: string;
  is_active: boolean;
  source: string;
  external_id: string | null;
  ehr_connection_id: string;
}

export interface MedicationImportResult {
  row?: MedicationRowCandidate;
  warnings: string[];
  rejected?: string;
}

export interface MedicationImportContext {
  userId: string;
  /** The name shown to the patient as the origin. Never 'manual'. */
  sourceLabel: string;
  connectionId: string;
  /** Injected so a sync run produces the same rows whenever it is replayed. */
  now?: Date;
}

/**
 * Statuses we will not import.
 *
 * 'draft' has not been issued to anybody. 'entered-in-error' is the sending
 * system retracting it. Both would appear to the patient as a live
 * prescription, which is the specific failure worth avoiding.
 */
const IGNORED_STATUSES = new Set(['draft', 'entered-in-error', 'unknown']);

/** Statuses that mean the patient should still be taking it. */
const ACTIVE_STATUSES = new Set(['active', 'on-hold']);

/**
 * The statuses a sync has to ask for.
 *
 * The mapper has always turned 'completed', 'stopped' and 'cancelled' into
 * `is_active = false`, but both sync functions asked the server for
 * `status=active,on-hold` — so those resources never arrived and the branch
 * was unreachable. A prescription stopped at the hospital stayed active in
 * OneCare forever, and the patient's list went on telling them to take
 * something their doctor had stopped.
 *
 * Asking for the ended statuses too is what makes stopping a medicine
 * propagate. It costs one wider query and is the difference between a
 * medication list that reflects the prescription and one that only ever grows.
 */
export const MEDICATION_STATUSES = 'active,on-hold,completed,stopped,cancelled';

export function medicationRowFromFhir(
  resource: FhirMedicationRequest,
  context: MedicationImportContext,
): MedicationImportResult {
  const warnings: string[] = [];

  if (resource.resourceType && resource.resourceType !== 'MedicationRequest') {
    return { warnings, rejected: `Expected a MedicationRequest, got ${resource.resourceType}.` };
  }

  const status = (resource.status ?? '').toLowerCase();
  if (IGNORED_STATUSES.has(status)) {
    return { warnings, rejected: `The sending system marked this prescription '${status}'.` };
  }

  // A proposal or a plan is not an order. Importing one would tell the patient
  // they have been prescribed something that was only being considered.
  if (resource.intent && !['order', 'original-order', 'instance-order'].includes(resource.intent)) {
    return { warnings, rejected: `This is a '${resource.intent}', not an order.` };
  }

  const name = readName(resource);
  if (!name) {
    return {
      warnings,
      rejected:
        'This prescription has no readable name — only a code we cannot resolve without a terminology service.',
    };
  }
  if (!resource.medicationCodeableConcept?.text && resource.medicationCodeableConcept?.coding?.length) {
    warnings.push("The name came from a code's display text rather than a written name.");
  }

  const instruction = resource.dosageInstruction?.[0];
  if (resource.dosageInstruction && resource.dosageInstruction.length > 1) {
    warnings.push(
      `Only the first of ${resource.dosageInstruction.length} dosage instructions was imported.`,
    );
  }

  const dosage = readDose(instruction);
  if (!dosage) {
    return {
      warnings,
      rejected: 'No dose was sent, and a medication without a dose is not something to act on.',
    };
  }

  const { frequency, times, frequencyWarning } = readFrequency(instruction);
  if (frequencyWarning) warnings.push(frequencyWarning);

  const instructions =
    instruction?.patientInstruction?.trim() ||
    instruction?.text?.trim() ||
    resource.note?.map((n) => n.text?.trim()).filter(Boolean).join(' · ') ||
    null;

  const startDate =
    isoDate(resource.dispenseRequest?.validityPeriod?.start) ??
    isoDate(resource.authoredOn) ??
    isoDate((context.now ?? new Date()).toISOString())!;

  return {
    warnings,
    row: {
      user_id: context.userId,
      name,
      dosage,
      frequency,
      times_of_day: times,
      // Everything arriving through a MedicationRequest was prescribed. An
      // over-the-counter medicine a patient bought reaches us another way.
      type: 'prescription',
      instructions,
      prescriber: resource.requester?.display?.trim() || null,
      start_date: startDate,
      is_active: ACTIVE_STATUSES.has(status),
      source: context.sourceLabel,
      external_id: resource.id ?? null,
      ehr_connection_id: context.connectionId,
    },
  };
}

function readName(resource: FhirMedicationRequest): string | null {
  const concept = resource.medicationCodeableConcept;
  const fromText = concept?.text?.trim();
  if (fromText) return fromText;
  const fromCoding = concept?.coding?.find((c) => c.display?.trim())?.display?.trim();
  if (fromCoding) return fromCoding;
  const fromReference = resource.medicationReference?.display?.trim();
  if (fromReference) return fromReference;
  return null;
}

/**
 * The dose as a string, because that is how the column is shaped and because
 * "500 mg" is what a person reads on a label.
 */
function readDose(instruction?: FhirDosageInstruction): string | null {
  const rate = instruction?.doseAndRate?.[0];
  const quantity = rate?.doseQuantity;
  if (quantity?.value !== undefined && quantity.value !== null) {
    const unit = quantity.unit?.trim() || quantity.code?.trim() || '';
    return unit ? `${quantity.value} ${unit}` : String(quantity.value);
  }

  const low = rate?.doseRange?.low;
  const high = rate?.doseRange?.high;
  if (low?.value !== undefined && high?.value !== undefined) {
    const unit = high.unit?.trim() || low.unit?.trim() || '';
    return unit ? `${low.value}–${high.value} ${unit}` : `${low.value}–${high.value}`;
  }

  // Free text is a last resort but a legitimate one: plenty of real systems
  // send "one tablet" and nothing structured.
  const text = instruction?.text?.trim();
  if (text) return text;
  return null;
}

/**
 * FHIR timing → the app's frequency vocabulary.
 *
 * The app stores a fixed set of frequencies, and FHIR can express far more
 * than that set. Anything outside it becomes 'as_needed' with a warning
 * naming what was actually sent — an approximate frequency presented as exact
 * would have the patient taking doses on a schedule nobody prescribed.
 */
function readFrequency(instruction?: FhirDosageInstruction): {
  frequency: string;
  times: string[];
  frequencyWarning?: string;
} {
  const times = (instruction?.timing?.repeat?.timeOfDay ?? [])
    .map(trimSeconds)
    .filter((t): t is string => Boolean(t));

  if (instruction?.asNeededBoolean) {
    return { frequency: 'as_needed', times: [] };
  }

  const repeat = instruction?.timing?.repeat;
  const frequency = repeat?.frequency;
  const period = repeat?.period;
  const unit = repeat?.periodUnit;

  if (frequency && period && unit) {
    const perDay = unit === 'd' ? frequency / period : unit === 'h' ? (frequency * 24) / period : null;
    const hourly = unit === 'h' ? period / frequency : null;

    if (hourly !== null) {
      const matched = { 4: 'every_4_hours', 6: 'every_6_hours', 8: 'every_8_hours', 12: 'every_12_hours' }[
        hourly
      ];
      if (matched) return { frequency: matched, times: times.length ? times : defaultTimesFor(matched) };
    }
    if (perDay !== null) {
      const matched = { 1: 'once_daily', 2: 'twice_daily', 3: 'three_times_daily', 4: 'four_times_daily' }[
        perDay
      ];
      if (matched) return { frequency: matched, times: times.length ? times : defaultTimesFor(matched) };
    }
    if (unit === 'wk' && frequency === 1 && period === 1) {
      return { frequency: 'weekly', times: times.length ? times : ['09:00'] };
    }
    if (unit === 'd' && frequency === 1 && period === 2) {
      return { frequency: 'every_other_day', times: times.length ? times : ['09:00'] };
    }

    return {
      frequency: 'as_needed',
      times,
      frequencyWarning: `The schedule sent (${frequency} every ${period} ${unit}) is not one we hold, so it is recorded as "as needed". The original is in the instructions.`,
    };
  }

  if (times.length > 0) {
    const byCount = { 1: 'once_daily', 2: 'twice_daily', 3: 'three_times_daily', 4: 'four_times_daily' }[
      times.length
    ];
    if (byCount) return { frequency: byCount, times };
  }

  return {
    frequency: 'as_needed',
    times,
    frequencyWarning: 'No schedule was sent, so it is recorded as "as needed".',
  };
}

/** The app stores HH:mm; FHIR's `time` primitive requires seconds. */
function trimSeconds(value: string): string | null {
  const match = /^(\d{2}):(\d{2})/.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * Kept in step with MEDICATION_FREQUENCIES in src/types/health.ts by the test
 * suite, which reads both. Duplicated rather than imported because this file
 * has to stay import-free to run under Deno.
 */
const DEFAULT_TIMES: Record<string, string[]> = {
  once_daily: ['09:00'],
  twice_daily: ['09:00', '21:00'],
  three_times_daily: ['09:00', '15:00', '21:00'],
  four_times_daily: ['09:00', '13:00', '17:00', '21:00'],
  every_4_hours: ['06:00', '10:00', '14:00', '18:00', '22:00', '02:00'],
  every_6_hours: ['06:00', '12:00', '18:00', '00:00'],
  every_8_hours: ['08:00', '16:00', '00:00'],
  every_12_hours: ['09:00', '21:00'],
  every_other_day: ['09:00'],
  weekly: ['09:00'],
  as_needed: [],
};

export function defaultTimesFor(frequency: string): string[] {
  return DEFAULT_TIMES[frequency] ?? [];
}

/** The column is a date, and an ISO instant would be silently truncated. */
function isoDate(value?: string): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}
