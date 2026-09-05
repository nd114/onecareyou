import { describe, expect, it } from "vitest";

import { homeRouteFor, isPublicDoor } from "@/lib/home-route";

/**
 * The logo and Home both point at `/`, which rendered the marketing page — or
 * on a tenant subdomain a sign-up form — no matter who was looking at it. So a
 * signed-in patient clicking the logo was shown the front door of a building
 * they were already inside.
 */
describe("home, once you are signed in", () => {
  it("sends a patient to their own record", () => {
    expect(homeRouteFor({})).toBe("/dashboard");
  });

  it("sends a clinician to their working day, not a patient dashboard", () => {
    expect(homeRouteFor({ isClinician: true })).toBe("/clinician/today");
  });

  it("sends a hospital admin to the practice they run", () => {
    // Clinical work wins over administrative work: somebody running a clinic
    // sees patients every day and changes the billing currency twice a year.
    expect(homeRouteFor({ isTenantAdmin: true, isClinician: true })).toBe("/clinician/today");
  });

  it("still sends a non-clinical practice administrator to Practice", () => {
    // For a practice manager it is the daily work, not the occasional errand.
    expect(homeRouteFor({ isTenantAdmin: true })).toBe("/clinician/practice");
  });

  it("sends a platform admin to the console", () => {
    expect(homeRouteFor({ isAdmin: true })).toBe("/admin");
  });

  it("resolves the most specific role first", () => {
    // Someone can hold several. A platform admin who also sees patients
    // belongs on the console, not in a patient list.
    expect(homeRouteFor({ isAdmin: true, isTenantAdmin: true, isClinician: true })).toBe("/admin");
    expect(homeRouteFor({ isTenantAdmin: true, isClinician: true })).toBe("/clinician/today");
  });
});

describe("which routes a signed-in person is moved off", () => {
  it("moves them off the public doors", () => {
    for (const door of ["/", "/sign-in", "/sign-up", "/staff", "/clinician/sign-in"]) {
      expect(isPublicDoor(door), door).toBe(true);
    }
  });

  it("leaves every other public page readable", () => {
    // Wanting to re-read the privacy policy while signed in is not a mistake.
    for (const page of ["/about", "/pricing", "/privacy", "/terms", "/features", "/contact"]) {
      expect(isPublicDoor(page), page).toBe(false);
    }
  });

  it("does not match sub-paths of a door", () => {
    expect(isPublicDoor("/sign-up/clinician")).toBe(false);
  });
});
