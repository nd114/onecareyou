import { isClinicalRole } from "@/lib/staff-roles";

/**
 * Who put a document in the patient's Vault, as the patient should read it.
 *
 * The label itself is stamped by the database at insert
 * (stamp_document_origin, 20261010140000) from the sender's role at that
 * moment; the client only displays it. It used to read "From your clinician"
 * for anything filed through Send to Vault, which called a hospital's front
 * desk the patient's clinician.
 */
export interface DocumentOriginFields {
  source_context?: string | null;
  origin_label?: string | null;
  origin_role?: string | null;
}

/**
 * Documents filed before the origin was recorded have no label. Who sent them
 * is known, but not whether they were a clinician at the time, so the
 * fallback claims neither.
 */
export const UNKNOWN_ORIGIN_LABEL = "From a clinic or clinician";

export function documentOriginLabel(doc: DocumentOriginFields): string | null {
  if (doc.origin_label) return doc.origin_label;
  if (doc.source_context === "clinician_upload") return UNKNOWN_ORIGIN_LABEL;
  return null;
}

/** Whether the sender acted as a clinician: decides the icon, never the words. */
export function documentOriginIsClinical(doc: DocumentOriginFields): boolean {
  return doc.origin_role === "private_clinician" || isClinicalRole(doc.origin_role);
}

/**
 * The categories a non-clinical member may file. Mirrors the allowlist in
 * stamp_document_origin; the database is the enforcement.
 */
export const NON_CLINICAL_DOCUMENT_CATEGORIES = ["insurance", "billing", "other"] as const;
