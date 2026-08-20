import { describe, it, expect } from 'vitest';
import { parseCsvLine, validateCsvStructure } from '@/lib/import-csv';

const GOOD = 'Name,Email,Date of Birth\nJames Thompson,james@example.com,1967-03-15\nAmara Okafor,amara@example.com,1980-07-02';

describe('patient import file structure', () => {
  it('accepts a well-formed file', () => {
    const result = validateCsvStructure(GOOD);
    expect(result.ok).toBe(true);
    expect(result.headers).toEqual(['name', 'email', 'date of birth']);
    expect(result.dataLines).toHaveLength(2);
  });

  it('rejects a ragged row rather than importing it misaligned', () => {
    // An unescaped comma inside a value: the classic spreadsheet export fault.
    // Accepting this files the phone number as a date of birth.
    const ragged = 'Name,Email,Notes\nJames Thompson,james@example.com,Diabetic, on metformin';
    const result = validateCsvStructure(ragged);
    expect(result.ok).toBe(false);
    expect(result.problems[0].line).toBe(2);
    expect(result.problems[0].message).toMatch(/4 fields where the header has 3/);
  });

  it('accepts the same value when it is quoted properly', () => {
    const quoted = 'Name,Email,Notes\nJames Thompson,james@example.com,"Diabetic, on metformin"';
    const result = validateCsvStructure(quoted);
    expect(result.ok).toBe(true);
    expect(result.dataLines[0][2]).toBe('Diabetic, on metformin');
  });

  it('refuses a file with no name column', () => {
    const result = validateCsvStructure('Email,Phone\nx@example.com,123');
    expect(result.ok).toBe(false);
    expect(result.problems[0].message).toMatch(/patient name/i);
  });

  it('refuses a header row with nothing under it', () => {
    const result = validateCsvStructure('Name,Email');
    expect(result.ok).toBe(false);
    expect(result.problems[0].message).toMatch(/no patients/i);
  });

  it('refuses an empty file', () => {
    expect(validateCsvStructure('   \n  ').ok).toBe(false);
  });

  it('refuses a column with no heading', () => {
    const result = validateCsvStructure('Name,,Email\nJames,x,james@example.com');
    expect(result.ok).toBe(false);
    expect(result.problems.some(p => /no heading/i.test(p.message))).toBe(true);
  });

  it('reports line numbers as the spreadsheet shows them, blank lines included', () => {
    const withBlank = 'Name,Email\n\nJames,james@example.com,extra';
    const result = validateCsvStructure(withBlank);
    expect(result.ok).toBe(false);
    expect(result.problems[0].line).toBe(3);
  });

  it('does not drown the reader when every row is ragged', () => {
    const many = ['Name,Email', ...Array.from({ length: 40 }, (_, i) => `P${i},a@b.c,extra`)].join('\n');
    const result = validateCsvStructure(many);
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeLessThanOrEqual(7);
    expect(result.problems[result.problems.length - 1].message).toMatch(/more rows/);
  });

  it('handles escaped quotes inside a quoted field', () => {
    expect(parseCsvLine('a,"he said ""hi""",c')).toEqual(['a', 'he said "hi"', 'c']);
  });
});
