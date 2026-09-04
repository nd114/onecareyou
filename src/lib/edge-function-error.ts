/**
 * The reason an edge function actually gave.
 *
 * `supabase.functions.invoke` throws a `FunctionsHttpError` for any non-2xx
 * response, and its message is the constant string "Edge Function returned a
 * non-2xx status code". Whatever the function wrote — "that recording is too
 * long to transcribe", "turn on AI processing first", "this record has already
 * been claimed" — sits in `error.context`, which is the raw `Response`, and is
 * discarded unless somebody reads it.
 *
 * So a function that refuses carefully and explains why produces, on screen:
 *
 *     Could not transcribe that recording: Edge Function returned a non-2xx
 *     status code
 *
 * which tells the person nothing and reads like a fault rather than a choice
 * they can act on. Across this codebase there are thirty-seven invoke calls
 * and, before this, exactly one read the body.
 *
 * Reading it is async because the body is a stream, so this cannot live in a
 * `onError` handler that expects to be synchronous — it belongs in the
 * mutation, before the error is rethrown.
 */

export interface EdgeFunctionFailure {
  /** What the function said, or a plain fallback if it said nothing usable. */
  message: string;
  /** The HTTP status, when there was one. Useful for telling apart a refusal from a crash. */
  status?: number;
}

/** A stated reason beats an inferred one; these are only used when there is none. */
const FALLBACKS: Record<number, string> = {
  401: "You need to sign in again.",
  403: "You do not have permission to do that.",
  404: "That could not be found.",
  413: "That is too large to process.",
  429: "Too many requests just now — try again in a moment.",
  500: "Something went wrong on our side.",
  503: "That service is unavailable right now.",
};

const GENERIC = "Something went wrong.";

/**
 * Pull the reason out of whatever `functions.invoke` threw.
 *
 * Never throws itself: this runs on an error path, and an error handler that
 * fails leaves the person with nothing at all.
 */
export async function edgeFunctionError(error: unknown): Promise<EdgeFunctionFailure> {
  const response = responseFrom(error);
  const status = response?.status;

  if (response) {
    const stated = await readStatedReason(response);
    if (stated) return { message: stated, status };
  }

  if (status && FALLBACKS[status]) return { message: FALLBACKS[status], status };

  // A network failure never reaches the function, so there is no body and no
  // status — and "check your connection" is the useful thing to say.
  if (error instanceof Error && /fetch|network/i.test(error.message)) {
    return { message: "Could not reach the server. Check your connection and try again." };
  }

  if (error instanceof Error && error.message && !isGenericInvokeMessage(error.message)) {
    return { message: error.message, status };
  }

  return { message: GENERIC, status };
}

function isGenericInvokeMessage(message: string): boolean {
  return /non-2xx status code/i.test(message);
}

function responseFrom(error: unknown): Response | undefined {
  if (!error || typeof error !== "object") return undefined;
  const context = (error as { context?: unknown }).context;
  // Duck-typed rather than `instanceof Response`: the shape is what matters,
  // and a test supplying a stub should work the same way.
  if (context && typeof context === "object" && typeof (context as Response).text === "function") {
    return context as Response;
  }
  return undefined;
}

/**
 * Functions here answer with `{ error }` on failure. A body that is not that
 * shape is not a message for a person — an HTML error page, a stack trace —
 * and showing it raw would be worse than the fallback.
 */
async function readStatedReason(response: Response): Promise<string | null> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text.trim()) return null;

  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    const stated = typeof parsed.error === "string" ? parsed.error : parsed.message;
    if (typeof stated === "string" && stated.trim()) return stated.trim();
    return null;
  } catch {
    // Plain text is fine when it is short enough to be a sentence somebody
    // wrote rather than a page somebody served.
    const trimmed = text.trim();
    if (trimmed.length <= 300 && !trimmed.startsWith("<")) return trimmed;
    return null;
  }
}
