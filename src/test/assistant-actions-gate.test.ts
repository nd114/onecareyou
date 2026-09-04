import { describe, expect, it } from "vitest";

/**
 * Assistant actions are off unless a surface asks for them.
 *
 * `allowActions` used to default to on — `options.allowActions !== false` —
 * and no caller ever passed it, so every surface could propose changes to a
 * record on the strength of the general AI consent alone. Agreeing to *use* an
 * assistant is not agreeing to let it *change* things.
 *
 * The hook itself needs a React tree, so this asserts the gate's logic
 * directly. It is the one line that decides whether a proposal is even parsed
 * out of the model's reply, and getting it backwards is silent.
 */

/** Exactly as written in useAIChat. Kept in step by the test below. */
const gate = (allowActions?: boolean) => allowActions === true;

describe("the second consent", () => {
  it("is off when a surface says nothing", () => {
    // The old default. Every caller omitted the flag, so every caller had it on.
    expect(gate(undefined)).toBe(false);
  });

  it("is off when a surface explicitly declines", () => {
    expect(gate(false)).toBe(false);
  });

  it("is on only when a surface asks for it", () => {
    expect(gate(true)).toBe(true);
  });

  it("does not treat a missing flag as permission", () => {
    // The bug this replaces: `!== false` reads "anything but an explicit no",
    // which turns silence into consent.
    const oldGate = (allowActions?: boolean) => allowActions !== false;
    expect(oldGate(undefined)).toBe(true);
    expect(gate(undefined)).toBe(false);
  });
});

describe("the gate in the source has not drifted", () => {
  it("still reads === true", async () => {
    // Reading the source is blunt, but this is a security default that is
    // invisible when wrong: nothing fails, the assistant simply gains the
    // ability to propose writes nobody agreed to.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/hooks/useAIChat.ts", "utf8");
    expect(src).toContain("const allowActions = options.allowActions === true;");
    expect(src).not.toContain("options.allowActions !== false");
  });
});
