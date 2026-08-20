import { describe, it, expect } from "vitest";
import { parseMentionedVital } from "@/lib/mentioned-vitals";

describe("parseMentionedVital", () => {
  it("reads a blood pressure written with a slash", () => {
    expect(parseMentionedVital({ type: "blood_pressure", value: "128/82" })).toMatchObject({
      value: 128,
      secondaryValue: 82,
    });
  });

  it("reads a blood pressure spoken as 'over'", () => {
    expect(parseMentionedVital({ type: "blood_pressure", value: "140 over 90" })).toMatchObject({
      value: 140,
      secondaryValue: 90,
    });
  });

  it("refuses a blood pressure with only one number", () => {
    // Recording the systolic alone would read later as a complete measurement.
    expect(parseMentionedVital({ type: "blood_pressure", value: "128" })).toBeNull();
  });

  it("reads a single-value reading and keeps the unit that was said", () => {
    expect(parseMentionedVital({ type: "heart_rate", value: "72 bpm" })).toMatchObject({
      value: 72,
      secondaryValue: null,
      unit: "bpm",
    });
  });

  it("falls back to the type's own unit when none was said", () => {
    const parsed = parseMentionedVital({ type: "weight", value: "78" });
    expect(parsed?.value).toBe(78);
    expect(parsed?.unit).toBeTruthy();
  });

  it("keeps decimals", () => {
    expect(parseMentionedVital({ type: "temperature", value: "38.4 C" })?.value).toBe(38.4);
  });

  it("resolves an alias to the canonical type", () => {
    expect(parseMentionedVital({ type: "bp", value: "120/80" })?.type).toBe("blood_pressure");
  });

  it("returns null rather than guessing when there is no number", () => {
    expect(parseMentionedVital({ type: "heart_rate", value: "slightly raised" })).toBeNull();
  });

  it("returns null when the scribe heard a value but no type", () => {
    expect(parseMentionedVital({ value: "128/82" })).toBeNull();
  });

  it("returns null when the scribe heard a type but no value", () => {
    expect(parseMentionedVital({ type: "heart_rate" })).toBeNull();
  });
});
