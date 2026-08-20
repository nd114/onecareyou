/**
 * Turn a failed anonymous submission into something worth reading.
 *
 * The public forms caught every failure and said "There was an error, please
 * try again" — which is wrong advice for the one failure a visitor is most
 * likely to hit. A throttled submission fails *because* of trying again, and
 * the database already returns a sentence written for the person reading it
 * (see 20260820130000). This surfaces that sentence and leaves everything else
 * with the generic message, which is honest about not knowing.
 */

/** Postgres raise_exception. Our rate-limit triggers use it deliberately. */
const RAISED_BY_A_TRIGGER = "P0001";

export interface SubmissionFailure {
  message: string;
  /** True when waiting is the fix, so the caller can soften the tone. */
  isRateLimited: boolean;
}

export function describeSubmissionError(
  error: unknown,
  fallback: string,
): SubmissionFailure {
  const e = error as { code?: string; message?: string } | null;
  const message = typeof e?.message === "string" ? e.message.trim() : "";

  // Only messages our own triggers wrote are shown. Anything else could carry
  // column names or constraint text, which is noise to a visitor and detail we
  // would rather not publish.
  if (e?.code === RAISED_BY_A_TRIGGER && message) {
    return { message, isRateLimited: true };
  }

  return { message: fallback, isRateLimited: false };
}
