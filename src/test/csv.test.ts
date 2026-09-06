import { describe, it, expect } from 'vitest';
import { csvCell, toCsv } from '@/lib/csv';

describe('csvCell', () => {
  it('doubles a quote rather than backslash-escaping it', () => {
    // JSON.stringify produces \" here, which ends the field early and shifts
    // every column after it.
    expect(csvCell('Smith, "Bob"')).toBe('"Smith, ""Bob"""');
    expect(csvCell('Smith, "Bob"')).not.toContain('\\');
  });

  it('keeps a real newline inside the quotes', () => {
    const cell = csvCell('line one\nline two');
    expect(cell).toBe('"line one\nline two"');
    expect(cell).not.toContain('\\n');
  });

  it('quotes a comma without breaking the row', () => {
    expect(csvCell('one, two')).toBe('"one, two"');
  });

  it('writes an empty field for nothing at all', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell('')).toBe('""');
  });

  it('stringifies numbers, booleans and dates rather than dropping them', () => {
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(false)).toBe('"false"');
    expect(csvCell(12.5)).toBe('"12.5"');
  });
});

describe('toCsv', () => {
  const rows = [
    { name: 'Dr "A" Smith', action: 'record_access', note: 'saw\nthe chart' },
    { name: 'Nurse, B', action: 'update', note: null as string | null },
  ];

  it('writes a header row and one row per record', () => {
    const csv = toCsv(rows, ['name', 'action', 'note']);
    expect(csv.split('\n')[0]).toBe('"name","action","note"');
    // Three lines of header + data, plus the embedded newline in row one.
    expect(csv).toContain('"Dr ""A"" Smith"');
    expect(csv).toContain('"Nurse, B"');
  });

  it('keeps the column count stable even with quotes in the data', () => {
    // The failure this replaces: a quoted name split one row into more fields
    // than the header had, silently shifting the audit trail sideways.
    const csv = toCsv(rows, ['name', 'action']);
    const dataRow = csv.split('\n')[1];
    expect(dataRow.match(/","/g) ?? []).toHaveLength(1);
  });

  it('emits a header even with nothing to export', () => {
    expect(toCsv([], ['name'])).toBe('"name"');
  });
});
