import { describe, it, expect } from "vitest";
import {
  messagesAboutPatient,
  toFhirCommunication,
  toFhirCommunicationBundle,
  type AiMessageRow,
} from "@/lib/fhir/communication";
import { validateFhir } from "@/lib/fhir/validate";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const OTHER = "33333333-3333-3333-3333-333333333333";
const CLINICIAN = "22222222-2222-2222-2222-222222222222";

const ask: AiMessageRow = {
  id: "m1",
  conversation_id: "c1",
  user_id: CLINICIAN,
  role: "user",
  content: "What has her HbA1c been doing?",
  patient_user_id: PATIENT,
  created_at: "2026-09-01T10:00:00.000Z",
};

const answer: AiMessageRow = {
  ...ask,
  id: "m2",
  role: "assistant",
  content: "The last three are trending up.",
  created_at: "2026-09-01T10:00:05.000Z",
};

describe("toFhirCommunication", () => {
  it("produces a resource that validates against FHIR R4", () => {
    expect(() => validateFhir(toFhirCommunication(ask)!)).not.toThrow();
    expect(() => validateFhir(toFhirCommunication(answer)!)).not.toThrow();
  });

  it("carries what was said, as payload", () => {
    expect(toFhirCommunication(ask)!.payload?.[0].contentString).toBe(
      "What has her HbA1c been doing?",
    );
  });

  it("names who it is about, separately from who said it", () => {
    // The distinction that matters: a clinician asking about a patient is not
    // the patient communicating.
    const c = toFhirCommunication(ask)!;
    expect(c.subject?.reference).toBe(`Patient/${PATIENT}`);
    expect(c.sender?.reference).toBe(`Practitioner/${CLINICIAN}`);
  });

  it("does not attribute the assistant's words to a clinician", () => {
    // It holds no licence. Filing its output under a practitioner would
    // misrepresent who made a clinical statement.
    const c = toFhirCommunication(answer)!;
    expect(c.sender?.reference).toBeUndefined();
    expect(c.sender?.display).toBe("OneCare Clinical Assistant");
  });

  it("files a general question under nobody", () => {
    // Absent is the normal case, and a question about no patient must not land
    // in somebody's record.
    const general = { ...ask, patient_user_id: null, content: "How do I export vitals?" };
    expect(toFhirCommunication(general)!.subject).toBeUndefined();
  });

  it("keeps the thread it belongs to, so an export reads in order", () => {
    expect(toFhirCommunication(ask)!.identifier?.[0].value).toBe("c1");
  });

  it("returns null for an empty message rather than padding the record", () => {
    expect(toFhirCommunication({ ...ask, content: "" })).toBeNull();
    expect(toFhirCommunication({ ...ask, content: "   " })).toBeNull();
  });

  it("claims no encounter or reason, because none was asserted", () => {
    const c = toFhirCommunication(ask)!;
    expect(c.encounter).toBeUndefined();
    expect(c.reasonCode).toBeUndefined();
    expect(c.about).toBeUndefined();
  });
});

describe("toFhirCommunicationBundle", () => {
  it("validates as a Bundle, not only as the messages inside it", () => {
    // The lesson from the vitals export: an invalid envelope makes the whole
    // file unusable however good its contents.
    expect(() => validateFhir(toFhirCommunicationBundle([ask, answer]))).not.toThrow();
  });

  it("carries no total, which bdl-1 forbids on a collection", () => {
    expect((toFhirCommunicationBundle([ask]) as { total?: number }).total).toBeUndefined();
  });

  it("drops empty messages instead of failing the export", () => {
    const bundle = toFhirCommunicationBundle([ask, { ...answer, content: "  " }]);
    expect(bundle.entry).toHaveLength(1);
  });

  it("produces a valid empty bundle for a conversation with nothing in it", () => {
    const empty = toFhirCommunicationBundle([]);
    expect(empty.entry).toHaveLength(0);
    expect(() => validateFhir(empty)).not.toThrow();
  });
});

describe("messagesAboutPatient", () => {
  it("takes only the messages about that patient", () => {
    const mixed = [ask, { ...answer, patient_user_id: OTHER }, answer];
    expect(messagesAboutPatient(mixed, PATIENT).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("ignores messages about nobody", () => {
    const mixed = [ask, { ...answer, patient_user_id: null }];
    expect(messagesAboutPatient(mixed, PATIENT)).toHaveLength(1);
  });

  it("returns them oldest first, so a thread reads forwards", () => {
    const shuffled = [answer, ask];
    expect(messagesAboutPatient(shuffled, PATIENT).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
