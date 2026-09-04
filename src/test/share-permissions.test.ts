import { describe, expect, it } from "vitest";

import {
  SHARE_PERMISSIONS,
  acceptedShareKeys,
  shareGrants,
} from "../../supabase/functions/_shared/share-permissions";

/**
 * One resolver, four places: the browser, the edge functions, this suite, and
 * — mirrored, and asserted by supabase/tests/share_vocabulary.test.sql — the
 * database. Three of the four used to read permission keys directly, so a
 * share written with a canonical name was invisible to code checking the
 * retired one.
 */
describe("what a share opens", () => {
  it("honours the canonical names", () => {
    for (const permission of SHARE_PERMISSIONS) {
      expect(shareGrants({ [permission]: true }, permission)).toBe(true);
    }
  });

  it("grants nothing when nothing was granted", () => {
    for (const permission of SHARE_PERMISSIONS) {
      expect(shareGrants({}, permission)).toBe(false);
      expect(shareGrants(null, permission)).toBe(false);
      expect(shareGrants(undefined, permission)).toBe(false);
    }
  });

  it("counts only a literal true", () => {
    // The SQL used to be (permissions->>key)::boolean, and Postgres reads
    // 'yes', 'on', 't' and 1 as true — so a share the interface showed as off
    // was one the database honoured.
    for (const loose of ["yes", "true", "on", "t", 1, {}, []]) {
      expect(shareGrants({ vitals: loose }, "vitals")).toBe(false);
    }
    expect(shareGrants({ vitals: false }, "vitals")).toBe(false);
  });
});

describe("shares written before the vocabularies converged", () => {
  it("still opens medications for a share carrying 'meds'", () => {
    expect(shareGrants({ meds: true }, "medications")).toBe(true);
  });

  it("still opens both clinical lists for a share carrying 'profile'", () => {
    expect(shareGrants({ profile: true }, "conditions")).toBe(true);
    expect(shareGrants({ profile: true }, "allergies")).toBe(true);
  });

  it("does not let an alias open something it does not name", () => {
    // 'meds' is an old name for medications, not a skeleton key.
    expect(shareGrants({ meds: true }, "documents")).toBe(false);
    expect(shareGrants({ meds: true }, "adherence")).toBe(false);
    expect(shareGrants({ meds: true }, "vitals")).toBe(false);
    expect(shareGrants({ profile: true }, "vitals")).toBe(false);
    expect(shareGrants({ profile: true }, "medications")).toBe(false);
  });
});

describe("'profile' is coarser than the two lists", () => {
  it("is not granted by one list alone", () => {
    // RLS is row-level: the profiles row carries name, date of birth, blood
    // type and contact details as well, so opening it needs more than a
    // conditions grant.
    expect(shareGrants({ conditions: true }, "profile")).toBe(false);
    expect(shareGrants({ allergies: true }, "profile")).toBe(false);
  });

  it("is not granted by both together either", () => {
    // Aliases run one way. A coarse grant implies the fine ones — 'profile'
    // opens each list — but two list grants do not add up to the row they sit
    // on, which also carries name, date of birth and contact details.
    expect(shareGrants({ conditions: true, allergies: true }, "profile")).toBe(false);
  });
});

describe("dose history", () => {
  it("is its own grant, on either pathway", () => {
    // Institutions used to get it with 'medications'. Whether somebody takes
    // their medicine is a judgement about them, not a record of their care.
    expect(shareGrants({ medications: true }, "adherence")).toBe(false);
    expect(shareGrants({ meds: true }, "adherence")).toBe(false);
    expect(shareGrants({ adherence: true }, "adherence")).toBe(true);
  });
});

describe("the accepted keys", () => {
  it("covers every canonical permission and every retired spelling", () => {
    const keys = acceptedShareKeys();
    for (const permission of SHARE_PERMISSIONS) expect(keys).toContain(permission);
    expect(keys).toContain("meds");
  });

  it("has no duplicates", () => {
    const keys = acceptedShareKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });
});
