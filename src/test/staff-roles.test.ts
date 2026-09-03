import { describe, it, expect } from "vitest";
import { ASSIGNABLE_ROLES, ROLE_PROFILES, isClinicalRole, roleProfile } from "@/lib/staff-roles";

/**
 * These mirror public.practice_role_is_clinical. If the two ever disagree, a
 * receptionist is either shown tabs that return nothing or denied tabs that
 * would have worked — and the database, being the enforcement, wins silently.
 * supabase/tests/non_clinical_staff.test.sql asserts the other side.
 */
describe("who is clinical", () => {
  it.each(["owner", "admin", "sub_admin", "provider", "clinician", "nurse"])(
    "%s is clinical",
    (role) => expect(isClinicalRole(role)).toBe(true),
  );

  it.each(["front_desk", "billing", "read_only", "staff"])(
    "%s is not",
    (role) => expect(isClinicalRole(role)).toBe(false),
  );

  it("treats an unknown role as non-clinical", () => {
    // The safe direction, matching the database's allowlist: a role nobody has
    // classified gets nothing clinical until somebody decides it should.
    expect(isClinicalRole("radiographer")).toBe(false);
    expect(isClinicalRole(null)).toBe(false);
    expect(isClinicalRole(undefined)).toBe(false);
  });

  it("still names an unknown role rather than showing a blank", () => {
    expect(roleProfile("radiographer").label).toBe("radiographer");
    expect(roleProfile(null).label).toBe("Unknown");
  });
});

describe("every role is described", () => {
  it("has a label and a description for each", () => {
    for (const [role, profile] of Object.entries(ROLE_PROFILES)) {
      expect(profile.label, role).toBeTruthy();
      expect(profile.description, role).toBeTruthy();
    }
  });

  it("says plainly, on every non-clinical role, that the record is not included", () => {
    // A practice choosing a role for a new hire needs to know what it means
    // before the hire finds out by not being able to do their job.
    for (const [role, profile] of Object.entries(ROLE_PROFILES)) {
      if (!profile.clinical && role !== "read_only") {
        expect(profile.description.toLowerCase(), role).toContain("clinical record");
      }
    }
  });
});

describe("the assignable list", () => {
  it("groups clinical and non-clinical so the difference is visible when choosing", () => {
    const groups = Object.fromEntries(ASSIGNABLE_ROLES.map((g) => [g.group, g.roles]));
    expect(groups.Clinical.every(isClinicalRole)).toBe(true);
    expect(groups["Non-clinical"].some(isClinicalRole)).toBe(false);
  });

  it("does not offer owner, which is not a role you assign", () => {
    expect(ASSIGNABLE_ROLES.flatMap((g) => g.roles)).not.toContain("owner");
  });
});
