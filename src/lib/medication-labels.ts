import type { MedicationType } from '@/types/health';

/**
 * How a medicine's type is written on screen.
 *
 * The stored values are lowercase keys — prescription, otc — and the cabinet
 * printed them raw, so a card read "prescription" in lower case next to a
 * frequency that read "Once Daily". Two casings on one row. The dropdown that
 * sets the value already had proper labels; it had them twice, once in the add
 * form and once in the edit form, and the list that displays them had neither.
 */
export const MEDICATION_TYPES: { value: MedicationType; label: string }[] = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'otc', label: 'Over-the-counter' },
  { value: 'vitamin', label: 'Vitamin' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'herbal', label: 'Herbal' },
];

const BY_VALUE = new Map(MEDICATION_TYPES.map((t) => [t.value as string, t.label]));

/** A label for a stored type, including one this build has never seen. */
export function medicationTypeLabel(type: string | null | undefined): string {
  const raw = (type ?? '').trim();
  if (!raw) return 'Medicine';
  return BY_VALUE.get(raw) ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}
