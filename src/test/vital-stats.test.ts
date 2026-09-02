import { describe, it, expect } from "vitest";
import { summariseVital, type VitalReading } from "@/lib/vital-stats";

const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T08:00:00.000Z`;

function readings(...vals: (number | [number, number])[]): VitalReading[] {
  return vals.map((v, i) =>
    Array.isArray(v)
      ? { value: v[0], secondary_value: v[1], unit: "mmHg", recorded_at: at(i + 1) }
      : { value: v, recorded_at: at(i + 1) },
  );
}

describe("units are converted before anything is compared", () => {
  it("reads a Fahrenheit temperature as the normal reading it is", () => {
    // 98.6 °F is 37.0 °C, squarely inside the 36.1–37.2 band. Compared raw
    // against a Celsius band it is out of range every single time, which is
    // what the patient's screen used to show.
    const stats = summariseVital("temperature", [
      { value: 98.6, unit: "°F", recorded_at: at(1) },
    ])!;
    expect(stats.inRange).toBe(1);
    expect(stats.outOfRange).toBe(0);
    expect(stats.average).toBe(37);
  });

  it("reads glucose in mmol/L against the mg/dL band", () => {
    // 5.5 mmol/L is 99 mg/dL — normal. Raw, it is below the 70 floor.
    const stats = summariseVital("glucose", [
      { value: 5.5, unit: "mmol/L", recorded_at: at(1) },
    ])!;
    expect(stats.inRange).toBe(1);
    expect(stats.average).toBeCloseTo(99.1, 0);
  });

  it("averages mixed units as one comparable set", () => {
    // Logged in °F and °C in the same week. The mean of 98.6 and 37 is not a
    // temperature; the mean of 37 and 37 is.
    const stats = summariseVital("temperature", [
      { value: 98.6, unit: "°F", recorded_at: at(1) },
      { value: 37.0, unit: "°C", recorded_at: at(2) },
    ])!;
    expect(stats.average).toBe(37);
    expect(stats.min).toBe(37);
    expect(stats.max).toBe(37);
  });

  it("reports which unit the numbers are in", () => {
    expect(summariseVital("temperature", readings(37))!.unit).toBe("°C");
  });
});

describe("blood pressure is two numbers", () => {
  it("counts a hypertensive diastolic as out of range", () => {
    // 118/95. The systolic is fine and the patient is hypertensive. Judging on
    // the systolic alone called this in range.
    const stats = summariseVital("blood_pressure", readings([118, 95]))!;
    expect(stats.outOfRange).toBe(1);
    expect(stats.inRange).toBe(0);
  });

  it("counts a genuinely normal reading as in range", () => {
    const stats = summariseVital("blood_pressure", readings([118, 76]))!;
    expect(stats.inRange).toBe(1);
  });

  it("still judges a high systolic", () => {
    expect(summariseVital("blood_pressure", readings([165, 78]))!.outOfRange).toBe(1);
  });

  it("does not fall over when the diastolic was never recorded", () => {
    const stats = summariseVital("blood_pressure", [
      { value: 118, secondary_value: null, unit: "mmHg", recorded_at: at(1) },
    ]);
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(1);
  });
});

describe("the ordinary summary", () => {
  it("counts, averages and bounds the readings", () => {
    const stats = summariseVital("weight", readings(80, 82, 84))!;
    expect(stats.count).toBe(3);
    expect(stats.average).toBe(82);
    expect(stats.min).toBe(80);
    expect(stats.max).toBe(84);
  });

  it("reports the trend from first reading to last", () => {
    expect(summariseVital("weight", readings(80, 88))!.trend).toBe(10);
    expect(summariseVital("weight", readings(88, 80))!.trend).toBeCloseTo(-9.1, 1);
  });

  it("reports no trend from a single reading", () => {
    expect(summariseVital("weight", readings(80))!.trend).toBe(0);
  });

  it("does not divide by zero when the first reading was zero", () => {
    // Infinity on a dashboard helps nobody.
    const stats = summariseVital("weight", readings(0, 80))!;
    expect(stats.trend).toBe(0);
    expect(Number.isFinite(stats.trend)).toBe(true);
  });

  it("returns null for no readings, not a row of zeroes", () => {
    // "No readings" and "all zero" are different, and a card should show
    // different things for them.
    expect(summariseVital("weight", [])).toBeNull();
  });

  it("splits in-range and out-of-range so they account for every reading", () => {
    const stats = summariseVital("heart_rate", readings(55, 72, 88, 130))!;
    expect(stats.inRange + stats.outOfRange).toBe(stats.count);
    expect(stats.outOfRange).toBe(2);
  });
});
