import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { caps } = vi.hoisted(() => ({ caps: { can: ((_: string) => true) as (c: string) => boolean, loading: false } }));

// The scribe is gated by plan; these tests are about the scribe itself, so the plan includes it.
vi.mock("@/hooks/useEntitlements", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useEntitlements")>()),
  useEntitlements: () => ({ entitlements: { tier: "pro", scribeIncluded: true }, isLoading: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "c1" } }) }));
vi.mock("@/hooks/useClinicianProfile", () => ({ useClinicianProfile: () => ({ isClinician: true }) }));
vi.mock("@/hooks/useAdminRole", () => ({ useAdminRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useClinicianCapabilities", () => ({ useClinicianCapabilities: () => caps }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn() }) }));

import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { buildQuickActions, matchQuickActions, buildDestinations, SCRIBE_LOCKED_REASON } from "@/lib/destinations";
import { CLINICIAN_PILLARS } from "@/lib/nav-ia";

beforeEach(() => {
  caps.can = () => true;
  caps.loading = false;
});

const renderNav = () =>
  render(
    <MemoryRouter initialEntries={["/clinician/today"]}>
      <MobileBottomNav />
    </MemoryRouter>,
  );

describe("scribe entry points", () => {
  it("bottom bar has a centre Start scribe action for clinicians with edit_clinical", () => {
    renderNav();
    const link = screen.getByRole("link", { name: /start scribe/i });
    expect(link).toHaveAttribute("href", "/clinician/scribe");
  });

  it("bottom bar explains instead of hiding when clinical access is missing", () => {
    caps.can = () => false;
    renderNav();
    expect(screen.queryByRole("link", { name: /start scribe/i })).toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(SCRIBE_LOCKED_REASON, "i") })).toBeInTheDocument();
  });

  it("shows nothing while capabilities are still loading (no locked flash)", () => {
    caps.can = () => false;
    caps.loading = true;
    renderNav();
    expect(screen.queryByRole("button", { name: /scribe/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /start scribe/i })).toBeNull();
  });

  it("palette quick action is offered with the capability and locked without it", () => {
    const ok = buildQuickActions({ can: () => true });
    expect(ok[0]).toMatchObject({ label: "Start scribe", to: "/clinician/scribe" });
    expect(ok[0].lockedReason).toBeUndefined();
    const locked = buildQuickActions({ can: () => false });
    expect(locked[0].lockedReason).toBe(SCRIBE_LOCKED_REASON);
    expect(buildQuickActions({ can: () => false, loading: true })).toEqual([]);
  });

  it("quick action matches scribe, record and visit note searches", () => {
    const a = buildQuickActions({ can: () => true });
    for (const q of ["scribe", "rec", "visit note"]) expect(matchQuickActions(a, q).map((x) => x.id)).toEqual(["start-scribe"]);
    expect(matchQuickActions(a, "invoice")).toHaveLength(0);
  });

  it("'Visit notes' is renamed Scribe without changing the route, and old words still find it", () => {
    const tabs = CLINICIAN_PILLARS.flatMap((p) => p.tabs);
    const tab = tabs.find((t) => t.to === "/clinician/scribe");
    expect(tab?.label).toBe("Scribe");
    expect(tabs.some((t) => t.label === "Visit notes")).toBe(false);
    const dest = buildDestinations({ audience: "clinician", can: () => true }).find((d) => d.to === "/clinician/scribe");
    expect(dest?.keywords).toContain("visit notes");
  });
  it("memo quick action and palette destination exist, and memo words do not match the scribe action", () => {
    const a = buildQuickActions({ can: () => true });
    const memo = a.find((x) => x.id === "voice-memos");
    expect(memo).toMatchObject({ label: "Voice memos", to: "/clinician/voice-memos" });
    expect(matchQuickActions(a, "memo").map((x) => x.id)).toEqual(["voice-memos"]);
    expect(matchQuickActions(a, "scribe").map((x) => x.id)).toEqual(["start-scribe"]);
    const dest = buildDestinations({ audience: "clinician", can: () => true }).find((d) => d.to === "/clinician/voice-memos");
    expect(dest).toBeTruthy();
    const tabs = CLINICIAN_PILLARS.flatMap((p) => p.tabs);
    expect(tabs.some((t) => t.to === "/clinician/voice-memos" && t.label === "Voice memos")).toBe(true);
  });
});
