import { useClinicianPatientRecords, type ClinicianPatientRecord } from "@/hooks/useClinicianPatientRecords";
import { resolvePatient } from "@/lib/ai-record-query";
import { RecordCards } from "./RecordCards";
import type { ChatMessage } from "@/hooks/useAIChat";

/**
 * Records an assistant message asked to display.
 *
 * The name-to-patient step happens here, against the panel this clinician has
 * already loaded — which means a name they cannot reach resolves to nothing and
 * no query is made at all. Even if one were, the row policies would return
 * nothing; this is the earlier of two refusals, not the only one.
 *
 * resolvePatient returns null when a name could mean two people, so an ambiguous
 * request says so rather than picking one. Showing the wrong patient's readings
 * confidently is the failure worth designing against.
 */
export function MessageRecordCards({ message }: { message: ChatMessage }) {
  const { records } = useClinicianPatientRecords();
  const queries = message.recordQueries;

  if (!queries || queries.length === 0) return null;

  // linked_user_id, not patient_user_id: a managed record only points at a real
  // account once the patient has joined and linked. Records without one are
  // deliberately excluded — there is nothing to fetch for them, and matching a
  // name to a record that cannot be queried would produce an empty card that
  // looks like "no readings" rather than "not linked yet".
  const panel = (records ?? [])
    .filter((r: ClinicianPatientRecord) => !!r.linked_user_id)
    .map((r: ClinicianPatientRecord) => ({
      user_id: r.linked_user_id as string,
      patient_name: r.patient_name,
    }));

  const unlinked = (records ?? []).filter((r: ClinicianPatientRecord) => !r.linked_user_id);

  return (
    <>
      {queries.map((query, i) => {
        const patient = resolvePatient(query.patientName, panel);

        if (!patient?.user_id) {
          // Distinguish "not linked yet" from "could not tell who you meant".
          // They call for different things from the clinician.
          const notLinked = resolvePatient(query.patientName, unlinked.map((r) => ({
            user_id: r.id,
            patient_name: r.patient_name,
          })));

          return (
            <p key={i} className="mt-3 text-sm text-muted-foreground">
              {notLinked
                ? `${notLinked.patient_name} has not joined and linked their account yet, so there are no live records to show.`
                : query.patientName
                  ? `I could not tell which patient "${query.patientName}" means — open them from your list and ask again.`
                  : "I need to know which patient you mean."}
            </p>
          );
        }

        return (
          <RecordCards
            key={i}
            query={query}
            patientUserId={patient.user_id}
            patientName={patient.patient_name ?? undefined}
          />
        );
      })}
    </>
  );
}
