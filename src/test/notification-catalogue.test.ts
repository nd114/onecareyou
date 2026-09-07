import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_CATEGORIES,
  categoriesFor,
  findCategory,
  notificationAllowed,
} from "../../supabase/functions/_shared/notification-catalogue";

/**
 * The settings screen this replaces offered "email notifications" and "weekly
 * adherence report". No sender read the first; nothing has ever sent the
 * second. Both were controls over mail that did not exist. The invariant these
 * tests defend is that a category exists only if something sends it, and that
 * absence of a stored choice never silently mutes anybody.
 */

describe("the catalogue only describes what exists", () => {
  it("names a producer for every category", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(category.producer, `${category.key} has no producer`).toBeTruthy();
    }
  });

  it("offers at least one channel per category", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(category.channels.length, `${category.key} has no channel`).toBeGreaterThan(0);
    }
  });

  it("gives every mandatory category a reason a person can read", () => {
    for (const category of NOTIFICATION_CATEGORIES.filter((c) => c.mandatory)) {
      expect(category.mandatoryReason, `${category.key} is mandatory without saying why`).toBeTruthy();
    }
  });

  it("uses keys that are unique", () => {
    const keys = NOTIFICATION_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("who is offered what", () => {
  it("does not offer a clinician the patient's reminders", () => {
    expect(categoriesFor("clinician").map((c) => c.key)).not.toContain("medication_reminders");
  });

  it("does not offer a patient the clinician's threshold alerts", () => {
    expect(categoriesFor("patient").map((c) => c.key)).not.toContain("patient_vital_alert");
  });

  it("offers account and security to both", () => {
    expect(categoriesFor("patient").map((c) => c.key)).toContain("account_security");
    expect(categoriesFor("clinician").map((c) => c.key)).toContain("account_security");
  });
});

describe("what happens when nothing is stored", () => {
  it("falls back to the catalogue default, not to off", () => {
    // The trap this avoids: shipping a new category and silently muting mail
    // people already rely on, because no row existed for it yet.
    expect(notificationAllowed("care_circle_missed_doses", "email", null)).toBe(true);
    expect(notificationAllowed("medication_reminders", "push", undefined)).toBe(true);
  });

  it("honours an explicit choice", () => {
    expect(notificationAllowed("care_circle_missed_doses", "email", { enabled: false })).toBe(false);
  });
});

describe("what cannot be switched off", () => {
  it("keeps a clinician's threshold alerts on whatever is stored", () => {
    expect(notificationAllowed("patient_vital_alert", "email", { enabled: false })).toBe(true);
  });

  it("keeps account and security mail on whatever is stored", () => {
    expect(notificationAllowed("account_security", "email", { enabled: false })).toBe(true);
  });
});

describe("refusing what it does not understand", () => {
  it("says no to a category it does not describe", () => {
    // A sender asking about something the catalogue does not list is a bug.
    // Sending anyway would hide it.
    expect(notificationAllowed("marketing_blast", "email", null)).toBe(false);
    expect(findCategory("marketing_blast")).toBeUndefined();
  });

  it("says no to a channel the category cannot be delivered on", () => {
    // Medicine reminders are a device notification. There is no email behind
    // them, so a preference for one would be a promise nothing keeps.
    expect(notificationAllowed("medication_reminders", "email", { enabled: true })).toBe(false);
  });
});
