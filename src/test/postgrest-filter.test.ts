import { describe, it, expect } from 'vitest';
import { clinicianShareFilter, quoteFilterValue } from '@/lib/postgrest-filter';

/**
 * A small stand-in for how PostgREST splits an `or=(...)` value: top-level
 * commas separate conditions, a double-quoted run is one token and a backslash
 * escapes the next character inside it.
 */
function splitConditions(filter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < filter.length; i++) {
    const c = filter[i];
    if (quoted) {
      cur += c;
      if (c === '\\') cur += filter[++i];
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

describe('quoteFilterValue', () => {
  it('wraps the value in double quotes', () => {
    expect(quoteFilterValue('a@b.com')).toBe('"a@b.com"');
  });
  it('escapes embedded quotes and backslashes', () => {
    expect(quoteFilterValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe('clinicianShareFilter', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('is two conditions for an ordinary email', () => {
    expect(splitConditions(clinicianShareFilter(id, 'dr@clinic.com'))).toHaveLength(2);
  });

  it('keeps an email with commas and parentheses as one value', () => {
    const email = 'x@y.com,clinician_user_id.neq.0),or(a.eq.b@z.com';
    const parts = splitConditions(clinicianShareFilter(id, email));
    expect(parts).toHaveLength(2);
    expect(parts[1]).toBe(`provider_email.eq.${quoteFilterValue(email)}`);
  });

  it('cannot be closed early by a quote in the email', () => {
    const email = 'a"),clinician_user_id.not.is.null,provider_email.eq."b';
    expect(splitConditions(clinicianShareFilter(id, email))).toHaveLength(2);
  });

  it('drops the email condition when there is no email', () => {
    expect(splitConditions(clinicianShareFilter(id, undefined))).toEqual([
      `clinician_user_id.eq."${id}"`,
    ]);
    expect(splitConditions(clinicianShareFilter(id, ''))).toHaveLength(1);
  });
});
