/**
 * Structural checks for a patient import file.
 *
 * The importer used to accept whatever it was given: a ragged file — rows with
 * more or fewer fields than the header, which is what a spreadsheet produces
 * when a cell contains an unescaped comma — parsed without complaint, and the
 * misalignment showed up as data in the wrong columns. A phone number filed as
 * a date of birth is not obviously wrong on screen, and by the time anyone
 * notices, the records exist.
 *
 * So the file is rejected as a whole before any of it is offered for import.
 * Per-row problems (a missing name, a malformed email) are different: those are
 * about one record and are reported alongside it, not treated as a reason to
 * refuse the file.
 */

export interface CsvStructureProblem {
  /** 1-indexed line in the file, as a spreadsheet would number it. */
  line?: number;
  message: string;
}

/**
 * One shape rather than a discriminated union: this project compiles with
 * strictNullChecks off, where narrowing on a literal discriminant is not
 * reliable, and a result type that needs a compiler feature the project has
 * disabled is a trap for the next caller.
 */
export interface CsvStructureResult {
  ok: boolean;
  headers: string[];
  dataLines: string[][];
  problems: CsvStructureProblem[];
}

/** Splits one CSV line, honouring double-quoted fields containing commas. */
export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

const NAME_HEADERS = ['name', 'patient', 'full name', 'surname', 'first'];

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

export function validateCsvStructure(text: string): CsvStructureResult {
  const problems: CsvStructureProblem[] = [];
  const lines = text.split(/\r?\n/);

  // Keep the original line numbers so a message can point at the file the
  // person is looking at, not at some internal index.
  const numbered = lines
    .map((content, index) => ({ content, line: index + 1 }))
    .filter((entry) => entry.content.trim() !== '');

  const fail = (found: CsvStructureProblem[]): CsvStructureResult => ({
    ok: false, headers: [], dataLines: [], problems: found,
  });

  if (numbered.length === 0) return fail([{ message: 'The file is empty.' }]);
  if (numbered.length === 1) {
    return fail([{ message: 'The file has a header row but no patients under it.' }]);
  }

  const headers = parseCsvLine(numbered[0].content).map(normaliseHeader);
  const expected = headers.length;

  if (!headers.some((h) => h && NAME_HEADERS.some((candidate) => h.includes(candidate)))) {
    problems.push({
      line: numbered[0].line,
      message:
        'No column holding the patient name. Add a "Name" column — it is the one field every row must have.',
    });
  }

  if (headers.some((h) => h === '')) {
    problems.push({
      line: numbered[0].line,
      message: 'One of the columns has no heading. Every column needs a name.',
    });
  }

  const dataLines: string[][] = [];
  for (const entry of numbered.slice(1)) {
    const values = parseCsvLine(entry.content);
    if (values.length !== expected) {
      problems.push({
        line: entry.line,
        message:
          `Has ${values.length} ${values.length === 1 ? 'field' : 'fields'} where the header has ` +
          `${expected}. Usually a comma inside a value that is not wrapped in quotes.`,
      });
      continue;
    }
    dataLines.push(values);
  }

  // Report at most a handful: a file where every line is ragged produces one
  // problem per line, and a wall of them tells the reader nothing extra.
  if (problems.length > 6) {
    const shown = problems.slice(0, 6);
    shown.push({ message: `…and ${problems.length - 6} more rows with the same kind of problem.` });
    return fail(shown);
  }

  if (problems.length > 0) return fail(problems);
  if (dataLines.length === 0) return fail([{ message: 'No usable rows in the file.' }]);

  return { ok: true, headers, dataLines, problems: [] };
}
