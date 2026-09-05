/**
 * The name of an alert, as a person would write it.
 *
 * Alert types are stored the way the database wants them — threshold_breach,
 * missed_doses — and one screen printed that with the underscores swapped for
 * spaces, so the clinician's queue was a list of lowercase fragments while the
 * Alerts page beside it showed the same alerts properly capitalised.
 */
export function formatAlertType(type: string | null | undefined): string {
  const words = (type ?? '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  // "__" splits to nothing, which would have titled the row with an empty
  // string rather than falling back.
  return words.length > 0 ? words.join(' ') : 'Patient alert';
}
