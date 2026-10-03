/**
 * PostgREST `.or()` and `.and()` take a string they parse themselves: commas
 * separate conditions, parentheses group, and dots separate column, operator
 * and value. A value built into that string from user data (an email address
 * is a legal place for commas, parentheses and quotes) can therefore end one
 * condition and begin another. Quote every dynamic value with this before it
 * goes into such a string. Plain `.eq()` / `.in()` calls do not need it; their
 * values are sent as separate, encoded query parameters.
 */
export function quoteFilterValue(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** `column.eq."value"`, safe for any value. */
export function eqCondition(column: string, value: string): string {
  return `${column}.eq.${quoteFilterValue(value)}`;
}

/** A clinician's own shares: claimed by id, or still addressed to their email. */
export function clinicianShareFilter(clinicianId: string, clinicianEmail: string | null | undefined): string {
  const parts = [eqCondition('clinician_user_id', clinicianId)];
  if (clinicianEmail) parts.push(eqCondition('provider_email', clinicianEmail));
  return parts.join(',');
}
