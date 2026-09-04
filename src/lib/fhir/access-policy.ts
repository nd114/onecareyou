import type { ResourceType } from "@medplum/fhirtypes";

/**
 * What a share lets somebody see, written as a Medplum AccessPolicy.
 *
 * This is a **projection, and never an authority**. Nothing consults it to
 * decide access — Postgres RLS does that, and there are hundreds of SQL
 * assertions holding it — exactly as `fhir_appointments.resource` is a
 * projection of the columns and never the other way round. The same rule, for
 * the same reason: a second copy of a rule is a copy that eventually disagrees
 * with the first, and here the first copy is the one that actually stops
 * anybody reading anything.
 *
 * What it is for is answering a question the product's central claim invites
 * and the database cannot: **"what, exactly, can this clinician see?"** A
 * patient can be shown it, a hospital's compliance officer can be handed it,
 * and an auditor can diff it against what the policies allow. The answer is
 * derived from the same `permissions` object RLS reads, so it cannot drift
 * from the rules by being edited — only by this file being wrong, which is
 * what the tests are for.
 *
 * Read-only by construction. Every entry sets `readonly: true`, because a
 * share grants sight and never authorship: a clinician writes into their own
 * records, not into the patient's.
 */

export interface SharePermissionsInput {
  /** Both pathways. */
  vitals?: boolean;
  documents?: boolean;
  /** Clinician share. */
  meds?: boolean;
  adherence?: boolean;
  profile?: boolean;
  /** Institution share. */
  medications?: boolean;
  conditions?: boolean;
  allergies?: boolean;
}

export interface AccessPolicyResourceEntry {
  resourceType: ResourceType | "*";
  criteria: string;
  readonly: true;
  /** Plain words for the same rule, for the person being shown this. */
  description: string;
}

export interface AccessPolicyProjection {
  resourceType: "AccessPolicy";
  name: string;
  /** Not a stored resource — say so in the document itself. */
  meta: { tag: [{ system: string; code: "projection"; display: string }] };
  resource: AccessPolicyResourceEntry[];
}

const PROJECTION_TAG_SYSTEM = "https://onecare.you/fhir/CodeSystem/policy-origin";

/**
 * The two share pathways speak different vocabularies for the same things.
 *
 * Read out of the live policies and function bodies rather than assumed, and
 * it is the single most surprising thing about the consent model:
 *
 * | Concept | Clinician share | Institution share |
 * | --- | --- | --- |
 * | Readings | `vitals` | `vitals` |
 * | Medicines | `meds` | `medications` |
 * | Conditions and allergies | `profile` (both together) | `conditions`, `allergies` (separately) |
 * | Dose history | `adherence` | *(not offered)* |
 * | The Vault | `documents` | `documents` |
 *
 * So a patient who grants a hospital `conditions` and a clinician `profile`
 * has granted the same thing under two names, and a share object written for
 * one pathway grants nothing at all through the other. That is worth fixing in
 * the schema, but a projection whose job is to say what somebody can see must
 * describe the model as it is rather than the model as it should be — a policy
 * document that quietly assumed one vocabulary would be wrong about half the
 * shares in the product.
 */
export type SharePathway = "clinician" | "institution";

interface FlagTarget {
  resourceType: ResourceType;
  description: string;
  /** Extra search criteria beyond the patient scope. */
  criteria?: string;
}

const CLINICIAN_FLAGS: Record<string, FlagTarget[]> = {
  vitals: [
    {
      resourceType: "Observation",
      description: "Readings you have recorded",
      criteria: "category=vital-signs",
    },
  ],
  // One table, two resource types: a row the patient entered is a
  // MedicationStatement (what they say they take), and one imported from a
  // hospital is a MedicationRequest (what that hospital prescribed). The
  // `source` column is what tells them apart, and they are different claims.
  meds: [
    { resourceType: "MedicationStatement", description: "Medicines on your list" },
    { resourceType: "MedicationRequest", description: "Prescriptions sent to you by a hospital" },
  ],
  adherence: [
    {
      resourceType: "Observation",
      description: "Whether you have been taking your doses",
      criteria: `category=${"therapy"}`,
    },
  ],
  profile: [
    { resourceType: "Condition", description: "Conditions on your profile" },
    { resourceType: "AllergyIntolerance", description: "Allergies on your profile" },
  ],
  documents: [
    {
      resourceType: "DocumentReference",
      description: "Everything in your Health Vault, apart from anything archived",
      criteria: "status=current",
    },
    // 'documents' also opens qhin_record_provenance, which is where a record
    // retrieved from another network records where it came from. Omitting it
    // would understate the access, which is the dangerous direction for a
    // document whose job is to say what somebody can see.
    {
      resourceType: "Provenance",
      description: "Where records fetched from other hospitals came from",
    },
  ],
};

const INSTITUTION_FLAGS: Record<string, FlagTarget[]> = {
  vitals: CLINICIAN_FLAGS.vitals,
  medications: CLINICIAN_FLAGS.meds,
  conditions: [{ resourceType: "Condition", description: "Conditions on your profile" }],
  allergies: [{ resourceType: "AllergyIntolerance", description: "Allergies on your profile" }],
  documents: CLINICIAN_FLAGS.documents,
};

const FLAGS_BY_PATHWAY: Record<SharePathway, Record<string, FlagTarget[]>> = {
  clinician: CLINICIAN_FLAGS,
  institution: INSTITUTION_FLAGS,
};

/**
 * The flags each pathway's policies actually check.
 *
 * `supabase/tests/access_policy_projection.test.sql` reads the same sets out
 * of the live database — from policy expressions *and* from the bodies of the
 * definer functions, because two of them are only checked inside a function —
 * and fails if they disagree with these. A permission added to RLS without
 * being added here would leave the projection understating what a share opens.
 */
export const PERMISSION_FLAGS: Record<SharePathway, string[]> = {
  clinician: Object.keys(CLINICIAN_FLAGS).sort(),
  institution: Object.keys(INSTITUTION_FLAGS).sort(),
};

export interface PolicySubject {
  /** Whose record this is about. */
  patientUserId: string;
  /** The name the patient gave the share, which is how they will recognise it. */
  shareLabel: string;
  /**
   * Which share this is. Required rather than defaulted: the two pathways read
   * different keys, and guessing would produce a policy that describes a share
   * the patient never made.
   */
  pathway: SharePathway;
}

/**
 * Build the document.
 *
 * A permission that is absent is a permission that was not granted — the
 * consent model's `=== true` rule, not `!== false`, because silence is not
 * agreement.
 */
export function toAccessPolicy(
  permissions: SharePermissionsInput | null | undefined,
  subject: PolicySubject,
): AccessPolicyProjection {
  const granted = (permissions ?? {}) as Record<string, unknown>;
  const flags = FLAGS_BY_PATHWAY[subject.pathway];
  const entries: AccessPolicyResourceEntry[] = [];

  for (const flag of Object.keys(flags)) {
    if (granted[flag] !== true) continue;
    for (const target of flags[flag]) {
      entries.push({
        resourceType: target.resourceType,
        criteria: criteriaFor(target, subject.patientUserId),
        readonly: true,
        description: target.description,
      });
    }
  }

  return {
    resourceType: "AccessPolicy",
    name: subject.shareLabel,
    meta: {
      tag: [
        {
          system: PROJECTION_TAG_SYSTEM,
          code: "projection",
          display:
            "Generated from the share this describes. Access is enforced by database policy, not by this document.",
        },
      ],
    },
    resource: entries,
  };
}

/**
 * The criteria string, in the FHIR search syntax the repository already
 * speaks. Every one is scoped to the one patient — an entry without a patient
 * scope would read as "every patient", which is the opposite of what a share
 * is.
 */
function criteriaFor(target: FlagTarget, patientUserId: string): string {
  const base = `${target.resourceType}?patient=Patient/${patientUserId}`;
  return target.criteria ? `${base}&${target.criteria}` : base;
}

/**
 * The same thing in a sentence, for a patient rather than an auditor.
 *
 * An empty share is the case worth getting right: "nothing" has to be said
 * out loud, because a list with no items reads as a screen that failed to
 * load.
 */
export function describeAccessPolicy(policy: AccessPolicyProjection): string {
  if (policy.resource.length === 0) {
    return `${policy.name} can see nothing. Every permission on this share is off.`;
  }
  const unique = Array.from(new Set(policy.resource.map((r) => r.description)));
  const list =
    unique.length === 1
      ? unique[0].toLowerCase()
      : `${unique.slice(0, -1).map((u) => u.toLowerCase()).join(", ")} and ${unique[unique.length - 1].toLowerCase()}`;
  return `${policy.name} can see ${list}. They cannot change any of it.`;
}
