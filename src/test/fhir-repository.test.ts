import { describe, it, expect } from "vitest";
import { FhirRouter } from "@medplum/fhir-router";
import { MedplumClient } from "@medplum/core";
import { createFhirFetch, SupabaseFhirRepository, type SupabaseLike } from "@/lib/fhir/repository";
import { toAppointmentRow } from "@/lib/fhir/appointment";
import { validateFhir } from "@/lib/fhir/validate";

/**
 * Their router parses the url itself and *refuses* a request that also carries a
 * pathname — worth knowing, because supplying both is the obvious thing to do
 * and it throws on every call.
 */
function fhirRequest(method: string, url: string) {
  return { method, url, params: {}, query: {}, body: undefined } as never;
}

const PATIENT = "11111111-1111-1111-1111-111111111111";
const OTHER = "33333333-3333-3333-3333-333333333333";
const CLINICIAN = "22222222-2222-2222-2222-222222222222";

/**
 * A stand-in for supabase-js that records the query it was asked to run.
 *
 * The point is not to reimplement Postgres. It is to prove that a FHIR REST
 * request arriving at Medplum's router comes out as the right query against our
 * table — and, crucially, that the filter reaches the database rather than being
 * applied in JavaScript after the rows come back. Access is decided by RLS on
 * the real thing; a filter that never reaches Postgres is a filter RLS cannot
 * help with.
 */
function fakeSupabase(rows: Record<string, unknown>[]) {
  const calls: { table: string; eq: [string, unknown][]; limit?: number }[] = [];

  const from = (table: string) => {
    const call = { table, eq: [] as [string, unknown][], limit: undefined as number | undefined };
    calls.push(call);

    const builder: any = {
      select: () => builder,
      insert: (row: unknown) => {
        call.eq.push(["__insert", row]);
        return builder;
      },
      update: (row: unknown) => {
        call.eq.push(["__update", row]);
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.eq.push([column, value]);
        return builder;
      },
      limit: (n: number) => {
        call.limit = n;
        return builder;
      },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => {
        const filters = call.eq.filter(([c]) => !c.startsWith("__"));
        const match = rows.find((r) => filters.every(([c, v]) => r[c] === v));
        return { data: match ?? null, error: null };
      },
      then: (resolve: (r: unknown) => void) => {
        const filters = call.eq.filter(([c]) => !c.startsWith("__"));
        const matched = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
        return Promise.resolve({ data: matched, error: null }).then(resolve);
      },
    };
    return builder;
  };

  return { supabase: { from } as SupabaseLike, calls };
}

function row(overrides: Record<string, unknown> = {}) {
  const base = toAppointmentRow(
    {
      patientUserId: PATIENT,
      clinicianUserId: CLINICIAN,
      status: "booked",
      start: "2026-09-10T09:00:00.000Z",
      end: "2026-09-10T09:30:00.000Z",
      description: "Six-month diabetes review",
    },
    CLINICIAN,
  );
  return { id: "appt-1", created_at: "", updated_at: "", ...base, ...overrides };
}

describe("Medplum's router over our database", () => {
  it("serves GET /Appointment/:id as a real FHIR resource", async () => {
    // The whole argument for the adapter, in one assertion: their router, our
    // Postgres, no Medplum server anywhere.
    const { supabase } = fakeSupabase([row()]);
    const router = new FhirRouter();
    const repo = new SupabaseFhirRepository(supabase);

    const [outcome, resource] = await router.handleRequest(
      fhirRequest("GET", "/Appointment/appt-1"),
      repo,
    );

    expect(outcome.issue?.[0].code).toBe("informational");
    expect((resource as any).resourceType).toBe("Appointment");
    expect(() => validateFhir(resource as any)).not.toThrow();
  });

  it("serves a search as a searchset bundle", async () => {
    const { supabase } = fakeSupabase([row(), row({ id: "appt-2", patient_user_id: OTHER })]);
    const router = new FhirRouter();
    const repo = new SupabaseFhirRepository(supabase);

    const [, bundle] = await router.handleRequest(
      fhirRequest("GET", `/Appointment?patient=Patient/${PATIENT}`),
      repo,
    );

    expect((bundle as any).type).toBe("searchset");
    expect((bundle as any).entry).toHaveLength(1);
    expect((bundle as any).entry[0].resource.resourceType).toBe("Appointment");
  });

  it("pushes the filter into the query rather than filtering after the fact", async () => {
    // This is the assertion that matters for safety. If the filter were applied
    // in JavaScript, every row the policy allows would cross the wire first and
    // a bug in this file would show one patient another's list. It has to reach
    // Postgres.
    const { supabase, calls } = fakeSupabase([row()]);
    const repo = new SupabaseFhirRepository(supabase);

    await repo.search({
      resourceType: "Appointment",
      filters: [{ code: "patient", operator: "eq" as never, value: `Patient/${PATIENT}` }],
    });

    expect(calls[0].table).toBe("fhir_appointments");
    expect(calls[0].eq).toContainEqual(["patient_user_id", PATIENT]);
  });

  it("accepts a bare id as well as a typed reference", async () => {
    const { supabase, calls } = fakeSupabase([row()]);
    const repo = new SupabaseFhirRepository(supabase);
    await repo.search({
      resourceType: "Appointment",
      filters: [{ code: "patient", operator: "eq" as never, value: PATIENT }],
    });
    expect(calls[0].eq).toContainEqual(["patient_user_id", PATIENT]);
  });

  it("refuses a search parameter it cannot serve instead of ignoring it", async () => {
    // Silently dropping an unsupported filter returns everything the policy
    // allows while the caller believes it is filtered. Refusing is the only
    // safe answer.
    const { supabase } = fakeSupabase([row()]);
    const repo = new SupabaseFhirRepository(supabase);

    await expect(
      repo.search({
        resourceType: "Appointment",
        filters: [{ code: "location", operator: "eq" as never, value: "x" }],
      }),
    ).rejects.toThrow(/not supported/i);
  });

  it("refuses a resource type it does not serve", async () => {
    const { supabase } = fakeSupabase([]);
    const repo = new SupabaseFhirRepository(supabase);
    await expect(repo.readResource("Patient", "x")).rejects.toThrow(/not served/i);
  });

  it("gives the same answer for absent and not-yours", async () => {
    // A client must not be able to tell a missing appointment from one a row
    // policy declined, or the repository becomes an existence oracle.
    const { supabase } = fakeSupabase([]);
    const repo = new SupabaseFhirRepository(supabase);
    await expect(repo.readResource("Appointment", "nope")).rejects.toThrow();
  });

  it("refuses delete, because the table does", async () => {
    const { supabase } = fakeSupabase([row()]);
    const repo = new SupabaseFhirRepository(supabase);
    await expect(repo.deleteResource("Appointment", "appt-1")).rejects.toThrow(/cancelled by status/i);
  });

  it("refuses history and patch rather than pretending", async () => {
    const { supabase } = fakeSupabase([row()]);
    const repo = new SupabaseFhirRepository(supabase);
    await expect(repo.readHistory("Appointment", "appt-1")).rejects.toThrow();
    await expect(repo.patchResource("Appointment", "appt-1", [] as never)).rejects.toThrow();
  });

  it("writes through the mapper, so the resource and columns cannot drift", async () => {
    const { supabase, calls } = fakeSupabase([row()]);
    const repo = new SupabaseFhirRepository(supabase);

    await repo.createResource({
      resourceType: "Appointment",
      status: "booked",
      start: "2026-09-10T09:00:00.000Z",
      end: "2026-09-10T09:30:00.000Z",
      participant: [
        { actor: { reference: `Patient/${PATIENT}` }, status: "accepted" },
        { actor: { reference: `Practitioner/${CLINICIAN}` }, status: "accepted" },
      ],
    } as never);

    const inserted = calls[0].eq.find(([c]) => c === "__insert")?.[1] as Record<string, unknown>;
    expect(inserted.patient_user_id).toBe(PATIENT);
    expect(inserted.clinician_user_id).toBe(CLINICIAN);
    expect((inserted.resource as { resourceType: string }).resourceType).toBe("Appointment");
  });
});

describe("Medplum's own client, talking to our database", () => {
  it("reads a resource through MedplumClient with no server anywhere", async () => {
    // The end of the argument. This is Medplum's real client, doing a real FHIR
    // read, and the bytes come from our table. Anything they have written that
    // takes a MedplumClient — their React components, screens from their
    // provider app — can be pointed at this.
    const { supabase } = fakeSupabase([row()]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    const appointment = await medplum.readResource("Appointment", "appt-1");
    expect(appointment.resourceType).toBe("Appointment");
    expect(appointment.status).toBe("booked");
    expect(() => validateFhir(appointment)).not.toThrow();
  });

  it("searches through MedplumClient and gets only the patient asked for", async () => {
    const { supabase } = fakeSupabase([row(), row({ id: "appt-2", patient_user_id: OTHER })]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    const results = await medplum.searchResources("Appointment", { patient: `Patient/${PATIENT}` });
    expect(results).toHaveLength(1);
    expect(results[0].resourceType).toBe("Appointment");
  });

  it("returns an OperationOutcome for a path we do not serve, not a wrong answer", async () => {
    const { supabase } = fakeSupabase([]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    await expect(medplum.readResource("Patient", "anything")).rejects.toThrow();
  });
});
