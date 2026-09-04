import { describe, expect, it } from "vitest";

import {
  ACCEPTED_PERMISSION_KEYS,
  PERMISSION_FLAGS,
  describeAccessPolicy,
  grantsPermission,
  toAccessPolicy,
} from "@/lib/fhir/access-policy";

const subject = { patientUserId: "p-1", shareLabel: "Dr Evans", pathway: "clinician" } as const;
const hospital = { patientUserId: "p-1", shareLabel: "City General", pathway: "institution" } as const;

describe("what a share lets somebody see", () => {
  it("says nothing is granted when nothing is granted", () => {
    const policy = toAccessPolicy({}, subject);
    expect(policy.resource).toEqual([]);
    // A list with no items reads as a screen that failed to load, so the
    // sentence has to say "nothing" out loud.
    expect(describeAccessPolicy(policy)).toMatch(/can see nothing/i);
  });

  it("treats an absent permission as not granted, not as granted", () => {
    // The consent rule is `=== true`, not `!== false`: silence is not
    // agreement, and a share object missing a key must not open anything.
    const policy = toAccessPolicy({ vitals: true }, subject);
    expect(policy.resource.map((r) => r.resourceType)).toEqual(["Observation"]);
  });

  it("treats null permissions as nothing granted", () => {
    expect(toAccessPolicy(null, subject).resource).toEqual([]);
    expect(toAccessPolicy(undefined, subject).resource).toEqual([]);
  });

  it("does not treat a truthy non-true value as consent", () => {
    const policy = toAccessPolicy({ vitals: "yes" } as never, subject);
    expect(policy.resource).toEqual([]);
  });
});

describe("the resources each permission opens", () => {
  it("opens both medication resources, because a prescription is not a statement", () => {
    const policy = toAccessPolicy({ medications: true }, subject);
    expect(policy.resource.map((r) => r.resourceType).sort()).toEqual([
      "MedicationRequest",
      "MedicationStatement",
    ]);
  });

  it("opens the two clinical lists for profile", () => {
    const policy = toAccessPolicy({ profile: true }, subject);
    expect(policy.resource.map((r) => r.resourceType).sort()).toEqual([
      "AllergyIntolerance",
      "Condition",
    ]);
  });

  it("separates adherence from vitals even though they read the same rows", () => {
    const both = toAccessPolicy({ vitals: true, adherence: true }, subject);
    const criteria = both.resource.map((r) => r.criteria);
    expect(criteria).toContain("Observation?patient=Patient/p-1&category=vital-signs");
    expect(criteria).toContain("Observation?patient=Patient/p-1&category=therapy");
  });

  it("does not grant adherence when only vitals is on", () => {
    const policy = toAccessPolicy({ vitals: true }, subject);
    expect(policy.resource.every((r) => !r.criteria.includes("therapy"))).toBe(true);
  });
});

describe("the scoping, which is the part that matters", () => {
  it("scopes every entry to the one patient", () => {
    // An entry without a patient scope reads as "every patient", which is the
    // opposite of what a share is.
    const policy = toAccessPolicy(
      { vitals: true, meds: true, adherence: true, profile: true, documents: true },
      subject,
    );
    expect(policy.resource).not.toHaveLength(0);
    for (const entry of policy.resource) {
      expect(entry.criteria).toContain("patient=Patient/p-1");
    }
  });

  it("makes every entry read-only", () => {
    // A share grants sight, never authorship. A clinician writes into their
    // own records, not into the patient's.
    const policy = toAccessPolicy({ vitals: true, documents: true }, subject);
    for (const entry of policy.resource) {
      expect(entry.readonly).toBe(true);
    }
  });

  it("excludes archived documents from a whole-vault share", () => {
    const policy = toAccessPolicy({ documents: true }, subject);
    expect(policy.resource[0].criteria).toContain("status=current");
  });
});

describe("it says what it is", () => {
  it("tags itself as a projection, not the thing that decides", () => {
    // The document exists to be read. Anybody reading it needs to know that
    // editing it would change nothing, and that the database is the authority.
    const policy = toAccessPolicy({ vitals: true }, subject);
    expect(policy.meta.tag[0].code).toBe("projection");
    expect(policy.meta.tag[0].display).toMatch(/enforced by database policy/i);
  });

  it("carries the name the patient gave the share", () => {
    // They will recognise "Dr Evans", not a uuid.
    expect(toAccessPolicy({}, subject).name).toBe("Dr Evans");
  });
});

describe("the sentence a patient reads", () => {
  it("lists one thing plainly", () => {
    expect(describeAccessPolicy(toAccessPolicy({ vitals: true }, subject))).toBe(
      "Dr Evans can see readings you have recorded. They cannot change any of it.",
    );
  });

  it("joins several without repeating a description twice", () => {
    // meds opens two resource types with the same two descriptions; profile
    // opens two with different ones. The sentence should not stutter.
    const sentence = describeAccessPolicy(toAccessPolicy({ meds: true, profile: true }, subject));
    expect(sentence).toContain("medicines on your list");
    expect(sentence).toContain("conditions on your profile");
    expect(sentence.match(/medicines on your list/g)).toHaveLength(1);
  });

  it("always says the access is read-only", () => {
    expect(describeAccessPolicy(toAccessPolicy({ documents: true }, subject))).toMatch(
      /cannot change/i,
    );
  });
});

describe("one vocabulary, and the shares written before it", () => {
  // The pathways used to name the same things differently, so a permissions
  // object written for one granted nothing through the other. They converged;
  // the old spellings are honoured as aliases so nothing anybody agreed to
  // changes meaning.
  it("opens the same medicines under either spelling", () => {
    const canonical = toAccessPolicy({ medications: true }, subject);
    const legacy = toAccessPolicy({ meds: true }, subject);
    expect(legacy.resource).toEqual(canonical.resource);
    expect(legacy.resource.map((r) => r.resourceType).sort()).toEqual([
      "MedicationRequest",
      "MedicationStatement",
    ]);
  });

  it("still reads a share written for a hospital when shown as a clinician's", () => {
    // This is the bug: before convergence, this returned nothing.
    const asHospital = toAccessPolicy({ medications: true, conditions: true }, hospital);
    const asClinician = toAccessPolicy({ medications: true, conditions: true }, subject);
    expect(asClinician.resource).toEqual(asHospital.resource);
    expect(asClinician.resource.length).toBeGreaterThan(0);
  });

  it("still honours a share written with 'profile' as both lists", () => {
    const policy = toAccessPolicy({ profile: true }, subject);
    expect(policy.resource.map((r) => r.resourceType).sort()).toContain("Condition");
    expect(policy.resource.map((r) => r.resourceType).sort()).toContain("AllergyIntolerance");
  });

  it("says 'profile' opens more than the two lists, because it does", () => {
    // RLS is row-level: opening the profiles row hands over name, date of
    // birth, blood type and contact details as well. A policy document that
    // described it as only the clinical lists would understate it.
    const policy = toAccessPolicy({ profile: true }, subject);
    const patientEntry = policy.resource.find((r) => r.resourceType === "Patient");
    expect(patientEntry).toBeDefined();
    expect(patientEntry?.description).toMatch(/date of birth|contact/i);

    // ...and granting the lists separately does not open the whole row.
    const listsOnly = toAccessPolicy({ conditions: true, allergies: true }, subject);
    expect(listsOnly.resource.some((r) => r.resourceType === "Patient")).toBe(false);
  });

  it("lets conditions be granted without allergies, on either pathway", () => {
    for (const who of [subject, hospital]) {
      const policy = toAccessPolicy({ conditions: true }, who);
      expect(policy.resource.map((r) => r.resourceType)).toEqual(["Condition"]);
    }
  });

  it("does not let an alias open something it does not name", () => {
    // 'meds' is an old name for medications, not a skeleton key.
    expect(grantsPermission({ meds: true }, "documents")).toBe(false);
    expect(grantsPermission({ meds: true }, "adherence")).toBe(false);
    expect(grantsPermission({ profile: true }, "vitals")).toBe(false);
  });

  it("keeps dose history as its own grant", () => {
    // Institutions used to get it with 'medications'. Whether somebody takes
    // their medicine is a judgement about them, not a record of their care.
    expect(grantsPermission({ medications: true }, "adherence")).toBe(false);
    expect(grantsPermission({ meds: true }, "adherence")).toBe(false);
    expect(grantsPermission({ adherence: true }, "adherence")).toBe(true);
  });

  it("counts only a literal true, matching the database", () => {
    // share_granted_flag used to be (permissions->>key)::boolean, and Postgres
    // reads "yes", "on", "t" and 1 as true — so a share the interface showed
    // as off was one the database honoured. Both ends now require a boolean.
    for (const loose of ["yes", "true", 1, "on", {}] as unknown[]) {
      expect(grantsPermission({ vitals: loose } as never, "vitals")).toBe(false);
    }
    expect(grantsPermission({ vitals: true }, "vitals")).toBe(true);
  });

  it("names exactly the flags the SQL suite checks against the live policies", () => {
    expect(PERMISSION_FLAGS).toEqual([
      "adherence",
      "allergies",
      "conditions",
      "documents",
      "medications",
      "profile",
      "vitals",
    ]);
  });

  it("knows every key a stored share might carry", () => {
    expect(ACCEPTED_PERMISSION_KEYS).toContain("meds");
    expect(ACCEPTED_PERMISSION_KEYS).toContain("profile");
    for (const flag of PERMISSION_FLAGS) {
      expect(ACCEPTED_PERMISSION_KEYS).toContain(flag);
    }
  });
});
