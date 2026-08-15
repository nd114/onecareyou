import { describe, it, expect } from 'vitest';
import { parseStaffCsv } from '@/lib/staff-csv';

describe('parseStaffCsv', () => {
  it('reads a plain export with a header row', () => {
    const { entries, skipped } = parseStaffCsv(
      ['email,name,role', 'ada@lmc.org,Dr Ada Obi,clinician', 'ben@lmc.org,Nurse Ben,nurse'].join(
        '\n',
      ),
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ email: 'ada@lmc.org', name: 'Dr Ada Obi', role: 'clinician' });
    expect(entries[1].role).toBe('nurse');
    // The header row carries no email, so it is counted as skipped, not imported.
    expect(skipped).toBe(1);
  });

  it('does not depend on column order', () => {
    const { entries } = parseStaffCsv('Dr Ada Obi,clinician,ada@lmc.org');
    expect(entries[0]).toEqual({ email: 'ada@lmc.org', name: 'Dr Ada Obi', role: 'clinician' });
  });

  it('handles quoted fields containing commas', () => {
    const { entries } = parseStaffCsv('"Obi, Ada",ada@lmc.org');
    expect(entries[0].email).toBe('ada@lmc.org');
    expect(entries[0].name).toBe('Obi, Ada');
  });

  it('accepts semicolon and tab separated exports', () => {
    expect(parseStaffCsv('ada@lmc.org;Dr Ada').entries[0].name).toBe('Dr Ada');
    expect(parseStaffCsv('ada@lmc.org\tDr Ada').entries[0].name).toBe('Dr Ada');
  });

  it('lowercases addresses and drops duplicates', () => {
    const { entries } = parseStaffCsv(['ADA@LMC.ORG', 'ada@lmc.org'].join('\n'));
    expect(entries).toHaveLength(1);
    expect(entries[0].email).toBe('ada@lmc.org');
  });

  it('counts rows with no usable email instead of importing them', () => {
    const { entries, skipped } = parseStaffCsv(
      ['ada@lmc.org', 'not-an-email', 'someone,,,', ''].join('\n'),
    );
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('falls back to no role rather than guessing an unknown one', () => {
    const { entries } = parseStaffCsv('ada@lmc.org,Dr Ada,Consultant Anaesthetist');
    expect(entries[0].role).toBeUndefined();
    expect(entries[0].name).toBe('Dr Ada');
  });
});
