export type PasswordBand = 'too-short' | 'weak' | 'fair' | 'strong';

export interface PasswordAssessment {
  band: PasswordBand;
  /** 0–3, for a meter. */
  score: number;
  /** What would help, said as one thing to do next. */
  hint: string;
}

const MIN = 8;

/**
 * How good a password is, and the one thing that would improve it.
 *
 * The form only told you the rule after you pressed the button, and the
 * placeholder that said "minimum 8 characters" disappeared the moment you
 * started typing. This is not a security oracle — the real check is the
 * schema, and length matters more than any character-class rule — it just
 * answers "is this enough yet" while there is still time to change it.
 */
export function passwordStrength(password: string): PasswordAssessment {
  const value = password ?? '';

  if (value.length === 0) {
    return { band: 'too-short', score: 0, hint: `At least ${MIN} characters.` };
  }
  if (value.length < MIN) {
    const missing = MIN - value.length;
    return {
      band: 'too-short',
      score: 0,
      hint: `${missing} more character${missing === 1 ? '' : 's'} to go.`,
    };
  }

  const classes =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/\d/.test(value)) +
    Number(/[^A-Za-z0-9]/.test(value));

  // Length does most of the work: a long passphrase of plain words beats a
  // short one with a symbol bolted on.
  if (value.length >= 16 || (value.length >= 12 && classes >= 3)) {
    return { band: 'strong', score: 3, hint: 'Strong.' };
  }
  if (value.length >= 12 || classes >= 3) {
    return { band: 'fair', score: 2, hint: 'Fine. A longer one would be better.' };
  }
  return {
    band: 'weak',
    score: 1,
    hint: 'This will work, but a few more words would be much harder to guess.',
  };
}
