/**
 * Finding things by typing.
 *
 * There were fifty-four `toLowerCase().includes(query)` filters in this
 * codebase and one server-side `ilike`. Substring matching is not search, and
 * the ways it fails are not edge cases here:
 *
 *   - **Accents.** "Jose" does not find "José". Neither does "Muller" find
 *     "Müller". On a platform used across countries this is most of the point.
 *   - **Punctuation.** "OConnor" does not find "O'Connor"; "co-codamol" does
 *     not find "cocodamol".
 *   - **Word order.** "pressure blood" finds nothing, and neither does
 *     "amlodipine 5mg" when the row says "5mg amlodipine".
 *   - **Typos.** "amlodipin" finds nothing at all, which is the failure people
 *     actually hit, because drug names are long and unfamiliar.
 *   - **Ranking.** An exact match sorts below a coincidental substring, so the
 *     thing you searched for is not first.
 *
 * This module is the client-side half — for lists already in memory, where a
 * round trip would be absurd. The server-side half is `search_patients`,
 * `search_medications` and `search_documents`, which use pg_trgm for lists too
 * large to hold, and are the ones that matter at a hospital.
 *
 * Nothing here decides access. A search that finds a row somebody may not read
 * is a leak wearing a helpful face, so the server functions are SECURITY
 * INVOKER and this one only ever filters what the caller already has.
 */

/**
 * Strip a string down to what somebody meant to type.
 *
 * Decomposes accents rather than transliterating: NFD splits "é" into "e" plus
 * a combining mark, and dropping the marks leaves "e". That handles every
 * Latin script the same way without a lookup table of special cases.
 */
export function normaliseForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Apostrophes and hyphens close up — "O'Connor" becomes "oconnor" — so a
    // name typed without them still matches. Everything else becomes a space,
    // so "5mg/dose" splits into terms rather than one unsearchable token.
    .replace(/['’‘’-]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The words somebody typed, in no particular order. */
export function searchTerms(query: string): string[] {
  const normalised = normaliseForSearch(query);
  return normalised ? normalised.split(" ").filter(Boolean) : [];
}

/**
 * How close two strings are, 0 to 1.
 *
 * Trigram overlap — the same measure `pg_trgm` uses server-side, so a result
 * ranked here and one ranked there are ranked comparably. Deliberately not
 * Levenshtein: edit distance says "cat" and "cot" are as close as "hat" and
 * "hot", but says almost nothing useful about two long drug names sharing a
 * stem.
 */
export function similarity(a: string, b: string): number {
  const left = trigrams(normaliseForSearch(a));
  const right = trigrams(normaliseForSearch(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared++;
  return shared / (left.size + right.size - shared);
}

function trigrams(value: string): Set<string> {
  const out = new Set<string>();
  // Pad the way pg_trgm does, so the start and end of a word count. Without
  // this "amlo" scores poorly against "amlodipine" despite being its opening.
  for (const word of value.split(" ").filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

export interface SearchMatch<T> {
  item: T;
  /** Higher is better. Only meaningful relative to other results for one query. */
  score: number;
}

export interface SearchOptions {
  /**
   * Below this, a fuzzy match is noise rather than a suggestion. 0.3 is
   * pg_trgm's own default and it holds up: "amlodipin" scores about 0.8
   * against "amlodipine", and an unrelated word rarely clears 0.2.
   */
  threshold?: number;
  /** Cap on results, applied after ranking so the best survive. */
  limit?: number;
}

const DEFAULT_THRESHOLD = 0.3;

/**
 * Below the matching threshold, and deliberately not far below: a suggestion
 * nobody recognises sends somebody hunting for a thing that was never there,
 * which is worse than an empty list honestly reported.
 */
const SUGGEST_THRESHOLD = 0.17;

/**
 * Search a list already in memory.
 *
 * `fields` returns the strings worth matching against, most important first —
 * a hit in the first field outranks a hit in the last, so a medication whose
 * *name* matches beats one that merely mentions the word in its instructions.
 */
export function searchItems<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
  options: SearchOptions = {},
): SearchMatch<T>[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return items.map((item) => ({ item, score: 0 }));

  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const matches: SearchMatch<T>[] = [];

  for (const item of items) {
    const values = fields(item).filter((v): v is string => Boolean(v && v.trim()));
    const score = scoreItem(values, terms, threshold);
    if (score > 0) matches.push({ item, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return options.limit ? matches.slice(0, options.limit) : matches;
}

/** Just the items, for the common case of replacing a `.filter()`. */
export function search<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
  options: SearchOptions = {},
): T[] {
  return searchItems(items, query, fields, options).map((m) => m.item);
}

/**
 * Every term has to land somewhere, which is what makes multi-word search
 * mean "and" rather than "or". Typing two words should narrow the list.
 */
function scoreItem(values: string[], terms: string[], threshold: number): number {
  let total = 0;
  for (const term of terms) {
    const best = bestTermScore(values, term, threshold);
    if (best === 0) return 0;
    total += best;
  }
  return total / terms.length;
}

function bestTermScore(values: string[], term: string, threshold: number): number {
  let best = 0;
  for (let index = 0; index < values.length; index++) {
    // Later fields are worth less, so a name match outranks a notes match.
    const weight = 1 / (1 + index * 0.35);
    const normalised = normaliseForSearch(values[index]);
    if (!normalised) continue;

    const words = normalised.split(" ");
    let raw = 0;
    if (normalised === term) raw = 1;
    else if (words.includes(term)) raw = 0.95;
    else if (words.some((w) => w.startsWith(term))) raw = 0.85;
    else if (normalised.includes(term)) raw = 0.7;
    else {
      // Only now fall back to fuzziness, so an exact substring is never beaten
      // by a coincidental trigram overlap.
      const fuzzy = Math.max(...words.map((w) => similarity(w, term)), 0);
      if (fuzzy >= threshold) raw = fuzzy * 0.6;
    }

    best = Math.max(best, raw * weight);
  }
  return best;
}

/**
 * "Did you mean …?"
 *
 * Only offered when the search found nothing and something was close, which is
 * the only moment the question helps. Offering a correction alongside results
 * teaches people to distrust the results.
 *
 * ## The suggestion threshold has to be *below* the matching one
 *
 * The first version of this used a higher bar for suggesting than for
 * matching, on the reasoning that a wrong suggestion is worse than none. That
 * makes the band empty by construction: anything scoring above the matching
 * threshold has already been found, so the suggestion never fires. Caught by a
 * test that expected a suggestion for a typo the fuzzy matcher was in fact
 * finding.
 *
 * So the band sits under the matcher: close enough to be recognisably the same
 * word badly typed, not close enough to have been returned as a result.
 */
export function didYouMean<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
  options: SearchOptions = {},
): string | null {
  const terms = searchTerms(query);
  if (terms.length === 0) return null;
  if (searchItems(items, query, fields, options).length > 0) return null;

  // A suggestion has to be a real, whole value from the list — offering a
  // reconstructed phrase nobody has would send somebody hunting for a thing
  // that does not exist.
  const flat = normaliseForSearch(query);
  let best: { value: string; score: number } | null = null;
  for (const item of items) {
    for (const value of fields(item)) {
      if (!value?.trim()) continue;
      const score = similarity(value, flat);
      if (score > (best?.score ?? 0)) best = { value: value.trim(), score };
    }
  }

  return best && best.score >= SUGGEST_THRESHOLD ? best.value : null;
}
