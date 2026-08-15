/**
 * Parsing for a hospital's staff export, pasted into the allowlist importer.
 *
 * Deliberately forgiving about shape and strict about email: hospital exports
 * arrive with different column orders, stray quotes and a header row that may
 * or may not be there. The only thing we cannot guess is the address.
 */

export interface StaffCsvEntry {
  email: string;
  name?: string;
  role?: string;
  note?: string;
}

export interface StaffCsvResult {
  entries: StaffCsvEntry[];
  /** Rows that carried no usable email address. */
  skipped: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Roles a hospital may name in an import; anything else falls back to clinician. */
const KNOWN_ROLES = new Set([
  'clinician',
  'nurse',
  'provider',
  'front_desk',
  'billing',
  'read_only',
  'sub_admin',
  'admin',
]);

function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseStaffCsv(input: string): StaffCsvResult {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: StaffCsvEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const line of lines) {
    const cells = splitRow(line);

    // Find the email wherever it sits, rather than trusting column order. A
    // header row has no valid email in it and drops out here for free.
    const emailCell = cells.find((c) => EMAIL.test(c.toLowerCase()));
    if (!emailCell) {
      skipped += 1;
      continue;
    }

    const email = emailCell.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    const others = cells.filter((c) => c !== emailCell && c.length > 0);
    const roleCell = others.find((c) => KNOWN_ROLES.has(c.toLowerCase().replace(/[\s-]/g, '_')));
    const name = others.find((c) => c !== roleCell);

    entries.push({
      email,
      name,
      role: roleCell ? roleCell.toLowerCase().replace(/[\s-]/g, '_') : undefined,
    });
  }

  return { entries, skipped };
}
