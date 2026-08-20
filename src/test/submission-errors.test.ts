import { describe, it, expect } from "vitest";
import { describeSubmissionError } from "@/lib/submission-errors";

const FALLBACK = "There was an error. Please try again.";

describe("describeSubmissionError", () => {
  it("shows the throttle message our own trigger wrote", () => {
    const result = describeSubmissionError(
      { code: "P0001", message: "You have sent several applications recently. Please wait an hour." },
      FALLBACK,
    );
    expect(result.message).toContain("wait an hour");
    expect(result.isRateLimited).toBe(true);
  });

  it("falls back for an ordinary database error rather than leaking column names", () => {
    const result = describeSubmissionError(
      { code: "23502", message: 'null value in column "email" violates not-null constraint' },
      FALLBACK,
    );
    expect(result.message).toBe(FALLBACK);
    expect(result.isRateLimited).toBe(false);
  });

  it("falls back when a P0001 arrives with no message to show", () => {
    expect(describeSubmissionError({ code: "P0001", message: "  " }, FALLBACK).message).toBe(FALLBACK);
  });

  it("falls back for a network failure with no code at all", () => {
    expect(describeSubmissionError(new Error("Failed to fetch"), FALLBACK).message).toBe(FALLBACK);
  });

  it("falls back for null and undefined", () => {
    expect(describeSubmissionError(null, FALLBACK).message).toBe(FALLBACK);
    expect(describeSubmissionError(undefined, FALLBACK).message).toBe(FALLBACK);
  });
});
