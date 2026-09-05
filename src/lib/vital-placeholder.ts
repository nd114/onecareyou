import { hasNormalRange } from '@/types/health';

/**
 * What to put in an empty measurement box.
 *
 * The example used to be the normal band — "e.g., 60-100" for a heart rate,
 * which reads well. For weight the band is the 0–999 sentinel, so the box
 * said "e.g., 0-999", which is not an example of anything.
 */
export function vitalPlaceholder(
  type: string,
  hasBloodPressureSecondary: boolean,
  range: { min: number; max: number; unit: string },
): string {
  if (hasBloodPressureSecondary) return 'Systolic (e.g., 120)';
  if (hasNormalRange(type)) return `e.g., ${range.min}-${range.max}`;
  return range.unit ? `Value in ${range.unit}` : 'Value';
}
