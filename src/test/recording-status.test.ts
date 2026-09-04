import { describe, expect, it } from "vitest";

import {
  TRANSCRIPT_STALE_AFTER_MS,
  isTranscriptInFlight,
  transcriptActionLabel,
} from "@/lib/recording-status";

const at = (iso: string) => new Date(iso);
const started = "2026-10-01T09:00:00Z";

describe("whether a transcript is still being written", () => {
  it("believes a request that has only just gone out", () => {
    expect(
      isTranscriptInFlight({ transcript_status: "pending", updated_at: started }, at("2026-10-01T09:02:00Z")),
    ).toBe(true);
  });

  it("stops believing one that has been pending for too long", () => {
    // The edge function can time out, or the tab can be closed mid-request,
    // and neither of those writes 'failed'. Without this the row sits at
    // 'pending' forever with the retry disabled.
    expect(
      isTranscriptInFlight({ transcript_status: "pending", updated_at: started }, at("2026-10-01T09:30:00Z")),
    ).toBe(false);
  });

  it("holds right up to the cutoff", () => {
    const justInside = new Date(Date.parse(started) + TRANSCRIPT_STALE_AFTER_MS - 1000);
    expect(isTranscriptInFlight({ transcript_status: "pending", updated_at: started }, justInside)).toBe(true);
  });

  it("is never in flight for a status that is not pending", () => {
    for (const status of ["none", "ready", "failed"] as const) {
      expect(isTranscriptInFlight({ transcript_status: status, updated_at: started })).toBe(false);
    }
  });

  it("does not hang on an unparseable timestamp", () => {
    // Better to offer a retry than to disable the only way out.
    expect(isTranscriptInFlight({ transcript_status: "pending", updated_at: "not a date" })).toBe(false);
  });
});

describe("what the menu item says", () => {
  it("offers to write one when there is none", () => {
    expect(transcriptActionLabel({ transcript_status: "none", updated_at: started })).toBe(
      "Write a transcript",
    );
  });

  it("says it is working while it is", () => {
    expect(
      transcriptActionLabel({ transcript_status: "pending", updated_at: started }, at("2026-10-01T09:01:00Z")),
    ).toBe("Writing a transcript…");
  });

  it("admits it stalled rather than claiming to still be working", () => {
    expect(
      transcriptActionLabel({ transcript_status: "pending", updated_at: started }, at("2026-10-01T10:00:00Z")),
    ).toBe("Transcript stalled — try again");
  });

  it("offers another go after a failure", () => {
    expect(transcriptActionLabel({ transcript_status: "failed", updated_at: started })).toBe(
      "Try the transcript again",
    );
  });
});
