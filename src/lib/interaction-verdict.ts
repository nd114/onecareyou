/**
 * One verdict from two interaction sources.
 *
 * Found in review: the medications page rendered the NIH RxNorm checker and the
 * offline reference as separate panels, so a patient could read "No
 * interactions found — your medications appear safe to take together" directly
 * above a Lisinopril + Metformin warning from the other panel.
 *
 * Two panels cannot disagree if there is only one verdict. The rule that
 * governs it: **the app never says "safe" while any source disagrees.** Silence
 * from one source is not evidence of safety — RxNorm being unreachable is not a
 * clean bill of health, and the offline table is small enough that its silence
 * means very little on its own.
 *
 * The merge itself now lives in `_shared/medication-knowledge.ts`, because the
 * patient assistant answers the same question and had been answering it from
 * somewhere else entirely. This file is the client's door onto it.
 */
import { DrugInteraction } from '@/hooks/useDrugInteractions';
import { OfflineInteraction } from '@/lib/offline-interactions';
import {
  buildInteractionVerdict as buildVerdict,
  type InteractionSource,
  type InteractionVerdict,
  type MergedInteraction,
} from '../../supabase/functions/_shared/medication-knowledge';

export type { InteractionSource, InteractionVerdict, MergedInteraction };

export function buildInteractionVerdict(params: {
  rxnorm: DrugInteraction[];
  offline: OfflineInteraction[];
  /** The RxNorm lookup finished (successfully or not). */
  rxnormChecked: boolean;
  /** The RxNorm lookup failed, so its silence means nothing. */
  rxnormFailed: boolean;
}): InteractionVerdict {
  return buildVerdict({
    rxnorm: params.rxnorm,
    reference: params.offline,
    rxnormChecked: params.rxnormChecked,
    rxnormFailed: params.rxnormFailed,
  });
}
