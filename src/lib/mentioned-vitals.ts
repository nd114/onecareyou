import { resolveVitalConfig, resolveVitalType } from "@/types/health";

export interface MentionedVital {
  type?: string;
  value?: string;
  note?: string;
}

export interface ParsedVital {
  type: string;
  label: string;
  value: number;
  secondaryValue: number | null;
  unit: string;
}

/**
 * Turn a vital the scribe heard into something recordable.
 *
 * The scribe returns what it heard as loose text — "128/82", "128 over 82",
 * "72 bpm", "98.6" — because that is what was said. Anything that does not
 * resolve to a number returns null and is offered as text the clinician can
 * act on themselves, rather than being guessed into the chart.
 */
export function parseMentionedVital(v: MentionedVital): ParsedVital | null {
  if (!v.type || !v.value) return null;

  const type = resolveVitalType(v.type);
  const config = resolveVitalConfig(v.type);
  const raw = String(v.value).trim();

  // Systolic/diastolic, said either way round: "128/82" and "128 over 82".
  const paired = raw.match(/^(-?\d+(?:\.\d+)?)\s*(?:\/|over)\s*(-?\d+(?:\.\d+)?)/i);
  if (paired) {
    const systolic = Number(paired[1]);
    const diastolic = Number(paired[2]);
    if (!isFinite(systolic) || !isFinite(diastolic)) return null;
    return {
      type,
      label: config.label,
      value: systolic,
      secondaryValue: diastolic,
      unit: unitFrom(raw, config.unit),
    };
  }

  const single = raw.match(/-?\d+(?:\.\d+)?/);
  if (!single) return null;
  const value = Number(single[0]);
  if (!isFinite(value)) return null;

  // A blood pressure with only one number is not a blood pressure. Recording
  // the systolic alone would read as a complete measurement later.
  if (type === "blood_pressure") return null;

  return { type, label: config.label, value, secondaryValue: null, unit: unitFrom(raw, config.unit) };
}

/** Prefer a unit that was actually said over the type's default. */
function unitFrom(raw: string, fallback: string): string {
  const said = raw.match(/(mmHg|bpm|kg|lbs?|mg\/dL|mmol\/L|%|°?[CF])\b/i);
  return said ? said[1] : fallback;
}
