import { describe, expect, it } from "vitest";

import {
  LEGACY_ANCHOR_SECTIONS,
  PRACTICE_SECTIONS,
  availableSections,
  findSection,
  sectionForLegacyAnchor,
  type PracticeContext,
} from "@/lib/practice-sections";
import { CLINICIAN_PILLARS, getActiveNavTab, getClinicianPillarForRoute } from "@/lib/nav-ia";

const soloClinician: PracticeContext = {
  hasPractice: false,
  isHospital: false,
  isAdmin: false,
  canManageTeam: false,
};

const practiceOwner: PracticeContext = {
  hasPractice: true,
  isHospital: false,
  isAdmin: true,
  canManageTeam: true,
};

const hospitalOwner: PracticeContext = {
  hasPractice: true,
  isHospital: true,
  isAdmin: true,
  canManageTeam: true,
};

describe("which sections are offered", () => {
  it("never offers a section with nothing behind it", () => {
    // A link to a blank page is worse than the fifteen-card pile it replaced,
    // and nearly every card on the old page hid itself under some condition.
    for (const context of [soloClinician, practiceOwner, hospitalOwner]) {
      expect(availableSections(context).length).toBeGreaterThan(0);
    }
  });

  it("hides the practice-shaped sections from somebody with no practice", () => {
    const ids = availableSections(soloClinician).map((s) => s.id);
    expect(ids).not.toContain("people");
    expect(ids).not.toContain("details");
  });

  it("still gives them the two that stand alone", () => {
    // A clinician with no practice still has a subscription and can still
    // connect an EHR, so those pages are never empty for anybody.
    expect(availableSections(soloClinician).map((s) => s.id)).toEqual(["access", "plan"]);
  });

  it("gives a practice owner all four", () => {
    expect(availableSections(practiceOwner)).toHaveLength(4);
    expect(availableSections(hospitalOwner)).toHaveLength(4);
  });

  it("keeps them in the same order however many are shown", () => {
    // The order is how often you touch them, so it should not shuffle when a
    // section drops out.
    const all = PRACTICE_SECTIONS.map((s) => s.id);
    const some = availableSections(soloClinician).map((s) => s.id);
    expect(some).toEqual(all.filter((id) => some.includes(id)));
  });
});

describe("the sections themselves", () => {
  it("gives every one a path under practice", () => {
    for (const section of PRACTICE_SECTIONS) {
      expect(section.path).toBe(`/clinician/practice/${section.id}`);
    }
  });

  it("says what is behind each link, in a sentence", () => {
    // The hub is only useful if you can tell which one you want without
    // opening all four.
    for (const section of PRACTICE_SECTIONS) {
      expect(section.summary.length).toBeGreaterThan(20);
      expect(section.summary.endsWith(".")).toBe(true);
    }
  });

  it("has no two sections claiming the same id or label", () => {
    expect(new Set(PRACTICE_SECTIONS.map((s) => s.id)).size).toBe(PRACTICE_SECTIONS.length);
    expect(new Set(PRACTICE_SECTIONS.map((s) => s.label)).size).toBe(PRACTICE_SECTIONS.length);
  });

  it("finds a section by id, and nothing by a name that is not one", () => {
    expect(findSection("people")?.label).toBe("People");
    expect(findSection("nonsense")).toBeUndefined();
    expect(findSection(undefined)).toBeUndefined();
  });
});

describe("the anchors the old page used", () => {
  it("lands every one of them somewhere real", () => {
    // Nothing in the app links to these any more, but a bookmark is a real
    // thing, and landing on a page that no longer has your section is a bad
    // way to find out it moved.
    for (const [anchor, id] of Object.entries(LEGACY_ANCHOR_SECTIONS)) {
      const section = sectionForLegacyAnchor(anchor);
      expect(section, `anchor #${anchor} maps to nothing`).toBeDefined();
      expect(section?.id).toBe(id);
    }
  });

  it("accepts the anchor with or without its hash", () => {
    expect(sectionForLegacyAnchor("#departments")?.id).toBe("people");
    expect(sectionForLegacyAnchor("departments")?.id).toBe("people");
  });

  it("does not invent a destination for an anchor it does not know", () => {
    expect(sectionForLegacyAnchor("#something-else")).toBeUndefined();
  });

  it("accounts for every card the old page carried", () => {
    // Thirteen anchored sections plus the two invitation cards, which were
    // never anchored because they are actions rather than settings.
    expect(Object.keys(LEGACY_ANCHOR_SECTIONS)).toHaveLength(13);
  });
});

describe("where the sub-pages sit in the navigation", () => {
  const practiceTabs = CLINICIAN_PILLARS.find((p) => p.key === "practice")!.tabs;

  it("keeps Overview highlighted on every section page", () => {
    // Otherwise going into People un-highlights Practice entirely and the
    // clinician loses their place in the app.
    for (const section of PRACTICE_SECTIONS) {
      expect(getActiveNavTab(practiceTabs, section.path)?.to).toBe("/clinician/practice");
    }
  });

  it("keeps the Practice pillar itself selected", () => {
    for (const section of PRACTICE_SECTIONS) {
      expect(getClinicianPillarForRoute(section.path)).toBe("practice");
    }
  });

  it("does not steal the highlight from Reports or Compliance", () => {
    expect(getActiveNavTab(practiceTabs, "/clinician/reports")?.to).toBe("/clinician/reports");
    expect(getActiveNavTab(practiceTabs, "/clinician/compliance")?.to).toBe("/clinician/compliance");
  });
});
