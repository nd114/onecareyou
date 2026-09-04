import { describe, expect, it } from "vitest";

import { edgeFunctionError } from "@/lib/edge-function-error";

/**
 * The bug this exists for: `supabase.functions.invoke` throws
 * `FunctionsHttpError`, whose message is always "Edge Function returned a
 * non-2xx status code". Whatever the function wrote is in `error.context` —
 * the raw Response — and is thrown away unless something reads it.
 */
function invokeError(status: number, body: string): Error & { context: unknown } {
  const error = new Error("Edge Function returned a non-2xx status code") as Error & {
    context: unknown;
  };
  error.context = { status, text: async () => body };
  return error;
}

describe("the reason a function actually gave", () => {
  it("reads it out of the response body", () => {
    // Without this the patient is told "non-2xx status code", which reads as a
    // fault rather than a choice they can act on.
    const error = invokeError(403, JSON.stringify({ error: "Turn on AI processing first." }));
    return expect(edgeFunctionError(error)).resolves.toMatchObject({
      message: "Turn on AI processing first.",
      status: 403,
    });
  });

  it("never shows the generic invoke message", async () => {
    const { message } = await edgeFunctionError(invokeError(500, ""));
    expect(message).not.toMatch(/non-2xx/i);
  });

  it("accepts a message field as well as an error field", async () => {
    const { message } = await edgeFunctionError(invokeError(400, JSON.stringify({ message: "Bad input." })));
    expect(message).toBe("Bad input.");
  });

  it("trims what it found", async () => {
    const { message } = await edgeFunctionError(invokeError(400, JSON.stringify({ error: "  Nope.  " })));
    expect(message).toBe("Nope.");
  });
});

describe("when the function said nothing usable", () => {
  it("falls back on the status, which at least separates a refusal from a crash", async () => {
    await expect(edgeFunctionError(invokeError(403, ""))).resolves.toMatchObject({
      message: "You do not have permission to do that.",
    });
    await expect(edgeFunctionError(invokeError(413, "{}"))).resolves.toMatchObject({
      message: "That is too large to process.",
    });
  });

  it("refuses to show an HTML error page as if it were a sentence", async () => {
    // A gateway's 502 page is not a message for a person.
    const { message } = await edgeFunctionError(invokeError(502, "<html><body>Bad Gateway</body></html>"));
    expect(message).not.toMatch(/html/i);
  });

  it("refuses to show a stack trace either", async () => {
    const trace = "TypeError: x is not a function\n".repeat(40);
    const { message } = await edgeFunctionError(invokeError(500, trace));
    expect(message).toBe("Something went wrong on our side.");
  });

  it("accepts short plain text, which is a sentence somebody wrote", async () => {
    const { message } = await edgeFunctionError(invokeError(400, "That recording is empty."));
    expect(message).toBe("That recording is empty.");
  });
});

describe("failures that never reached the function", () => {
  it("says so, because 'check your connection' is the useful thing", async () => {
    const { message } = await edgeFunctionError(new TypeError("Failed to fetch"));
    expect(message).toMatch(/connection/i);
  });

  it("keeps a thrown message that is not the generic one", async () => {
    const { message } = await edgeFunctionError(new Error("This recording has no audio"));
    expect(message).toBe("This recording has no audio");
  });

  it("does not fall over on something that is not an error at all", async () => {
    // This runs on the error path. An error handler that throws leaves the
    // person with nothing.
    await expect(edgeFunctionError(undefined)).resolves.toMatchObject({ message: "Something went wrong." });
    await expect(edgeFunctionError("a string")).resolves.toMatchObject({ message: "Something went wrong." });
    await expect(edgeFunctionError({ context: null })).resolves.toMatchObject({
      message: "Something went wrong.",
    });
  });

  it("survives a body that cannot be read", async () => {
    const error = new Error("x") as Error & { context: unknown };
    error.context = {
      status: 500,
      text: async () => {
        throw new Error("stream already consumed");
      },
    };
    await expect(edgeFunctionError(error)).resolves.toMatchObject({
      message: "Something went wrong on our side.",
    });
  });
});
