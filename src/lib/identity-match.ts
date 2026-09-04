/**
 * Matching a record a clinic holds against the person it is about.
 *
 * Two ways someone ends up with records waiting for them:
 *
 *   1. The clinic added them before they joined — from a CSV, from their own
 *      system, or by typing them in. They sign up later and the record should
 *      find them.
 *   2. They joined first, and a clinic they already attend adds them
 *      afterwards. Same problem, opposite order.
 *
 * Today this is an exact email comparison and nothing else, which fails on a
 * typo, an old address, or a record that only ever had a phone number.
 *
 * **The asymmetry that shapes everything here.** A missed match is an
 * inconvenience: somebody does not see their records and asks why. A false
 * match hands one person's medical history to another. Those are not
 * comparable costs, so this module is deliberately reluctant:
 *
 *   - Only a verified, exact email address is strong enough to link on its own.
 *   - Everything else can *propose*, never conclude. A person confirms.
 *   - A proposal shows only enough to recognise, never clinical content —
 *     otherwise the proposal itself is the leak.
 *   - Ambiguity is refused rather than resolved. Two equally good candidates
 *     means neither is offered.
 */

export type MatchStrength = "exact" | "strong" | "weak" | "none";

export interface MatchSignals {
  email: boolean;
  phone: boolean;
  name: boolean;
  dateOfBirth: boolean;
}

export interface MatchCandidate {
  /** What the clinic holds. */
  recordId: string;
  strength: MatchStrength;
  signals: MatchSignals;
  /** Why, in words a person reads on the confirmation screen. */
  reasons: string[];
}

export interface PersonDetails {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  dateOfBirth?: string | null;
}

export interface ManagedRecordDetails extends PersonDetails {
  id: string;
}

// ---------------------------------------------------------------------------
// Normalising, which is where most false matches are actually made
// ---------------------------------------------------------------------------

/**
 * Lowercased and trimmed. Deliberately **not** clever: Gmail's dot-and-plus
 * rules are Gmail's, and applying them everywhere would make
 * `a.b@example.com` and `ab@example.com` the same person at a domain where
 * they are two people.
 */
export function normaliseEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

/**
 * Digits only, compared on the last nine.
 *
 * Country prefixes, spaces and brackets are written a dozen ways for the same
 * number. Nine digits is long enough that a collision needs deliberate effort
 * and short enough to survive `+234`, `0`, and `00234` spellings of one line.
 */
export function normalisePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/**
 * Case- and order-insensitive, punctuation removed.
 *
 * "Evans, Jane" and "jane evans" are the same person written by two systems.
 * Titles are dropped because a clinic's export often carries them and a
 * sign-up form never does.
 */
const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "sir", "madam", "mx"]);

export function normaliseName(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((part) => part.length > 0 && !TITLES.has(part));
  return parts.length > 0 ? [...parts].sort().join(" ") : null;
}

/** Date only, so a timestamp and a date compare equal. */
export function normaliseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Scoring one record against one person
// ---------------------------------------------------------------------------

/**
 * How confidently this record is about this person.
 *
 * - **exact**: the email matches. One signal, but the strongest one we hold,
 *   because the person proved control of that address when they signed up.
 * - **strong**: no email match, but the phone matches *and* so does either the
 *   name or the date of birth. Two independent signals.
 * - **weak**: one non-email signal, or name and date of birth without a phone.
 *   Enough to show someone and ask; never enough to act on.
 * - **none**: nothing worth showing.
 *
 * Name alone is never more than weak. Families share surnames and addresses,
 * and "John Smith" is not an identifier.
 */
export function scoreCandidate(
  record: ManagedRecordDetails,
  person: PersonDetails,
): MatchCandidate {
  const recordEmail = normaliseEmail(record.email);
  const personEmail = normaliseEmail(person.email);
  const recordPhone = normalisePhone(record.phone);
  const personPhone = normalisePhone(person.phone);
  const recordName = normaliseName(record.name);
  const personName = normaliseName(person.name);
  const recordDob = normaliseDate(record.dateOfBirth);
  const personDob = normaliseDate(person.dateOfBirth);

  const signals: MatchSignals = {
    email: Boolean(recordEmail && personEmail && recordEmail === personEmail),
    phone: Boolean(recordPhone && personPhone && recordPhone === personPhone),
    name: Boolean(recordName && personName && recordName === personName),
    dateOfBirth: Boolean(recordDob && personDob && recordDob === personDob),
  };

  const reasons: string[] = [];
  if (signals.email) reasons.push("The email address matches yours.");
  if (signals.phone) reasons.push("The phone number matches yours.");
  if (signals.name) reasons.push("The name matches yours.");
  if (signals.dateOfBirth) reasons.push("The date of birth matches yours.");

  let strength: MatchStrength = "none";
  if (signals.email) {
    strength = "exact";
  } else if (signals.phone && (signals.name || signals.dateOfBirth)) {
    strength = "strong";
  } else if (signals.phone || signals.dateOfBirth || (signals.name && signals.dateOfBirth)) {
    strength = "weak";
  } else if (signals.name) {
    // Name alone. Families share surnames; this is a prompt, not evidence.
    strength = "weak";
  }

  return { recordId: record.id, strength, signals, reasons };
}

// ---------------------------------------------------------------------------
// Choosing between candidates
// ---------------------------------------------------------------------------

const RANK: Record<MatchStrength, number> = { exact: 3, strong: 2, weak: 1, none: 0 };

export interface MatchOutcome {
  /** Safe to link without asking. Only ever an unambiguous exact email match. */
  autoLink: MatchCandidate | null;
  /** Show these and let the person confirm. Ordered strongest first. */
  propose: MatchCandidate[];
  /** Set when we found something but deliberately refused to choose. */
  ambiguous?: string;
}

/**
 * Decide what to do with a set of candidate records.
 *
 * Auto-linking happens only when exactly one record matches on email. Two
 * records with the same email is a data problem at the clinic, and resolving
 * it by picking one would resolve it in the worst possible direction.
 */
export function resolveMatches(
  records: ManagedRecordDetails[],
  person: PersonDetails,
): MatchOutcome {
  const scored = records
    .map((record) => scoreCandidate(record, person))
    .filter((candidate) => candidate.strength !== "none")
    .sort((a, b) => RANK[b.strength] - RANK[a.strength]);

  const exact = scored.filter((c) => c.strength === "exact");

  if (exact.length === 1) {
    return { autoLink: exact[0], propose: scored.filter((c) => c !== exact[0]) };
  }

  if (exact.length > 1) {
    return {
      autoLink: null,
      propose: scored,
      ambiguous:
        "More than one record uses this email address, so none was linked automatically. Choose the one that is yours.",
    };
  }

  return { autoLink: null, propose: scored };
}

// ---------------------------------------------------------------------------
// What a proposal is allowed to show
// ---------------------------------------------------------------------------

/**
 * The safe description of a record, for the screen that asks "is this you?".
 *
 * Nothing clinical. If the answer turns out to be no, everything shown has
 * already been shown to the wrong person, so a proposal may only contain what
 * that person supplied in the first place — and even the identifiers are
 * masked, so the screen confirms rather than reveals.
 */
export function safeDescriptor(record: ManagedRecordDetails): {
  name: string | null;
  email: string | null;
  phone: string | null;
} {
  return {
    name: record.name?.trim() || null,
    email: maskEmail(record.email),
    phone: maskPhone(record.phone),
  };
}

export function maskEmail(value: string | null | undefined): string | null {
  const email = normaliseEmail(value);
  if (!email) return null;
  const [local, domain] = email.split("@");
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

export function maskPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `${"•".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}
