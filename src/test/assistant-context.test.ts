import { describe, expect, it } from "vitest";

import { assistantContextFor } from "@/lib/assistant-context";
import { PATIENT_PILLARS, getPatientPillarForRoute } from "@/lib/nav-ia";

/**
 * The assistant used to open with the same three starters everywhere —
 * "What is HbA1c?" on the bills page. These assert it opens knowing where the
 * person is, which is the difference between something that is with you and
 * something you have to brief.
 */
describe("the assistant knows what screen it was opened from", () => {
  it("offers questions about the screen, not about health in general", () => {
    expect(assistantContextFor("/billing").starters.join(" ")).toMatch(/charge|owe|bill/i);
    expect(assistantContextFor("/care-circle").starters.join(" ")).toMatch(/see my record|sharing|permission/i);
    expect(assistantContextFor("/medications").starters.join(" ")).toMatch(/interact|dose/i);
  });

  it("says where you are in words a patient would use", () => {
    expect(assistantContextFor("/care-circle").where).toBe("who can see your record");
    expect(assistantContextFor("/vitals").where).toBe("your readings");
  });

  it("keeps a parent's context on its sub-routes", () => {
    // /medications/add must not fall through to the general context. No two
    // prefixes in the table currently overlap, so this asserts inheritance —
    // the longest-prefix tie-break is defensive, for when they do.
    expect(assistantContextFor("/medications/add").where).toBe("your medications");
    expect(assistantContextFor("/medications/edit/123").where).toBe("your medications");
    expect(assistantContextFor("/medication-info/metformin").where).toBe("a medication");
    expect(assistantContextFor("/knowledge-base/diabetes").where).toBe("the health library");
  });

  it("falls back to something honest rather than something wrong", () => {
    const general = assistantContextFor("/some/route/we/never/added");
    expect(general.where).toBe("your record");
    expect(general.starters).toHaveLength(3);
  });

  it("offers exactly three openers everywhere — more reads as a menu", () => {
    const routes = ["/dashboard", "/vitals", "/medications", "/schedule", "/health-vault",
                    "/care-circle", "/messages", "/billing", "/adherence-report",
                    "/guidance", "/knowledge-base", "/settings", "/unknown"];
    for (const route of routes) {
      expect(assistantContextFor(route).starters, route).toHaveLength(3);
    }
  });

  it("covers every patient pillar's landing route", () => {
    // A pillar whose primary route has no context would open the assistant on
    // the generic starters at the very place someone is most likely to open it.
    for (const pillar of PATIENT_PILLARS) {
      expect(assistantContextFor(pillar.primary).where, pillar.primary).not.toBe("your record");
    }
  });
});

describe("the assistant is not a section of the app", () => {
  it("has no pillar of its own", () => {
    expect(PATIENT_PILLARS.map((p) => p.key)).not.toContain("ai");
  });

  it("leaves /ai highlighting nothing in the primary navigation", () => {
    expect(getPatientPillarForRoute("/ai")).toBeNull();
    expect(getPatientPillarForRoute("/ai/some-conversation-id")).toBeNull();
  });

  it("puts the health library under Learn, not under AI", () => {
    expect(getPatientPillarForRoute("/knowledge-base")).toBe("learn");
    expect(getPatientPillarForRoute("/medication-info/metformin")).toBe("learn");
  });

  it("keeps every other pillar where it was", () => {
    expect(getPatientPillarForRoute("/dashboard")).toBe("today");
    expect(getPatientPillarForRoute("/vitals")).toBe("health");
    expect(getPatientPillarForRoute("/care-circle")).toBe("team");
    expect(getPatientPillarForRoute("/billing")).toBe("team");
  });
});
