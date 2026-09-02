import type { Communication } from "@medplum/fhirtypes";

/**
 * Assistant conversations as FHIR Communication.
 *
 * The reason this exists: a clinician's questions about a patient are part of
 * how that patient's care was arrived at, and they were sitting in a bespoke
 * chat table that nothing else could read. Mapped to Communication they export
 * with the rest of the record, carry the patient reference natively, and can be
 * reviewed alongside the notes they informed.
 *
 * `Communication` is the right resource rather than a stretch: FHIR defines it
 * as the transmission of information from a sender to a recipient, which is
 * what a message is, and it carries `subject` for who it concerns separately
 * from `sender` for who said it. That distinction is exactly the one that
 * matters here — a clinician asking about a patient is not the patient
 * communicating.
 *
 * What is deliberately not claimed: `about`, `encounter`, `reasonCode`. We know
 * a message concerned a patient because a record query resolved to them, not
 * that it concerned any particular encounter or clinical reason, and inventing
 * either would put structure into an exported record that nobody asserted.
 */

export interface AiMessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  patient_user_id?: string | null;
  created_at: string;
}

/** FHIR's completion statuses. A stored message has been sent, by definition. */
const COMPLETED = "completed" as const;

const CATEGORY = {
  coding: [
    {
      system: "http://terminology.hl7.org/CodeSystem/communication-category",
      code: "instruction",
      display: "Instruction",
    },
  ],
  text: "Clinical assistant conversation",
};

/**
 * One message as a Communication.
 *
 * Returns null for a message with nothing in it. An empty Communication is not
 * a record of anything, and exporting one would pad a patient's file with
 * things that were never said.
 */
export function toFhirCommunication(row: AiMessageRow): Communication | null {
  const text = (row.content ?? "").trim();
  if (!text) return null;

  const communication: Communication = {
    resourceType: "Communication",
    id: row.id,
    status: COMPLETED,
    category: [CATEGORY],
    sent: row.created_at,
    payload: [{ contentString: text }],
    // The thread this belongs to, so an export can be read in order rather than
    // as a pile of unrelated messages.
    identifier: [{ system: "urn:onecare:ai-conversation", value: row.conversation_id }],
  };

  // Who it is about, when it was about somebody. Absent is the normal case: a
  // general question concerns no patient and must not be filed under one.
  if (row.patient_user_id) {
    communication.subject = { reference: `Patient/${row.patient_user_id}` };
  }

  // Who said it. The assistant is a Device, not a Practitioner — it holds no
  // licence and attributing its words to a clinician would misrepresent who
  // made a clinical statement.
  if (row.role === "assistant") {
    communication.sender = { display: "OneCare Clinical Assistant" };
  } else {
    communication.sender = { reference: `Practitioner/${row.user_id}` };
  }

  return communication;
}

/**
 * A conversation as a FHIR Bundle, for export.
 *
 * A `collection`, like the vitals export: these are records being handed over,
 * not a transaction. No `total` — bdl-1 allows it only on a searchset or a
 * history, which a collection is neither, and getting that wrong makes the
 * whole file invalid rather than the one field.
 */
export function toFhirCommunicationBundle(rows: AiMessageRow[]) {
  const entries = rows
    .map(toFhirCommunication)
    .filter((c): c is Communication => c !== null)
    .map((resource) => ({
      ...(resource.id ? { fullUrl: `urn:uuid:${resource.id}` } : {}),
      resource,
    }));

  return {
    resourceType: "Bundle" as const,
    type: "collection" as const,
    timestamp: new Date().toISOString(),
    entry: entries,
  };
}

/** Messages about one patient, oldest first. Used to file a thread. */
export function messagesAboutPatient(
  rows: AiMessageRow[],
  patientUserId: string,
): AiMessageRow[] {
  return rows
    .filter((r) => r.patient_user_id === patientUserId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
