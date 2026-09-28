import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { describeNotification } from "@/lib/notification-display";
import { NOTIFICATION_CATEGORIES } from "../../supabase/functions/_shared/notification-catalogue";

/**
 * Share-ended and routing notices carry words the database wrote at the moment
 * of the event. The bell used to word every row itself, from a guidance title
 * and the patient's profile name — both of which are absent for these, and the
 * second of which a clinician can no longer read once the patient has stopped
 * sharing. Worded locally they would read "Guidance Update / Update from
 * Patient", which says nothing happened.
 */
describe("server-written notices are shown as written", () => {
  it("shows the stopped-sharing message, and goes nowhere on click", () => {
    const shown = describeNotification({
      notification_type: "share_ended",
      message: "Ada L. stopped sharing with you, so no further updates will be transmitted.",
    });
    expect(shown.body).toBe("Ada L. stopped sharing with you, so no further updates will be transmitted.");
    expect(shown.title).not.toMatch(/guidance/i);
    // The patient's record is closed to them now; linking to it would be a dead end.
    expect(shown.href).toBeNull();
    expect(shown.acknowledgeable).toBe(false);
  });

  it("offers Acknowledge on a routing notice until it is acknowledged", () => {
    const open = describeNotification({
      notification_type: "routed_outside_department",
      message: "Lena Lead, who leads Renal, routed Ben O. into Renal.",
      acknowledged_at: null,
    });
    expect(open.acknowledgeable).toBe(true);
    expect(open.body).toContain("Ben O.");

    const done = describeNotification({
      notification_type: "routed_outside_department",
      message: "Lena Lead, who leads Renal, routed Ben O. into Renal.",
      acknowledged_at: "2026-10-10T10:00:00Z",
    });
    expect(done.acknowledgeable).toBe(false);
    expect(done.title).toMatch(/acknowledged/i);
  });

  it("still words the guidance notices it always did", () => {
    const shown = describeNotification({
      notification_type: "completed",
      guidance: { title: "Walk daily" },
      patient_profile: { name: "Ada Lovelace" },
    });
    expect(shown.title).toBe("Walk daily");
    expect(shown.body).toBe("Ada Lovelace completed your guidance");
  });
});

describe("the two lists of what cannot be muted agree", () => {
  it("marks the same categories mandatory in code and in notification_is_mandatory()", () => {
    // The patient is told the clinician will learn they stopped sharing. If the
    // database let a stored preference suppress that while the settings screen
    // said it could not be switched off, one of them would be lying.
    const migrations = path.resolve(__dirname, "../../supabase/migrations");
    const latest = fs
      .readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => fs.readFileSync(path.join(migrations, f), "utf8"))
      .filter((sql) => sql.includes("FUNCTION public.notification_is_mandatory("))
      .pop()!;
    const body = latest.slice(latest.indexOf("FUNCTION public.notification_is_mandatory("));
    const inList = body.slice(body.indexOf("IN ("), body.indexOf(");"));
    const sqlKeys = [...inList.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const codeKeys = NOTIFICATION_CATEGORIES.filter((c) => c.mandatory).map((c) => c.key).sort();
    expect(sqlKeys).toEqual(codeKeys);
  });
});
