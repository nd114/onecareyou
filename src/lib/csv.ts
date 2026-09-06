/**
 * CSV that a spreadsheet reads back as what we meant.
 *
 * Three exports each built their own, and two of them escaped cells with
 * JSON.stringify. That is close enough to look right and wrong in two ways: a
 * quote inside a value comes out as \" where CSV wants "", so the field ends
 * early and every column after it shifts; and a newline comes out as the two
 * characters backslash-n rather than a real newline inside quotes, so a note
 * written across two lines arrives as one line with visible escape codes.
 *
 * The audit log and the compliance pack are the two that carry free text — a
 * clinician's name, a patient's name, an action description — and the
 * compliance pack is the one that goes to a reviewer.
 */

/** One cell, quoted and escaped the way RFC 4180 asks. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = typeof value === 'string' ? value : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * A header row plus one row per record, in the header's column order.
 *
 * Headers are plain strings rather than keys of T: callers export interfaces
 * with no index signature, and requiring one would push the cast into every
 * call site instead of keeping it here where it is explained.
 */
export function toCsv(rows: readonly object[], headers: readonly string[]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(headers.map((h) => csvCell(record[h])).join(','));
  }
  return lines.join('\n');
}
