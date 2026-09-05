import { describe, it, expect } from 'vitest';
import { passwordStrength } from '@/lib/password-strength';

describe('passwordStrength', () => {
  it('counts down to the minimum rather than just refusing', () => {
    expect(passwordStrength('abc').hint).toBe('5 more characters to go.');
    expect(passwordStrength('abcdefg').hint).toBe('1 more character to go.');
  });

  it('states the rule before anything is typed', () => {
    expect(passwordStrength('').hint).toBe('At least 8 characters.');
    expect(passwordStrength('').band).toBe('too-short');
  });

  it('never calls anything under the minimum acceptable', () => {
    for (const p of ['a', 'Aa1!', 'short12']) {
      expect(passwordStrength(p).band, p).toBe('too-short');
      expect(passwordStrength(p).score, p).toBe(0);
    }
  });

  it('rewards length over character-class trickery', () => {
    // Eight characters with every class going gets "fair"; sixteen plain
    // lowercase ones get "strong", which is the honest ordering.
    expect(passwordStrength('Aa1!bcde').band).toBe('fair');
    expect(passwordStrength('abcdefghijklmnop').band).toBe('strong');
    expect(passwordStrength('correct horse battery staple').band).toBe('strong');
  });

  it('grades the middle', () => {
    // Long enough, one class: works, could be better.
    expect(passwordStrength('abcdefgh').band).toBe('weak');
    expect(passwordStrength('abcdefghijkl').band).toBe('fair');
    expect(passwordStrength('Abcdefghijk1').band).toBe('strong');
  });

  it('gives a score a meter can draw', () => {
    for (const p of ['', 'abc', 'abcdefgh', 'abcdefghijkl', 'correct horse battery staple']) {
      const { score } = passwordStrength(p);
      expect(score, p).toBeGreaterThanOrEqual(0);
      expect(score, p).toBeLessThanOrEqual(3);
    }
  });
});
