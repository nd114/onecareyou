/**
 * Offline drug-interaction reference — the client's view of it.
 *
 * The table itself moved to `supabase/functions/_shared/medication-knowledge.ts`
 * so the patient assistant reads the same rows this page does. It used to live
 * here alone, which meant the assistant answering "can I take ibuprofen with my
 * lisinopril?" was answering from the model's own memory while the medications
 * page answered from this table — the two-panels-disagree bug the verdict was
 * built to end, with a chat window around it.
 *
 * What stays here is the part that needs the app's own `Medication` type.
 */
import { Medication } from '@/hooks/useMedications';
import {
  INTERACTION_REFERENCE,
  referenceInteractionsFor,
  type InteractionInfo,
  type ReferenceHit,
} from '../../supabase/functions/_shared/medication-knowledge';

export type { InteractionInfo };

/** @deprecated Use `INTERACTION_REFERENCE`; kept so older imports still resolve. */
export const INTERACTION_DATABASE = INTERACTION_REFERENCE;

export type OfflineInteraction = ReferenceHit;

/**
 * Every pair of active medications that appears in the reference table.
 *
 * Only active medications are considered — the RxNorm check already works that
 * way, and a stopped medication raising a warning the other source cannot see
 * was part of why the two panels disagreed.
 */
export function findOfflineInteractions(medications: Medication[]): OfflineInteraction[] {
  return referenceInteractionsFor(
    medications.filter((m) => m.is_active).map((m) => m.name),
  );
}
