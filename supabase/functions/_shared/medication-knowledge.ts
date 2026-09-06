/**
 * What the app knows about a medicine, in one import-free module.
 *
 * Before this file the knowledge was in three places that could not see each
 * other: `drug-lookup` fetched DailyMed and openFDA labels, `offline-interactions`
 * held a small hand-maintained pair table on the client, and the patient
 * assistant had neither — it answered "can I take ibuprofen with my lisinopril?"
 * from the model's own memory, with no label behind it and nothing to cite.
 *
 * That is the failure this module exists to stop. `interaction-verdict.ts`
 * already states the rule for the medications page — **the app never says "safe"
 * while any source disagrees** — and an assistant answering the same question
 * from a different body of knowledge is the two-panels-disagree bug with a chat
 * window around it. One table, one grader, one set of parsers, read by the page
 * and by the assistant alike.
 *
 * Imports nothing, so it runs in Deno (the edge functions) and in the browser
 * test suite, for the same reason as `fhir-observation.ts`: the parsing that
 * decides what a patient is told about their medicine is worth testing, and a
 * Deno-only file cannot be.
 *
 * Retrieval takes `fetch` as an argument rather than reaching for a global, so
 * the tests drive every branch — including the ones that matter most, where the
 * upstream is down or the label simply does not answer the question.
 */

export type InteractionSeverity = "high" | "moderate" | "low";

export const SEVERITY_ORDER: Record<InteractionSeverity, number> = {
  high: 0,
  moderate: 1,
  low: 2,
};

export interface InteractionInfo {
  medications: [string, string];
  severity: InteractionSeverity;
  description: string;
  recommendation: string;
}

/**
 * A small hand-maintained reference, used when the NIH RxNorm lookup is
 * unavailable and as a second opinion alongside it. Deliberately not
 * authoritative: it exists so the app still says something useful with no
 * connection, and so that RxNorm's silence is never mistaken for safety.
 */
export const INTERACTION_REFERENCE: InteractionInfo[] = [
  // NSAID interactions
  {
    medications: ['Ibuprofen', 'Advil'],
    severity: 'moderate',
    description: 'Advil is a brand name for Ibuprofen. Taking both means double dosing on the same medication.',
    recommendation: 'Do not take both. Choose one or the other.',
  },
  {
    medications: ['Ibuprofen', 'Aspirin'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of stomach bleeding and kidney problems.',
    recommendation: 'Avoid taking together unless directed by your doctor.',
  },
  {
    medications: ['Ibuprofen', 'Naproxen'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of stomach bleeding and kidney problems.',
    recommendation: 'Do not take together. Choose one NSAID only.',
  },
  {
    medications: ['Advil', 'Aspirin'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of stomach bleeding.',
    recommendation: 'Avoid taking together unless directed by your doctor.',
  },
  {
    medications: ['Advil', 'Naproxen'],
    severity: 'moderate',
    description: 'Both are NSAIDs. Combined use increases risk of gastrointestinal bleeding.',
    recommendation: 'Do not take together. Choose one NSAID only.',
  },
  // Original interactions
  {
    medications: ['Metformin', 'Lisinopril'],
    severity: 'low',
    description: 'Lisinopril may slightly enhance the blood glucose-lowering effect of Metformin.',
    recommendation: 'Monitor blood glucose levels. Usually no action needed.',
  },
  {
    medications: ['Warfarin', 'Aspirin'],
    severity: 'high',
    description: 'Combined use significantly increases bleeding risk.',
    recommendation: 'Consult your doctor immediately. Close monitoring required.',
  },
  {
    medications: ['Warfarin', 'Ibuprofen'],
    severity: 'high',
    description: 'NSAIDs like Ibuprofen increase the risk of bleeding when taken with Warfarin.',
    recommendation: 'Avoid combination. Consult your healthcare provider.',
  },
  {
    medications: ['Warfarin', 'Advil'],
    severity: 'high',
    description: 'NSAIDs like Advil (Ibuprofen) increase the risk of bleeding when taken with Warfarin.',
    recommendation: 'Avoid combination. Consult your healthcare provider.',
  },
  {
    medications: ['Warfarin', 'Vitamin K'],
    severity: 'moderate',
    description: 'Vitamin K can reduce the effectiveness of Warfarin.',
    recommendation: 'Maintain consistent Vitamin K intake. Monitor INR closely.',
  },
  {
    medications: ['Lisinopril', 'Potassium'],
    severity: 'moderate',
    description: 'ACE inhibitors like Lisinopril can increase potassium levels.',
    recommendation: 'Monitor potassium levels regularly. Avoid high-potassium supplements.',
  },
  {
    medications: ['Atorvastatin', 'Grapefruit'],
    severity: 'moderate',
    description: 'Grapefruit can increase statin levels in the blood.',
    recommendation: 'Avoid grapefruit products while taking this medication.',
  },
  {
    medications: ['Metoprolol', 'Verapamil'],
    severity: 'high',
    description: 'Both medications slow heart rate. Combination can cause severe bradycardia.',
    recommendation: 'Use together only under close medical supervision.',
  },
  {
    medications: ['Metformin', 'Alcohol'],
    severity: 'high',
    description: 'Alcohol can increase the risk of lactic acidosis with Metformin.',
    recommendation: 'Limit alcohol consumption. Monitor for symptoms.',
  },
  {
    medications: ['Simvastatin', 'Amlodipine'],
    severity: 'moderate',
    description: 'Amlodipine can increase Simvastatin blood levels.',
    recommendation: 'Simvastatin dose should not exceed 20mg daily.',
  },
  {
    medications: ['Omeprazole', 'Clopidogrel'],
    severity: 'moderate',
    description: 'Omeprazole may reduce the effectiveness of Clopidogrel.',
    recommendation: 'Consider alternative acid-reducing medication.',
  },
  {
    medications: ['Fluoxetine', 'Tramadol'],
    severity: 'high',
    description: 'Risk of serotonin syndrome and reduced seizure threshold.',
    recommendation: 'Avoid combination. Consult your doctor.',
  },
  {
    medications: ['Ciprofloxacin', 'Antacids'],
    severity: 'moderate',
    description: 'Antacids reduce absorption of Ciprofloxacin.',
    recommendation: 'Take Ciprofloxacin 2 hours before or 6 hours after antacids.',
  },
  {
    medications: ['Digoxin', 'Amiodarone'],
    severity: 'high',
    description: 'Amiodarone increases Digoxin levels, risking toxicity.',
    recommendation: 'Reduce Digoxin dose by 50%. Monitor closely.',
  },
  {
    medications: ['Levothyroxine', 'Calcium'],
    severity: 'moderate',
    description: 'Calcium supplements reduce absorption of Levothyroxine.',
    recommendation: 'Take Levothyroxine 4 hours apart from calcium.',
  },
  {
    medications: ['Prednisone', 'NSAIDs'],
    severity: 'moderate',
    description: 'Increased risk of gastrointestinal bleeding and ulcers.',
    recommendation: 'Use gastroprotective medication if combination is necessary.',
  },
  {
    medications: ['Prednisone', 'Ibuprofen'],
    severity: 'moderate',
    description: 'Increased risk of gastrointestinal bleeding and ulcers.',
    recommendation: 'Use gastroprotective medication if combination is necessary.',
  },
  {
    medications: ['Sertraline', 'Tramadol'],
    severity: 'high',
    description: 'Risk of serotonin syndrome when combining SSRIs with Tramadol.',
    recommendation: 'Avoid combination. Consult your doctor.',
  },
  {
    medications: ['Escitalopram', 'Tramadol'],
    severity: 'high',
    description: 'Risk of serotonin syndrome when combining SSRIs with Tramadol.',
    recommendation: 'Avoid combination. Consult your doctor.',
  },
  {
    medications: ['Alprazolam', 'Alcohol'],
    severity: 'high',
    description: 'Combination can cause severe drowsiness, respiratory depression, and death.',
    recommendation: 'Never mix benzodiazepines with alcohol.',
  },
  {
    medications: ['Lorazepam', 'Alcohol'],
    severity: 'high',
    description: 'Combination can cause severe drowsiness, respiratory depression, and death.',
    recommendation: 'Never mix benzodiazepines with alcohol.',
  },
  {
    medications: ['Gabapentin', 'Opioids'],
    severity: 'high',
    description: 'Combined use increases risk of respiratory depression.',
    recommendation: 'Use with extreme caution and close monitoring.',
  },
  {
    medications: ['Lisinopril', 'Losartan'],
    severity: 'high',
    description: 'Dual renin-angiotensin blockade increases risk of kidney problems and hyperkalemia.',
    recommendation: 'Generally avoid combination. Close monitoring required.',
  },
  {
    medications: ['Metformin', 'Contrast Dye'],
    severity: 'high',
    description: 'Risk of lactic acidosis if Metformin is continued during contrast procedures.',
    recommendation: 'Stop Metformin before and 48 hours after contrast procedures.',
  },
];

/**
 * Case and punctuation flattened, so "Co-codamol" and "co codamol" meet.
 *
 * A separator becomes a space rather than nothing. Deleting it was the
 * inherited behaviour and it lost real pairs: a patient whose supplement list
 * says "Vitamin-K" normalised to "vitamink", which does not contain the table's
 * "vitamin k", so the warfarin warning — one of the best known there is, and
 * graded high right here in this file — never appeared for them while it
 * appeared for the patient who typed a space.
 */
export function normaliseDrugName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Two names for the same medicine, allowing one to contain the other. */
export function drugNamesMatch(a: string, b: string): boolean {
  const n1 = normaliseDrugName(a);
  const n2 = normaliseDrugName(b);
  if (!n1 || !n2) return false;
  return n1.includes(n2) || n2.includes(n1);
}

export interface ReferenceHit extends InteractionInfo {
  med1Name: string;
  med2Name: string;
}

/** Every pair among these names that appears in the reference table. */
export function referenceInteractionsFor(names: readonly string[]): ReferenceHit[] {
  const found: ReferenceHit[] = [];

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      for (const interaction of INTERACTION_REFERENCE) {
        const [first, second] = interaction.medications;
        if (
          (drugNamesMatch(names[i], first) && drugNamesMatch(names[j], second)) ||
          (drugNamesMatch(names[i], second) && drugNamesMatch(names[j], first))
        ) {
          found.push({ ...interaction, med1Name: names[i], med2Name: names[j] });
        }
      }
    }
  }

  return found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * RxNorm supplies prose and no grade, so the grade is read off the prose.
 *
 * Crude, and deliberately biased upward: the high-severity words are tested
 * first, so a description carrying both "minor" and "avoid" is graded high. A
 * warning read as worse than it is costs a patient a question to their
 * pharmacist; the other direction costs more than that.
 */
export function severityFromDescription(description: string): InteractionSeverity {
  const desc = description.toLowerCase();

  if (
    desc.includes("contraindicated") ||
    desc.includes("avoid") ||
    desc.includes("serious") ||
    desc.includes("severe") ||
    desc.includes("fatal") ||
    desc.includes("death") ||
    desc.includes("life-threatening") ||
    desc.includes("do not use") ||
    desc.includes("serotonin syndrome") ||
    desc.includes("qt prolongation") ||
    desc.includes("bleeding")
  ) {
    return "high";
  }

  if (
    desc.includes("minor") ||
    desc.includes("unlikely") ||
    desc.includes("theoretical") ||
    desc.includes("not clinically significant")
  ) {
    return "low";
  }

  return "moderate";
}

export interface RxNormInteraction {
  drug1: string;
  drug2: string;
  severity: InteractionSeverity;
  description: string;
  source: string;
  sourceUrl?: string;
}

/** The interaction pairs out of an RxNav `interaction/list.json` body. */
export function interactionsFromRxNav(payload: unknown): RxNormInteraction[] {
  const groups = (payload as { fullInteractionTypeGroup?: unknown[] })?.fullInteractionTypeGroup;
  if (!Array.isArray(groups)) return [];

  const interactions: RxNormInteraction[] = [];

  for (const group of groups as Array<Record<string, unknown>>) {
    const sourceName = typeof group.sourceName === "string" ? group.sourceName : "RxNorm";
    const types = Array.isArray(group.interactionType) ? group.interactionType : [];

    for (const type of types as Array<Record<string, unknown>>) {
      const pairs = Array.isArray(type.interactionPair) ? type.interactionPair : [];

      for (const pair of pairs as Array<Record<string, unknown>>) {
        const description = typeof pair.description === "string" ? pair.description : "";
        if (!description) continue;

        const concepts = Array.isArray(pair.interactionConcept) ? pair.interactionConcept : [];
        const drugs = (concepts as Array<Record<string, any>>).map(
          (c) => c?.minConceptItem?.name,
        );

        interactions.push({
          drug1: typeof drugs[0] === "string" ? drugs[0] : "Unknown",
          drug2: typeof drugs[1] === "string" ? drugs[1] : "Unknown",
          severity: severityFromDescription(description),
          description,
          source: sourceName,
          sourceUrl: (concepts as Array<Record<string, any>>)[0]?.sourceConceptItem?.url,
        });
      }
    }
  }

  return interactions.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ---------------------------------------------------------------------------
// Drug labels
// ---------------------------------------------------------------------------

/** Markup stripped and whitespace collapsed. Length is left to `condense`. */
export function cleanLabelText(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Trimmed to a budget at a sentence boundary where one is near enough, so an
 * excerpt never stops mid-word. A cut is marked, because an answer built on a
 * truncated warnings section should say the warnings section was truncated.
 */
export function condense(text: string, maxChars: number): string {
  const clean = cleanLabelText(text);
  if (clean.length <= maxChars) return clean;

  const window = clean.slice(0, maxChars);
  const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  const cut = lastStop > maxChars * 0.6 ? window.slice(0, lastStop + 1) : window;
  return `${cut.trim()} […truncated]`;
}

/** The questions this knowledge base will answer, and nothing beyond them. */
export type MedicationTopic =
  | "side_effects"
  | "interactions"
  | "missed_dose"
  | "how_to_take"
  | "warnings"
  | "storage";

export const MEDICATION_TOPICS: readonly MedicationTopic[] = [
  "side_effects",
  "interactions",
  "missed_dose",
  "how_to_take",
  "warnings",
  "storage",
];

/**
 * Which label sections answer which question, in the order they are consulted.
 *
 * The patient-facing sections come first wherever they exist: an FDA label
 * carries both a prescriber's `adverse_reactions` and a patient leaflet, and the
 * leaflet is the one written for the person asking.
 */
const TOPIC_SECTIONS: Record<MedicationTopic, readonly string[]> = {
  side_effects: ["adverse_reactions", "stop_use", "when_using"],
  interactions: ["drug_interactions", "drug_and_or_laboratory_test_interactions"],
  missed_dose: [
    "spl_patient_package_insert",
    "information_for_patients",
    "patient_medication_information",
    "dosage_and_administration",
  ],
  how_to_take: [
    "dosage_and_administration",
    "information_for_patients",
    "spl_patient_package_insert",
  ],
  warnings: ["boxed_warning", "warnings_and_cautions", "warnings", "contraindications"],
  storage: ["storage_and_handling", "how_supplied"],
};

/** An openFDA label result: every section arrives as an array of strings. */
export type DrugLabelResult = Record<string, unknown>;

function sectionText(label: DrugLabelResult, field: string): string {
  const value = label[field];
  if (Array.isArray(value)) return cleanLabelText(value.filter((v) => typeof v === "string").join(" "));
  if (typeof value === "string") return cleanLabelText(value);
  return "";
}

export interface TopicExcerpt {
  topic: MedicationTopic;
  /** The label section the text came from, so an answer can say where it read it. */
  section: string | null;
  text: string;
  /** False when the label carries no section answering this question. */
  found: boolean;
}

/**
 * The cues a label uses when it tells someone what to do about a missed dose.
 * Deliberately narrow: a near miss here means an answer built on the wrong
 * paragraph.
 */
const MISSED_DOSE_CUE =
  /\b(miss(?:ed|es|ing)?\s+(?:a\s+|the\s+|your\s+)?dose|missed\s+dose|forget\s+to\s+take|forgot\s+to\s+take|skip(?:ped)?\s+(?:a\s+|the\s+)?dose|double\s+(?:the\s+)?dose|as\s+soon\s+as\s+you\s+remember)\b/i;

const SENTENCE_END = /[.!?]/;

/**
 * The missed-dose passage out of a label section, or null.
 *
 * Extraction rather than the whole section, and null rather than a fallback,
 * because the section this most often lives in is `dosage_and_administration` —
 * which on a prescriber's label is a titration table. Handing that to an
 * assistant that has been told not to discuss dose changes is handing it the
 * dose changes and hoping. If the label does not answer the question, the honest
 * output is that it does not.
 */
export function missedDosePassage(text: string, maxChars = 600): string | null {
  const clean = cleanLabelText(text);
  const match = MISSED_DOSE_CUE.exec(clean);
  if (!match) return null;

  // Back up to the start of the sentence the cue sits in.
  let start = match.index;
  while (start > 0 && !SENTENCE_END.test(clean[start - 1])) start -= 1;

  // Run on to the end of the sentence after it: this guidance is nearly always
  // two sentences ("take it as soon as you remember" / "unless it is nearly
  // time for the next one"), and the second is the half that prevents doubling.
  let end = match.index + match[0].length;
  let sentences = 0;
  while (end < clean.length && sentences < 2) {
    if (SENTENCE_END.test(clean[end])) sentences += 1;
    end += 1;
  }

  return condense(clean.slice(start, end).trim(), maxChars);
}

/** What the label says about one topic, or an explicit "it does not say". */
export function labelExcerpt(
  label: DrugLabelResult,
  topic: MedicationTopic,
  maxChars = 900,
): TopicExcerpt {
  for (const field of TOPIC_SECTIONS[topic]) {
    const text = sectionText(label, field);
    if (!text) continue;

    if (topic === "missed_dose") {
      const passage = missedDosePassage(text);
      if (passage) return { topic, section: field, text: passage, found: true };
      continue;
    }

    return { topic, section: field, text: condense(text, maxChars), found: true };
  }

  return { topic, section: null, text: "", found: false };
}

export interface MedicationIdentity {
  name: string;
  genericName?: string;
  manufacturer?: string;
  setId?: string;
}

/** The openFDA `openfda` block reduced to what an answer needs to cite. */
export function identityFrom(label: DrugLabelResult, fallbackName: string): MedicationIdentity {
  const openfda = (label.openfda ?? {}) as Record<string, unknown>;
  const first = (key: string): string | undefined => {
    const value = openfda[key];
    return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
  };

  return {
    name: first("brand_name") ?? first("generic_name") ?? fallbackName,
    genericName: first("generic_name"),
    manufacturer: first("manufacturer_name"),
    setId: first("spl_set_id"),
  };
}

// ---------------------------------------------------------------------------
// One verdict from both sources
// ---------------------------------------------------------------------------

export type InteractionSource = "rxnorm" | "reference";

export interface MergedInteraction {
  drug1: string;
  drug2: string;
  severity: InteractionSeverity;
  description: string;
  /** Present on reference entries; RxNorm does not supply one. */
  recommendation?: string;
  source: InteractionSource;
  sourceLabel: string;
  sourceUrl?: string;
}

export interface InteractionVerdict {
  interactions: MergedInteraction[];
  counts: { high: number; moderate: number; low: number };
  /**
   * True only when both sources were consulted successfully and neither found
   * anything. Anything else — a flagged pair, a failed lookup, a check that has
   * not run yet — leaves this false.
   */
  isClear: boolean;
  /** True when RxNorm could not be reached, so the verdict rests on the reference table alone. */
  isPartial: boolean;
}

/** Same pair of drugs regardless of which way round they are named. */
function pairKey(a: string, b: string): string {
  return [a.toLowerCase().trim(), b.toLowerCase().trim()].sort().join("|");
}

/**
 * The app's single answer on whether two medicines interact.
 *
 * The rule that governs it: **never report "safe" while any source disagrees,
 * and never read silence as safety.** RxNorm being unreachable is not a clean
 * bill of health, and the reference table is small enough that its silence means
 * very little on its own. The medications page and the patient assistant both
 * call this, so the two cannot answer the same question differently.
 */
export function buildInteractionVerdict(params: {
  rxnorm: readonly RxNormInteraction[];
  reference: readonly ReferenceHit[];
  /** The RxNorm lookup finished (successfully or not). */
  rxnormChecked: boolean;
  /** The RxNorm lookup failed, so its silence means nothing. */
  rxnormFailed: boolean;
}): InteractionVerdict {
  const { rxnorm, reference, rxnormChecked, rxnormFailed } = params;

  const merged: MergedInteraction[] = rxnorm.map((i) => ({
    drug1: i.drug1,
    drug2: i.drug2,
    severity: i.severity,
    description: i.description,
    source: "rxnorm" as const,
    sourceLabel: i.source || "NIH RxNorm",
    sourceUrl: i.sourceUrl,
  }));

  // Add reference entries the live source did not already report, so the same
  // pair is not shown twice. RxNorm wins on wording where both have it.
  const seen = new Set(merged.map((i) => pairKey(i.drug1, i.drug2)));
  for (const entry of reference) {
    const key = pairKey(entry.med1Name, entry.med2Name);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      drug1: entry.med1Name,
      drug2: entry.med2Name,
      severity: entry.severity,
      description: entry.description,
      recommendation: entry.recommendation,
      source: "reference",
      sourceLabel: "Offline reference",
    });
  }

  merged.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    interactions: merged,
    counts: {
      high: merged.filter((i) => i.severity === "high").length,
      moderate: merged.filter((i) => i.severity === "moderate").length,
      low: merged.filter((i) => i.severity === "low").length,
    },
    isClear: merged.length === 0 && rxnormChecked && !rxnormFailed,
    isPartial: rxnormFailed,
  };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/** The shape of `fetch` this module needs, so tests can supply their own. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * A drug name safe to interpolate into an openFDA query.
 *
 * openFDA takes a Lucene-ish query string, so a name carrying a quote or a colon
 * changes the query rather than the search term. Everything outside letters,
 * digits, spaces and hyphens goes.
 */
export function searchSafeName(name: string): string {
  return name.replace(/[^A-Za-z0-9 \-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** The openFDA label for a drug, by brand or generic name. */
export async function fetchDrugLabel(
  name: string,
  fetchFn: FetchLike,
): Promise<DrugLabelResult | null> {
  const safe = searchSafeName(name);
  if (!safe) return null;

  const queries = [
    `(openfda.brand_name:"${safe}"+OR+openfda.generic_name:"${safe}")`,
    `openfda.substance_name:"${safe}"`,
  ];

  for (const query of queries) {
    try {
      const response = await fetchFn(
        `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query).replace(/%2B/g, "+")}&limit=1`,
      );
      // openFDA answers 404 for "nothing matched", which is not an error worth
      // retrying — it is the next query's turn.
      if (!response.ok) continue;

      const payload = (await response.json()) as { results?: unknown[] };
      const result = payload?.results?.[0];
      if (result && typeof result === "object") return result as DrugLabelResult;
    } catch {
      // A transport failure is not "no such drug". Fall through and let the
      // caller report that the label could not be read.
      return null;
    }
  }

  return null;
}

export interface RxNormLookup {
  interactions: RxNormInteraction[];
  /** False when RxNorm could not be consulted, which is never the same as "nothing found". */
  reachable: boolean;
}

/** RxCUIs for a set of names, dropping the ones RxNorm does not know. */
async function rxcuisFor(names: readonly string[], fetchFn: FetchLike): Promise<string[]> {
  const found: string[] = [];

  for (const name of names) {
    const safe = searchSafeName(name);
    if (!safe) continue;
    try {
      const response = await fetchFn(
        `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(safe)}&search=1`,
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as { idGroup?: { rxnormId?: string[] } };
      const rxcui = payload?.idGroup?.rxnormId?.[0];
      if (rxcui) found.push(rxcui);
    } catch {
      // One name failing is not the whole lookup failing.
    }
  }

  return found;
}

/** The RxNorm interaction check, saying plainly whether it ran at all. */
export async function fetchRxNormInteractions(
  names: readonly string[],
  fetchFn: FetchLike,
): Promise<RxNormLookup> {
  if (names.length < 2) return { interactions: [], reachable: true };

  const rxcuis = await rxcuisFor(names, fetchFn);
  // Fewer than two known names means the question was never put to RxNorm, so
  // reporting "nothing found" would be reporting on a check that never ran.
  if (rxcuis.length < 2) return { interactions: [], reachable: false };

  try {
    const response = await fetchFn(
      `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis.join("+")}`,
    );
    if (!response.ok) return { interactions: [], reachable: false };
    return { interactions: interactionsFromRxNav(await response.json()), reachable: true };
  } catch {
    return { interactions: [], reachable: false };
  }
}

// ---------------------------------------------------------------------------
// What the assistant reads
// ---------------------------------------------------------------------------

const TOPIC_LABEL: Record<MedicationTopic, string> = {
  side_effects: "SIDE EFFECTS",
  interactions: "INTERACTIONS",
  missed_dose: "MISSED DOSE",
  how_to_take: "HOW TO TAKE IT",
  warnings: "WARNINGS",
  storage: "STORAGE",
};

export interface MedicationBrief {
  query: string;
  identity: MedicationIdentity | null;
  excerpts: TopicExcerpt[];
  labelFound: boolean;
}

/**
 * The brief as the model sees it.
 *
 * Every gap is stated rather than left blank. A model handed an empty section
 * fills it from its own memory and cites the label anyway; a model told "the
 * label does not answer this" has been given the answer to give. That is the
 * whole point of retrieving at all — the citation has to be worth something.
 */
export function formatMedicationBrief(brief: MedicationBrief): string {
  if (!brief.labelFound || !brief.identity) {
    return [
      `MEDICATION LOOKUP: "${brief.query}" — NO LABEL FOUND.`,
      "No drug label could be read for this name. Say that you could not find it and ask the",
      "user to check the spelling or read the name off the box. Do NOT answer from memory.",
    ].join("\n");
  }

  const { name, genericName, manufacturer } = brief.identity;
  const heading = [
    `MEDICATION: ${name}`,
    genericName && genericName.toLowerCase() !== name.toLowerCase() ? `(generic: ${genericName})` : "",
    manufacturer ? `— ${manufacturer}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sections = brief.excerpts.map((excerpt) =>
    excerpt.found
      ? `${TOPIC_LABEL[excerpt.topic]} — from the label's "${excerpt.section}" section:\n${excerpt.text}`
      : `${TOPIC_LABEL[excerpt.topic]} — the label does not answer this. Say so; do not fill it in from memory.`,
  );

  return [heading, "SOURCE: FDA drug label, via openFDA.", "", ...sections].join("\n\n");
}

/** Look up one medicine and return the brief, already formatted. */
export async function medicationBrief(
  name: string,
  topics: readonly MedicationTopic[],
  fetchFn: FetchLike,
): Promise<MedicationBrief> {
  const label = await fetchDrugLabel(name, fetchFn);
  if (!label) return { query: name, identity: null, excerpts: [], labelFound: false };

  const wanted = topics.length > 0 ? topics : MEDICATION_TOPICS;
  return {
    query: name,
    identity: identityFrom(label, name),
    excerpts: wanted.map((topic) => labelExcerpt(label, topic)),
    labelFound: true,
  };
}

/**
 * The interaction verdict as the model sees it.
 *
 * "Nothing found" and "could not check" are written differently on purpose. The
 * second is the one an assistant will otherwise report as the first.
 */
export function formatInteractionVerdict(
  names: readonly string[],
  verdict: InteractionVerdict,
): string {
  const header = `INTERACTION CHECK: ${names.join(" + ")}`;

  if (verdict.interactions.length === 0) {
    return verdict.isClear
      ? `${header}\nBoth sources were checked and neither reports an interaction between these. Say that neither source flags them, not that they are safe.`
      : `${header}\nTHE CHECK DID NOT COMPLETE — the live interaction database could not be reached. Nothing was found, but nothing was ruled out either. Tell the user the check could not run and to ask their pharmacist. Do NOT say there are no interactions.`;
  }

  const lines = verdict.interactions.map((i) => {
    const recommendation = i.recommendation ? ` Recommendation: ${i.recommendation}` : "";
    return `- ${i.severity.toUpperCase()} — ${i.drug1} + ${i.drug2} (${i.sourceLabel}): ${i.description}${recommendation}`;
  });

  const partial = verdict.isPartial
    ? "\nNote: the live database could not be reached, so this list may be incomplete."
    : "";

  return `${header}\nFOUND ${verdict.interactions.length}:\n${lines.join("\n")}${partial}`;
}

/** Check a set of medicines against both sources and return one verdict. */
export async function interactionCheck(
  names: readonly string[],
  fetchFn: FetchLike,
): Promise<InteractionVerdict> {
  // One medicine has nothing to interact with, which is not the same as having
  // been checked and cleared. Reporting it as clear would be this module's own
  // failure mode — a check that never ran, rendered as a result.
  if (names.length < 2) {
    return buildInteractionVerdict({
      rxnorm: [],
      reference: [],
      rxnormChecked: false,
      rxnormFailed: false,
    });
  }

  const lookup = await fetchRxNormInteractions(names, fetchFn);
  return buildInteractionVerdict({
    rxnorm: lookup.interactions,
    reference: referenceInteractionsFor(names),
    rxnormChecked: true,
    rxnormFailed: !lookup.reachable,
  });
}

// ---------------------------------------------------------------------------
// The assistant's two lookups
// ---------------------------------------------------------------------------

export const LOOKUP_TOOLS = ["look_up_medication", "check_interactions"] as const;
export type LookupTool = (typeof LOOKUP_TOOLS)[number];

export function isLookupTool(name: unknown): name is LookupTool {
  return typeof name === "string" && (LOOKUP_TOOLS as readonly string[]).includes(name);
}

/** Names the model may pass, bounded so one turn cannot fan out over a pharmacy. */
export function boundedNames(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.trim().slice(0, 80))
    .slice(0, max);
}

export interface LookupResult {
  /** What the model reads back. */
  content: string;
  /** What the patient is shown as the source, when there is one worth naming. */
  source: string | null;
}

/**
 * Run one lookup and return both halves: the facts for the model, and the
 * citation for the patient.
 *
 * Every path returns something the model can act on honestly — a missing name,
 * a single medicine passed to an interaction check, an upstream that would not
 * answer. None of them returns an empty result for the model to interpret.
 */
export async function answerLookupTool(
  name: LookupTool,
  params: Record<string, unknown>,
  fetchFn: FetchLike,
): Promise<LookupResult> {
  if (name === "look_up_medication") {
    const drug = typeof params.name === "string" ? params.name.trim().slice(0, 80) : "";
    if (!drug) {
      return { content: "No medicine name was given, so nothing was looked up.", source: null };
    }

    const topics = boundedNames(params.topics, MEDICATION_TOPICS.length).filter(
      (t): t is MedicationTopic => (MEDICATION_TOPICS as readonly string[]).includes(t),
    );

    const brief = await medicationBrief(drug, topics, fetchFn);
    return {
      content: formatMedicationBrief(brief),
      source: brief.labelFound && brief.identity ? `FDA label — ${brief.identity.name}` : null,
    };
  }

  const names = boundedNames(params.names, 10);
  if (names.length < 2) {
    return {
      content:
        "Fewer than two medicines were given, so no interaction check was run. Ask the user which medicines they want checked against each other.",
      source: null,
    };
  }

  const verdict = await interactionCheck(names, fetchFn);
  return {
    content: formatInteractionVerdict(names, verdict),
    // A partial check is cited as partial, so the line under the reply cannot
    // read as a clean bill of health the reply itself does not claim.
    source: verdict.isPartial ? "Interaction check (incomplete)" : "NIH RxNorm interaction check",
  };
}
