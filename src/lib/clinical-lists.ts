/**
 * Conditions and allergies, as the app has to read them.
 *
 * These are stored as jsonb free-text lists on profiles, clinician_patient_records
 * and family_members. A CHECK constraint now requires an array, but rows written
 * before that, and anything arriving from an import or an extraction, still need
 * reading defensively — and the difference between "withheld" and "none recorded"
 * has to survive, because the two mean opposite things to a clinician.
 */

/** No list at all, because the patient did not share this category. */
export const WITHHELD = null;

/**
 * The entries in a stored clinical list.
 *
 * Accepts what the column can actually hold: an array, a loose comma- or
 * semicolon-separated string, or an object with a name. Returns entries trimmed,
 * empties dropped, duplicates removed — case-insensitively, because "Penicillin"
 * and "penicillin" are one allergy and showing both is how a clinician stops
 * trusting the list.
 */
export function toClinicalList(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,]/)
      : value === null || value === undefined
        ? []
        : [value];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of raw) {
    const text = entryText(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

/** One entry's display text. Objects carry it under a handful of known keys. */
function entryText(entry: unknown): string {
  if (entry === null || entry === undefined) return "";
  if (typeof entry === "string") return entry.trim();
  if (typeof entry === "number" || typeof entry === "boolean") return String(entry);

  if (typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    for (const key of ["name", "text", "display", "label", "value", "condition", "allergy"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  return "";
}

/**
 * Whether the category was shared at all.
 *
 * The clinical-profile RPC returns null for a category the patient withheld and
 * an empty array when there is nothing recorded. A clinician reading "no known
 * allergies" when the truth is "you were not told" is the failure this prevents,
 * so the two never collapse into one.
 */
export function wasShared(value: unknown): boolean {
  return value !== null && value !== undefined;
}
