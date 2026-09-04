import type { ResourceType } from "@medplum/fhirtypes";

import {
  acceptedShareKeys,
  shareGrants,
} from "../../../supabase/functions/_shared/share-permissions";

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
  /** The canonical set, used by both pathways since the vocabularies converged. */
  vitals?: boolean;
  medications?: boolean;
  adherence?: boolean;
  conditions?: boolean;
  allergies?: boolean;
  documents?: boolean;
  /** Older spellings, still honoured. `meds` meant medications; `profile` meant both lists. */
  meds?: boolean;
  profile?: boolean;
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
 * What a share opens, in one vocabulary.
 *
 * The two pathways used to name the same things differently — a clinician
 * share checked `meds` and `profile`, an institution share checked
 * `medications` and the separately-grantable `conditions` and `allergies` — so
 * a permissions object written for one granted nothing at all through the
 * other. `supabase/migrations/20260908100000_one_share_vocabulary.sql`
 * converged them: one canonical set, with the old spellings honoured as
 * aliases so nothing anybody already agreed to changes meaning.
 *
 * That collapses the `pathway` parameter this file used to need, which existed
 * only to say which vocabulary a share spoke. It stays in the type as a label
 * for *who* the share is with — a policy document should say whether it
 * describes a person or a hospital — but it no longer selects which keys are
 * read.
 */
export type SharePathway = "clinician" | "institution";

interface FlagTarget {
  resourceType: ResourceType;
  description: string;
  /** Extra search criteria beyond the patient scope. */
  criteria?: string;
}

/**
 * The canonical permissions, and the resources each opens.
 *
 * Kept in step with the database by
 * `supabase/tests/access_policy_projection.test.sql`, which reads the keys the
 * live policies and definer functions check and fails if they differ.
 */
const SHARE_FLAGS: Record<string, FlagTarget[]> = {
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
  // `source` column tells them apart, and they are different claims.
  medications: [
    { resourceType: "MedicationStatement", description: "Medicines on your list" },
    { resourceType: "MedicationRequest", description: "Prescriptions sent to you by a hospital" },
  ],
  // Its own grant on both pathways since the convergence. Whether somebody is
  // taking their medicine is a judgement about them rather than a record of
  // their care, and a hospital share naming medications used to carry it.
  adherence: [
    {
      resourceType: "Observation",
      description: "Whether you have been taking your doses",
      criteria: "category=therapy",
    },
  ],
  conditions: [{ resourceType: "Condition", description: "Conditions on your profile" }],
  allergies: [{ resourceType: "AllergyIntolerance", description: "Allergies on your profile" }],
  // Coarser than the two lists above, and still its own permission rather than
  // only an alias for them. RLS is row-level, so opening the profiles row on
  // the strength of 'conditions' would hand over everything else on it — name,
  // date of birth, blood type, contact details. The two lists are read without
  // that through get_patient_clinical_profile; this key is the whole row.
  profile: [
    {
      resourceType: "Patient",
      description: "Your profile — name, date of birth, blood type and contact details",
    },
  ],
  documents: [
    {
      resourceType: "DocumentReference",
      description: "Everything in your Health Vault, apart from anything archived",
      criteria: "status=current",
    },
    // 'documents' also opens qhin_record_provenance, where a record retrieved
    // from another network records where it came from. Omitting it would
    // understate the access, which is the dangerous direction for a document
    // whose job is to say what somebody can see.
    {
      resourceType: "Provenance",
      description: "Where records fetched from other hospitals came from",
    },
  ],
};

export const PERMISSION_FLAGS: string[] = Object.keys(SHARE_FLAGS).sort();

/** Every key a permissions object might legitimately carry, canonical or not. */
export const ACCEPTED_PERMISSION_KEYS: string[] = acceptedShareKeys();

/**
 * Whether a permissions object grants one permission.
 *
 * Delegates to the shared resolver so the browser, the edge functions and the
 * database cannot disagree about what a share opens. Read every permission
 * through this rather than by key: a share written with the canonical name
 * would otherwise look ungranted to code still checking the retired one, which
 * is how a Medications tab disappears for somebody who granted medications.
 */
export function grantsPermission(
  permissions: SharePermissionsInput | null | undefined,
  flag: string,
): boolean {
  return shareGrants(permissions as Record<string, unknown> | null | undefined, flag);
}


export interface PolicySubject {
  /** Whose record this is about. */
  patientUserId: string;
  /** The name the patient gave the share, which is how they will recognise it. */
  shareLabel: string;
  /**
   * Who the share is with. A label on the document rather than a switch: since
   * the vocabularies converged, both pathways read the same keys.
   */
  pathway?: SharePathway;
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
  const entries: AccessPolicyResourceEntry[] = [];

  for (const flag of Object.keys(SHARE_FLAGS)) {
    if (!grantsPermission(permissions, flag)) continue;
    for (const target of SHARE_FLAGS[flag]) {
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
