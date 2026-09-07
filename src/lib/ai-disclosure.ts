/**
 * What the app says about its own assistant, in one place.
 *
 * The wording existed in two forms and neither was a guarantee. One sat in the
 * chat's *empty state*, so it vanished the moment a conversation started — it
 * was on screen exactly while there was nothing to disclaim, and gone for every
 * answer. The other was an instruction in the system prompt telling the model to
 * end clinical replies with a warning, which makes the disclosure a thing the
 * model remembers rather than a thing the product does. A model that classifies
 * a reply as non-clinical, or simply drops the line, ships an unlabelled medical
 * answer.
 *
 * So this is stated by the app, on every turn, whatever the model returns.
 */

/** Under the composer, always. Short enough to live there permanently. */
export const AI_DISCLOSURE =
  'Answers are AI-generated and may be wrong. This is general information, not medical advice — check anything about your health with a licensed practitioner.';

/** On a reply that quoted a drug label or an interaction check. */
export const AI_CLINICAL_NOTICE =
  'AI-generated from the sources above. Not medical advice — talk to your doctor or pharmacist before acting on it.';

/** The clinician-facing wording: same duty, different reader. */
export const AI_CLINICIAN_DISCLOSURE =
  'AI-generated and may be wrong. Clinical decisions, and everything written to a record, remain yours.';

/**
 * The model is also asked to sign off clinical replies, and usually does. Two
 * disclaimers stacked reads as boilerplate and gets skipped, which defeats
 * both — so the model's copy comes out and the app's stands.
 */
const MODEL_SIGNOFFS = [
  /⚠️\s*General information,? not medical advice[^\n]*/gi,
  /^\s*⚠️[^\n]*not medical advice[^\n]*$/gim,
];

export function stripModelDisclaimer(content: string): string {
  let out = content;
  for (const pattern of MODEL_SIGNOFFS) out = out.replace(pattern, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
