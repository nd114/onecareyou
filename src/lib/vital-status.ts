export type VitalStatus = 'normal' | 'high' | 'low';

/**
 * Where a reading sits against its normal band — or nothing, when there is no
 * claim to make.
 *
 * The card used to compute this as `latestVital ? classify(...) : 'normal'`
 * and then render the badge unconditionally, so a measurement you have never
 * taken showed a dash for the value and a green "normal" beside it. In a
 * health app that reads as "we checked, and you are fine". Weight had the same
 * problem from the other direction: its band is the 0–999 sentinel, so every
 * weight ever recorded came back "normal", which is not a finding either.
 *
 * Null means say nothing.
 */
export function vitalStatus(
  converted: number | null | undefined,
  range: { min: number; max: number },
  hasBand: boolean,
): VitalStatus | null {
  if (!hasBand) return null;
  if (converted === null || converted === undefined || Number.isNaN(converted)) return null;
  if (converted < range.min) return 'low';
  if (converted > range.max) return 'high';
  return 'normal';
}
