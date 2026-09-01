import { describe, it, expect } from "vitest";
import { parseStaffCsv } from "@/lib/staff-csv";

describe("parseStaffCsv", () => {
  it("reads a plain export with a header row", () => {
    const { entries, skipped } = parseStaffCsv(
      ["email,name,role", "jane@lmc.org,Dr Jane Evans,clinician", "John@lmc.org,Nurse John,nurse"].join("\n"),
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ email: "jane@lmc.org", name: "Dr Jane Evans", role: "clinician" });
    expect(entries[1].role).toBe("nurse");
    // The header row carries no email, so it is counted as skipped, not imported.
    expect(skipped).toBe(1);
  });

  it("does not depend on column order", () => {
    const { entries } = parseStaffCsv("Dr Jane Evans,clinician,jane@lmc.org");
    expect(entries[0]).toEqual({ email: "jane@lmc.org", name: "Dr Jane Evans", role: "clinician" });
  });

  it("handles quoted fields containing commas", () => {
    const { entries } = parseStaffCsv('"Evans, Jane",jane@lmc.org');
    expect(entries[0].email).toBe("jane@lmc.org");
    expect(entries[0].name).toBe("Evans, Jane");
  });

  it("accepts semicolon and tab separated exports", () => {
    expect(parseStaffCsv("jane@lmc.org;Dr Jane").entries[0].name).toBe("Dr Jane");
    expect(parseStaffCsv("jane@lmc.org\tDr Jane").entries[0].name).toBe("Dr Jane");
  });

  it("lowercases addresses and drops duplicates", () => {
    const { entries } = parseStaffCsv(["JANE@LMC.ORG", "jane@lmc.org"].join("\n"));
    expect(entries).toHaveLength(1);
    expect(entries[0].email).toBe("jane@lmc.org");
  });

  it("counts rows with no usable email instead of importing them", () => {
    const { entries, skipped } = parseStaffCsv(["jane@lmc.org", "not-an-email", "someone,,,", ""].join("\n"));
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it("falls back to no role rather than guessing an unknown one", () => {
    const { entries } = parseStaffCsv("jane@lmc.org,Dr Jane,Consultant Anaesthetist");
    expect(entries[0].role).toBeUndefined();
    expect(entries[0].name).toBe("Dr Jane");
  });
});
