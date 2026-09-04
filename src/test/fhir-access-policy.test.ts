import { describe, expect, it } from "vitest";

import { PERMISSION_FLAGS, describeAccessPolicy, toAccessPolicy } from "@/lib/fhir/access-policy";

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
  it("opens both medication resources for meds, because a prescription is not a statement", () => {
    const policy = toAccessPolicy({ meds: true }, subject);
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

describe("the two share pathways speak different vocabularies", () => {
  // Read out of the live policies, not assumed. A clinician share checks
  // 'meds' and 'profile'; an institution share checks 'medications' and the
  // separate 'conditions' and 'allergies'. A projection that knew only one
  // would be wrong about half the shares in the product.
  it("does not open a clinician share with an institution's keys", () => {
    const policy = toAccessPolicy({ medications: true, conditions: true }, subject);
    expect(policy.resource).toEqual([]);
  });

  it("does not open an institution share with a clinician's keys", () => {
    const policy = toAccessPolicy({ meds: true, profile: true }, hospital);
    expect(policy.resource).toEqual([]);
  });

  it("reaches the same medicines under either name, through the right pathway", () => {
    const byClinician = toAccessPolicy({ meds: true }, subject);
    const byHospital = toAccessPolicy({ medications: true }, hospital);
    expect(byClinician.resource.map((r) => r.resourceType).sort()).toEqual(
      byHospital.resource.map((r) => r.resourceType).sort(),
    );
  });

  it("lets a hospital be given conditions without allergies, which a clinician share cannot express", () => {
    // 'profile' is all-or-nothing on the clinician side; the institution side
    // separates them. That asymmetry is real and the projection must show it.
    const conditionsOnly = toAccessPolicy({ conditions: true }, hospital);
    expect(conditionsOnly.resource.map((r) => r.resourceType)).toEqual(["Condition"]);

    const both = toAccessPolicy({ profile: true }, subject);
    expect(both.resource.map((r) => r.resourceType).sort()).toEqual([
      "AllergyIntolerance",
      "Condition",
    ]);
  });

  it("offers dose history on the clinician side only", () => {
    // No policy checks an 'adherence' key for an institution, so claiming a
    // hospital share could grant it would overstate what the share does.
    expect(PERMISSION_FLAGS.clinician).toContain("adherence");
    expect(PERMISSION_FLAGS.institution).not.toContain("adherence");
  });

  it("names exactly the flags the SQL suite checks against the live policies", () => {
    expect(PERMISSION_FLAGS.clinician).toEqual([
      "adherence",
      "documents",
      "meds",
      "profile",
      "vitals",
    ]);
    expect(PERMISSION_FLAGS.institution).toEqual([
      "allergies",
      "conditions",
      "documents",
      "medications",
      "vitals",
    ]);
  });
});
