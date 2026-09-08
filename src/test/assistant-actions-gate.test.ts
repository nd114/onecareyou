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

/**
 * The assistant is held to the same rule as the button.
 *
 * `useMedications` refuses to change a medication that came from a sending
 * system, and its comment says the guard sits in the mutation "because the
 * button is not the only caller — the assistant can change a medication too."
 * The intent was right; the wiring was not. `ai-actions.ts` writes to
 * `medications` through `supabase` directly and never passes through that
 * hook, so until this was fixed a hospital-imported prescription could be
 * stopped by asking the assistant while the medications page refused the same
 * change.
 *
 * Asserted against the source, like the gate above, because the failure is
 * invisible at runtime: nothing errors, the medication simply stops.
 */
describe("the assistant cannot edit what the patient cannot edit", () => {
  const read = async () => {
    const fs = await import("node:fs/promises");
    return fs.readFile("src/lib/ai-actions.ts", "utf8");
  };

  /**
   * The body of one `case` inside `executeAction`, not `describeAction`.
   *
   * Both switch on the same action names, so slicing from the first occurrence
   * reads the copy that only builds a label — which contains none of the
   * writes these assertions are about, and so passes or fails on nothing.
   */
  const executeBranch = (src: string, action: string) => {
    const body = src.slice(src.indexOf("export async function executeAction"));
    const start = body.indexOf(`case '${action}'`);
    if (start === -1) throw new Error(`no ${action} branch in executeAction`);
    const next = body.indexOf("      case '", start + 10);
    return body.slice(start, next === -1 ? undefined : next);
  };

  it("looks up a medication's provenance before changing it", async () => {
    // Without `source` in the select there is nothing to check against, and
    // the guard below silently passes every row.
    expect(await read()).toMatch(/\.select\(['"]id, name, times_of_day, source['"]\)/);
  });

  it("guards the two actions that edit a prescription", async () => {
    const src = await read();
    // Reschedule and drop-a-reminder. Both rewrite what the row says the
    // regimen is, which on an imported row is the sending system's statement.
    const guarded = src.match(/refuseIfNotTheirs\(action, med\)/g) ?? [];
    expect(guarded.length).toBe(2);
  });

  it("does not guard stopping, and routes it through stop_medication", async () => {
    // The correction that produced this: stopping was guarded alongside the
    // edits, so a patient could not tell the assistant they had come off a
    // hospital-prescribed drug. Refusing that does not make anybody take their
    // medicine; it only makes the record wrong, and it withholds the one signal
    // a prescriber most needs.
    const src = await read();
    const stop = executeBranch(src, "discontinue_medication");
    expect(stop).not.toMatch(/refuseIfNotTheirs/);
    expect(stop).toMatch(/rpc\(['"]stop_medication['"]/);
  });

  it("lets a stop be backdated, because people report late", async () => {
    const src = await read();
    expect(executeBranch(src, "discontinue_medication")).toMatch(/p_stopped_on/);
  });

  it("guards on provenance rather than re-deriving the rule", async () => {
    // The rule lives in isMedicationEditable and is used by the UI too. A
    // second copy here is how the two come to disagree.
    expect(await read()).toMatch(/isMedicationEditable/);
  });

  it("still lets a patient record taking a medicine somebody else prescribed", async () => {
    // Adherence is the patient's account of their own behaviour, not an edit
    // to the prescription. Guarding it would be the opposite mistake.
    const src = await read();
    expect(executeBranch(src, "mark_dose_taken")).not.toMatch(/refuseIfNotTheirs/);
  });
});
