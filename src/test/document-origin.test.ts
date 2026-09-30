import { describe, expect, it } from "vitest";
import {
  documentOriginIsClinical,
  documentOriginLabel,
  UNKNOWN_ORIGIN_LABEL,
} from "@/lib/document-origin";
import { clinicianTierName } from "@/hooks/useClinicianSubscription";
import { PREMIUM_FEATURES, LANDING_PREMIUM_FEATURES } from "@/lib/pricing-constants";
import { FAMILY_HEALTH_ENABLED } from "@/lib/feature-flags";

describe("where a Vault document came from", () => {
  it("shows the origin the server stamped", () => {
    const doc = {
      source_context: "clinician_upload",
      origin_label: "From St Elsewhere General (front desk)",
      origin_role: "front_desk",
    };
    expect(documentOriginLabel(doc)).toBe("From St Elsewhere General (front desk)");
    expect(documentOriginIsClinical(doc)).toBe(false);
  });

  it("never calls an unlabelled older document 'your clinician'", () => {
    // Filed before the origin was recorded: the sender may have been front desk.
    const label = documentOriginLabel({ source_context: "clinician_upload", origin_label: null });
    expect(label).toBe(UNKNOWN_ORIGIN_LABEL);
    expect(label).not.toMatch(/your clinician/i);
  });

  it("says nothing about the patient's own uploads", () => {
    expect(documentOriginLabel({ source_context: "direct" })).toBeNull();
  });

  it("treats a private clinician and a clinical role as clinical", () => {
    expect(documentOriginIsClinical({ origin_role: "private_clinician" })).toBe(true);
    expect(documentOriginIsClinical({ origin_role: "nurse" })).toBe(true);
    expect(documentOriginIsClinical({ origin_role: "billing" })).toBe(false);
  });
});

describe("plan names", () => {
  it("shows the plans' names, not their stored keys", () => {
    expect(clinicianTierName("solo")).toBe("Individual");
    expect(clinicianTierName("pro")).toBe("Practice");
    expect(clinicianTierName("enterprise")).toBe("Enterprise");
    expect(clinicianTierName(null)).toBe("");
  });

  it("does not sell family profiles while family health is off", () => {
    const listed = [...PREMIUM_FEATURES, ...LANDING_PREMIUM_FEATURES].some((f) => /family/i.test(f));
    expect(listed).toBe(FAMILY_HEALTH_ENABLED);
  });
});
