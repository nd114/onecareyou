import { VITAL_CONFIG, type VitalType } from "@/types/health";

/**
 * A request from the assistant to *show* records, rather than describe them.
 *
 * The design point, and the reason this is not just another tool: the model
 * returns a **query, never data**. It names what to display; the browser then
 * runs that query through the ordinary Supabase client, so row policies decide
 * what comes back exactly as they do everywhere else.
 *
 * Three things follow from that, all of them better than pasting records into a
 * prompt as the existing snapshot does:
 *
 *   - The model cannot leak what the clinician cannot see, because it never
 *     holds the data. It holds a name and a filter.
 *   - What appears is current at the moment of asking, not current at whatever
 *     point the prompt was assembled.
 *   - The prompt stays small however much history a patient has.
 *
 * What comes back is rendered as cards the clinician can act on, which is the
 * difference between "her last three HbA1c were 7.2, 7.6 and 8.1" and three
 * readings with their dates, units and out-of-range flags.
 */

export type RecordKind = "vitals" | "medications" | "appointments" | "invoices";

export interface RecordQuery {
  kind: RecordKind;
  /** Whose records. Resolved against the panel the client already holds. */
  patientName?: string;
  /** For vitals: which measurement. */
  vitalType?: VitalType;
  limit: number;
}

const KINDS: RecordKind[] = ["vitals", "medications", "appointments", "invoices"];

/** Never unbounded, and never so large it stops being a glance. */
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 5;

/**
 * Read a record request out of whatever the model produced.
 *
 * Returns null rather than guessing. A tool call with an unrecognised kind is a
 * model mistake, and rendering the wrong records confidently is worse than
 * rendering none — the clinician would have no way to tell.
 */
export function parseRecordQuery(raw: unknown): RecordQuery | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const kind = typeof o.kind === "string" ? o.kind.trim().toLowerCase() : "";
  if (!KINDS.includes(kind as RecordKind)) return null;

  const query: RecordQuery = {
    kind: kind as RecordKind,
    limit: clampLimit(o.limit),
  };

  const name = typeof o.patient_name === "string" ? o.patient_name.trim() : "";
  if (name) query.patientName = name;

  if (query.kind === "vitals") {
    const type = typeof o.vital_type === "string" ? normaliseVitalType(o.vital_type) : null;
    if (type) query.vitalType = type;
  }

  return query;
}

function clampLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Map what a clinician would say to the key we store.
 *
 * A model asked for "HbA1c" or "blood sugar" should not fail because our column
 * says `hba1c` or `glucose`. Matching on the configured label as well as the key
 * means new vitals work without extending a list here.
 */
export function normaliseVitalType(input: string): VitalType | null {
  const wanted = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!wanted) return null;

  const keys = Object.keys(VITAL_CONFIG) as VitalType[];

  const exact = keys.find((k) => k === wanted);
  if (exact) return exact;

  const byLabel = keys.find(
    (k) => VITAL_CONFIG[k].label.toLowerCase().replace(/[\s-]+/g, "_") === wanted,
  );
  if (byLabel) return byLabel;

  const aliases: Record<string, VitalType> = {
    bp: "blood_pressure",
    blood_sugar: "glucose",
    sugar: "glucose",
    a1c: "hba1c",
    haemoglobin_a1c: "hba1c",
    hemoglobin_a1c: "hba1c",
    pulse: "heart_rate",
    hr: "heart_rate",
    spo2: "oxygen_saturation",
    o2: "oxygen_saturation",
    sats: "oxygen_saturation",
    temp: "temperature",
    weight_kg: "weight",
  };
  return aliases[wanted] ?? null;
}

/**
 * Which patient the query means, against the panel the client already has.
 *
 * Case- and punctuation-insensitive, and honours a partial name because a
 * clinician says "Moreau" not "Alex Moreau". Returns null when more than one
 * patient matches: showing one of two people's records because their surnames
 * collide is precisely the mistake worth refusing to make.
 */
export function resolvePatient<T extends { user_id: string; patient_name?: string | null }>(
  name: string | undefined,
  panel: T[],
): T | null {
  if (!name) return null;
  const wanted = simplify(name);
  if (!wanted) return null;

  const exact = panel.filter((p) => simplify(p.patient_name ?? "") === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const partial = panel.filter((p) => simplify(p.patient_name ?? "").includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}

function simplify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
