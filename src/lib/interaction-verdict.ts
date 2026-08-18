/**
 * One verdict from two interaction sources.
 *
 * Found in review: the medications page rendered the NIH RxNorm checker and the
 * offline reference as separate panels, so a patient could read "No
 * interactions found — your medications appear safe to take together" directly
 * above a Lisinopril + Metformin warning from the other panel.
 *
 * Two panels cannot disagree if there is only one verdict. The rule that
 * governs this file: **the app never says "safe" while any source disagrees.**
 * Silence from one source is not evidence of safety — RxNorm being unreachable
 * is not a clean bill of health, and the offline table is small enough that its
 * silence means very little on its own.
 */
import { DrugInteraction } from '@/hooks/useDrugInteractions';
import { OfflineInteraction } from '@/lib/offline-interactions';

export type InteractionSource = 'rxnorm' | 'offline';

export interface MergedInteraction {
  drug1: string;
  drug2: string;
  severity: 'high' | 'moderate' | 'low';
  description: string;
  /** Present on offline entries; RxNorm does not supply one. */
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
  /** True when RxNorm could not be reached, so the verdict rests on the offline table alone. */
  isPartial: boolean;
}

const SEVERITY_ORDER = { high: 0, moderate: 1, low: 2 } as const;

/** Same pair of drugs regardless of which way round they are named. */
function pairKey(a: string, b: string): string {
  return [a.toLowerCase().trim(), b.toLowerCase().trim()].sort().join('|');
}

export function buildInteractionVerdict(params: {
  rxnorm: DrugInteraction[];
  offline: OfflineInteraction[];
  /** The RxNorm lookup finished (successfully or not). */
  rxnormChecked: boolean;
  /** The RxNorm lookup failed, so its silence means nothing. */
  rxnormFailed: boolean;
}): InteractionVerdict {
  const { rxnorm, offline, rxnormChecked, rxnormFailed } = params;

  const merged: MergedInteraction[] = rxnorm.map((i) => ({
    drug1: i.drug1,
    drug2: i.drug2,
    severity: i.severity,
    description: i.description,
    source: 'rxnorm' as const,
    sourceLabel: i.source || 'NIH RxNorm',
    sourceUrl: i.sourceUrl,
  }));

  // Add offline entries the live source did not already report, so the same
  // pair is not shown twice. RxNorm wins on wording where both have it.
  const seen = new Set(merged.map((i) => pairKey(i.drug1, i.drug2)));
  for (const entry of offline) {
    const key = pairKey(entry.med1Name, entry.med2Name);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      drug1: entry.med1Name,
      drug2: entry.med2Name,
      severity: entry.severity,
      description: entry.description,
      recommendation: entry.recommendation,
      source: 'offline',
      sourceLabel: 'Offline reference',
    });
  }

  merged.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    interactions: merged,
    counts: {
      high: merged.filter((i) => i.severity === 'high').length,
      moderate: merged.filter((i) => i.severity === 'moderate').length,
      low: merged.filter((i) => i.severity === 'low').length,
    },
    isClear: merged.length === 0 && rxnormChecked && !rxnormFailed,
    isPartial: rxnormFailed,
  };
}
