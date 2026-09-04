import { describe, expect, it } from "vitest";

import {
  maskEmail,
  maskPhone,
  normaliseDate,
  normaliseEmail,
  normaliseName,
  normalisePhone,
  resolveMatches,
  safeDescriptor,
  scoreCandidate,
  type ManagedRecordDetails,
} from "@/lib/identity-match";

/**
 * The asymmetry that shapes every assertion here: a missed match is somebody
 * asking why they cannot see their records. A false match hands one person's
 * medical history to another. These are written to catch the second.
 */

const RECORD: ManagedRecordDetails = {
  id: "rec-1",
  name: "Jane Evans",
  email: "jane.evans@example.com",
  phone: "+234 801 234 5678",
  dateOfBirth: "1984-03-12",
};

describe("normalising, which is where false matches are actually made", () => {
  it("treats case and spacing as noise on an email", () => {
    expect(normaliseEmail("  Jane.Evans@Example.COM ")).toBe("jane.evans@example.com");
  });

  it("does not apply one provider's alias rules everywhere", () => {
    // Gmail ignores dots. Most domains do not, and stripping them would make
    // two different people at the same company into one.
    expect(normaliseEmail("a.b@example.com")).not.toBe(normaliseEmail("ab@example.com"));
  });

  it("rejects a string that is not an address at all", () => {
    expect(normaliseEmail("not-an-email")).toBeNull();
    expect(normaliseEmail("")).toBeNull();
    expect(normaliseEmail(null)).toBeNull();
  });

  it("reads one phone number written several ways as one number", () => {
    const forms = ["+234 801 234 5678", "0801-234-5678", "00234 801 234 5678", "(801) 234 5678"];
    const normalised = new Set(forms.map(normalisePhone));
    expect(normalised.size).toBe(1);
  });

  it("refuses a phone number too short to identify anyone", () => {
    expect(normalisePhone("1234")).toBeNull();
    expect(normalisePhone("")).toBeNull();
  });

  it("reads a name the same however a system wrote it", () => {
    expect(normaliseName("Evans, Jane")).toBe(normaliseName("jane evans"));
    expect(normaliseName("Dr. Jane Evans")).toBe(normaliseName("Jane Evans"));
  });

  it("does not confuse two different names", () => {
    expect(normaliseName("Jane Evans")).not.toBe(normaliseName("Jane Evanson"));
  });

  it("compares a date to a timestamp on the date", () => {
    expect(normaliseDate("1984-03-12T00:00:00.000Z")).toBe("1984-03-12");
    expect(normaliseDate("1984-03-12")).toBe("1984-03-12");
  });
});

describe("how confident a single candidate is", () => {
  it("calls an email match exact", () => {
    const result = scoreCandidate(RECORD, { email: "JANE.EVANS@example.com" });
    expect(result.strength).toBe("exact");
    expect(result.signals.email).toBe(true);
  });

  it("calls phone plus name strong, without an email", () => {
    const result = scoreCandidate(RECORD, { phone: "0801 234 5678", name: "Jane Evans" });
    expect(result.strength).toBe("strong");
  });

  it("calls phone plus date of birth strong", () => {
    expect(scoreCandidate(RECORD, { phone: "0801-234-5678", dateOfBirth: "1984-03-12" }).strength)
      .toBe("strong");
  });

  it("never calls a name alone more than weak", () => {
    // Families share surnames, and "John Smith" is not an identifier.
    expect(scoreCandidate(RECORD, { name: "Jane Evans" }).strength).toBe("weak");
  });

  it("finds nothing when nothing matches", () => {
    expect(scoreCandidate(RECORD, { email: "someone.else@example.com", name: "Tom Reyes" }).strength)
      .toBe("none");
  });

  it("explains itself in words a person can check", () => {
    const result = scoreCandidate(RECORD, { email: "jane.evans@example.com", name: "Jane Evans" });
    expect(result.reasons).toContain("The email address matches yours.");
    expect(result.reasons).toContain("The name matches yours.");
  });
});

describe("choosing between candidates", () => {
  const CONFIRMED = { emailConfirmed: true };

  const otherPractice: ManagedRecordDetails = {
    // Same person, second clinic. This is the ordinary case.
    id: "rec-2", name: "Jane Evans", email: "jane.evans@example.com",
    phone: null, dateOfBirth: "1984-03-12",
  };

  it("links every clinic that holds a record for the same confirmed address", () => {
    // A person sees a GP and a cardiologist and both hold a record. Refusing
    // to link when more than one matched would leave exactly the people with
    // the most records — those seeing several clinicians — with none linked.
    const outcome = resolveMatches([RECORD, otherPractice], {
      ...CONFIRMED, email: "jane.evans@example.com", name: "Jane Evans",
    });
    expect(outcome.autoLink.map((c) => c.recordId).sort()).toEqual(["rec-1", "rec-2"]);
    expect(outcome.held).toBeUndefined();
  });

  it("links nothing on an email nobody has proved they control", () => {
    // Whether Supabase demands confirmation is a dashboard setting the app
    // cannot read, so the check lives here rather than being assumed.
    const outcome = resolveMatches([RECORD], { email: "jane.evans@example.com" });
    expect(outcome.autoLink).toEqual([]);
    expect(outcome.held).toMatch(/confirm your email/i);
    expect(outcome.propose).toHaveLength(1);
  });

  it("holds when records on one address describe different people", () => {
    // Two clinics holding "jane.evans@example.com" for a Jane Evans and a Tom
    // Reyes is a data error somewhere, and linking both hands somebody
    // another person's history.
    const someoneElse: ManagedRecordDetails = {
      id: "rec-9", name: "Tom Reyes", email: "jane.evans@example.com",
      phone: null, dateOfBirth: "1971-11-02",
    };
    const outcome = resolveMatches([RECORD, someoneElse], {
      ...CONFIRMED, email: "jane.evans@example.com",
    });
    expect(outcome.autoLink).toEqual([]);
    expect(outcome.held).toMatch(/different people/i);
  });

  it("does not treat a missing name or date of birth as a conflict", () => {
    // Half the clinics will not have recorded a date of birth. Absence is not
    // disagreement.
    const sparse: ManagedRecordDetails = {
      id: "rec-8", name: null, email: "jane.evans@example.com", phone: null, dateOfBirth: null,
    };
    const outcome = resolveMatches([RECORD, sparse], {
      ...CONFIRMED, email: "jane.evans@example.com",
    });
    expect(outcome.autoLink).toHaveLength(2);
  });

  it("never links automatically on anything short of an email", () => {
    const outcome = resolveMatches([RECORD], {
      ...CONFIRMED, phone: "0801 234 5678", name: "Jane Evans", dateOfBirth: "1984-03-12",
    });
    expect(outcome.autoLink).toEqual([]);
    expect(outcome.propose[0].strength).toBe("strong");
  });

  it("proposes the weaker matches alongside the linked ones", () => {
    const weak: ManagedRecordDetails = {
      id: "rec-4", name: "Jane Evans", email: null, phone: null, dateOfBirth: null,
    };
    const outcome = resolveMatches([weak, RECORD], {
      ...CONFIRMED, email: "jane.evans@example.com", name: "Jane Evans",
    });
    expect(outcome.autoLink.map((c) => c.recordId)).toEqual(["rec-1"]);
    expect(outcome.propose.map((c) => c.recordId)).toEqual(["rec-4"]);
  });

  it("proposes nothing when nothing matches", () => {
    const outcome = resolveMatches([RECORD], { ...CONFIRMED, email: "nobody@example.com" });
    expect(outcome.autoLink).toEqual([]);
    expect(outcome.propose).toEqual([]);
  });
});

describe("what the confirmation screen may show", () => {
  it("shows nothing clinical", () => {
    // If the answer is "no, that is not me", everything on the screen has
    // already been shown to the wrong person.
    const descriptor = safeDescriptor({
      ...RECORD,
      // Fields a managed record carries that must never appear here.
    } as ManagedRecordDetails);
    expect(Object.keys(descriptor).sort()).toEqual(["email", "name", "phone"]);
  });

  it("masks the email so the screen confirms rather than reveals", () => {
    expect(maskEmail("jane.evans@example.com")).toBe("j•••••••••@example.com");
  });

  it("masks the phone to the last four", () => {
    expect(maskPhone("+234 801 234 5678")).toBe("•••••••••5678");
  });

  it("returns nothing rather than a misleading mask for unusable input", () => {
    expect(maskEmail("not-an-email")).toBeNull();
    expect(maskPhone("12")).toBeNull();
  });
});
