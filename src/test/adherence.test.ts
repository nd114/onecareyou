import { describe, it, expect } from "vitest";
import { summariseAdherence, summariseDay, isDue, type DoseEntry } from "@/lib/adherence";

// Nine in the morning on the last day of a seven-day window.
const NOW = new Date("2026-08-20T09:00:00Z");
const at = (iso: string, status: string): DoseEntry => ({ status, scheduled_time: iso });

/** Seven days, two doses a day, every past dose taken. */
function perfectWeek(): DoseEntry[] {
  const entries: DoseEntry[] = [];
  for (let day = 6; day >= 0; day--) {
    const date = new Date(NOW.getTime() - day * 86_400_000);
    const morning = new Date(date); morning.setUTCHours(8, 0, 0, 0);
    const evening = new Date(date); evening.setUTCHours(20, 0, 0, 0);
    entries.push(at(morning.toISOString(), morning <= NOW ? "taken" : "pending"));
    entries.push(at(evening.toISOString(), evening <= NOW ? "taken" : "pending"));
  }
  return entries;
}

describe("summariseAdherence", () => {
  it("reads 100% for a patient who has taken every dose that was due", () => {
    // The old sum gave 12/14 = 86% here, purely because tonight's tablets were
    // already in the denominator.
    const result = summariseAdherence(perfectWeek(), NOW);
    expect(result.rate).toBe(100);
    expect(result.due).toBe(13);
    expect(result.upcoming).toBe(1);
  });

  it("does not let an untaken future dose lower the rate", () => {
    const entries = [
      at("2026-08-20T08:00:00Z", "taken"),
      at("2026-08-20T20:00:00Z", "pending"),
    ];
    expect(summariseAdherence(entries, NOW).rate).toBe(100);
  });

  it("counts a dose that came and went with nothing recorded as missed", () => {
    const entries = [
      at("2026-08-19T08:00:00Z", "taken"),
      at("2026-08-19T20:00:00Z", "pending"),
    ];
    const result = summariseAdherence(entries, NOW);
    expect(result.missed).toBe(1);
    expect(result.rate).toBe(50);
  });

  it("counts a deliberate skip against adherence, since the dose was not taken", () => {
    const entries = [
      at("2026-08-19T08:00:00Z", "taken"),
      at("2026-08-19T20:00:00Z", "skipped"),
    ];
    const result = summariseAdherence(entries, NOW);
    expect(result.skipped).toBe(1);
    expect(result.rate).toBe(50);
  });

  it("returns null rather than zero when nothing has come due", () => {
    // Zero would read as total failure on a schedule that has not started.
    const entries = [at("2026-08-21T08:00:00Z", "pending")];
    const result = summariseAdherence(entries, NOW);
    expect(result.rate).toBeNull();
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(1);
  });

  it("returns null for no entries at all", () => {
    expect(summariseAdherence([], NOW).rate).toBeNull();
  });

  it("treats a dose due this very moment as due", () => {
    expect(summariseAdherence([at(NOW.toISOString(), "taken")], NOW).due).toBe(1);
  });

  it("leaves an unparseable time out rather than throwing", () => {
    const result = summariseAdherence([at("whenever", "pending")], NOW);
    expect(result.due).toBe(0);
    expect(result.rate).toBeNull();
  });

  it("treats any unrecognised status on a due dose as not taken", () => {
    expect(summariseAdherence([at("2026-08-19T08:00:00Z", "snoozed")], NOW).rate).toBe(0);
  });
});

describe("summariseDay", () => {
  const today: DoseEntry[] = [
    at("2026-08-20T08:00:00Z", "taken"),
    at("2026-08-20T20:00:00Z", "pending"),
    at("2026-08-19T08:00:00Z", "taken"),
  ];

  it("scores today on what has come due so far, not the whole day", () => {
    // The day's bar used to start at zero each morning and climb, which reads
    // as a patient failing and recovering every day.
    const result = summariseDay(today, NOW, NOW);
    expect(result.rate).toBe(100);
    expect(result.upcoming).toBe(1);
  });

  it("keeps a past day whole", () => {
    const yesterday = new Date("2026-08-19T12:00:00Z");
    const result = summariseDay(today, yesterday, NOW);
    expect(result.due).toBe(1);
    expect(result.rate).toBe(100);
  });

  it("ignores doses belonging to other days", () => {
    expect(summariseDay(today, NOW, NOW).due + summariseDay(today, NOW, NOW).upcoming).toBe(2);
  });
});

describe("isDue", () => {
  it("is true for the past and false for the future", () => {
    expect(isDue(at("2026-08-19T08:00:00Z", "pending"), NOW)).toBe(true);
    expect(isDue(at("2026-08-21T08:00:00Z", "pending"), NOW)).toBe(false);
  });
});
