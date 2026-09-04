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
interface FakeCall {
  table: string;
  eq: [string, unknown][];
  limit?: number;
  /** Every comparison, with the verb, so a test can assert gte was not eq. */
  ops: { op: string; column: string; value: unknown }[];
  order: { column: string; ascending: boolean }[];
  range?: [number, number];
}

function fakeSupabase(rows: Record<string, unknown>[]) {
  const calls: FakeCall[] = [];

  const from = (table: string) => {
    const call: FakeCall = {
      table,
      eq: [] as [string, unknown][],
      limit: undefined,
      ops: [],
      order: [],
      range: undefined,
    };
    calls.push(call);

    // Comparisons other than eq are recorded but not applied to the fake rows:
    // the assertion that matters is that the verb reached the query builder,
    // because a comparison evaluated in JavaScript after the rows come back is
    // one RLS never saw.
    const record = (op: string) => (column: string, value: unknown) => {
      call.ops.push({ op, column, value });
      return builder;
    };

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
        call.ops.push({ op: "eq", column, value });
        return builder;
      },
      neq: record("neq"),
      gt: record("gt"),
      gte: record("gte"),
      lt: record("lt"),
      lte: record("lte"),
      ilike: record("ilike"),
      is: record("is"),
      not: (column: string, op: string, value: unknown) => {
        call.ops.push({ op: `not.${op}`, column, value });
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        call.order.push({ column, ascending: opts?.ascending !== false });
        return builder;
      },
      range: (from_: number, to: number) => {
        call.range = [from_, to];
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

  it("returns 404 for a missing resource, not 400 for everything", async () => {
    // The status came from `outcome.issue[0].details.text`, which is the human
    // sentence — Number() of it is NaN, so every failure fell through to 400
    // and a genuine 404 was indistinguishable from a malformed request.
    // Medplum encodes the status in `outcome.id` and exposes getStatus for it.
    const { supabase } = fakeSupabase([]);
    const fetchFn = createFhirFetch(supabase);
    const res = (await fetchFn("https://local/fhir/R4/Appointment/does-not-exist")) as Response;
    expect(res.status).toBe(404);

    const bad = (await fetchFn("https://local/fhir/R4/Appointment?performer=nobody")) as Response;
    expect(bad.status).toBe(400);
  });

  it("returns an OperationOutcome for a path we do not serve, not a wrong answer", async () => {
    const { supabase } = fakeSupabase([]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    await expect(medplum.readResource("Patient", "anything")).rejects.toThrow();
  });

  it("sends a date range to the database as a range, not as equality", async () => {
    // The regression this guards: every filter used to become .eq() whatever
    // its operator said, so `date=ge...` silently asked a different question
    // and answered it confidently.
    const { supabase, calls } = fakeSupabase([row()]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    await medplum.searchResources("Appointment", "date=ge2026-09-01&date=le2026-09-30");

    const search = calls[calls.length - 1];
    expect(search.ops).toEqual([
      // FHIR interval semantics: on-or-after compares the end, on-or-before
      // the start, so an appointment straddling either boundary is kept.
      { op: "gte", column: "end_time", value: "2026-09-01" },
      { op: "lte", column: "start_time", value: "2026-09-30" },
    ]);
    expect(search.ops.some((o) => o.op === "eq")).toBe(false);
  });

  it("sorts in the database rather than after the rows arrive", async () => {
    const { supabase, calls } = fakeSupabase([row()]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    await medplum.searchResources("Appointment", "_sort=-date&_count=5&_offset=10");

    const search = calls[calls.length - 1];
    expect(search.order).toEqual([{ column: "start_time", ascending: false }]);
    // Paging has to be a range, not a limit applied to an unsorted read.
    expect(search.range).toEqual([10, 14]);
  });

  it("does not reinterpret a token value that happens to start like a date prefix", async () => {
    // Worth knowing, and found by running this rather than reading about it:
    // `parseSearchRequest` behaves differently depending on whether the FHIR
    // definitions have been loaded into the global schema.
    //
    //   without them: status=ge2026-01-01 → { operator: 'ge' }  (the prefix
    //                 rule applied blindly, because nothing says status is a
    //                 token)
    //   with them:    status=ge2026-01-01 → { operator: 'eq',
    //                 value: 'ge2026-01-01' }  (correct)
    //
    // `@medplum/definitions` is a devDependency and never ships to the
    // browser, so production runs in the first mode — which is precisely why
    // the planner refuses an operator a parameter's type cannot carry. That
    // guard is asserted directly in fhir-search.test.ts, where no definitions
    // are loaded. Here the definitions are loaded on purpose, so the
    // assertion is about the other half: with them, the value stays a literal.
    validateFhir({
      resourceType: "Appointment",
      status: "booked",
      start: "2026-09-10T09:00:00.000Z",
      end: "2026-09-10T09:30:00.000Z",
      participant: [{ status: "accepted", actor: { reference: `Patient/${PATIENT}` } }],
    } as never);

    const { supabase, calls } = fakeSupabase([row()]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    const results = await medplum.searchResources("Appointment", "status=ge2026-01-01");
    expect(results).toHaveLength(0);

    const search = calls[calls.length - 1];
    expect(search.ops).toEqual([{ op: "eq", column: "status", value: "ge2026-01-01" }]);
  });

  it("asks the database for rows with no clinician when told :missing", async () => {
    const { supabase, calls } = fakeSupabase([row()]);
    const medplum = new MedplumClient({
      baseUrl: "https://local/",
      fetch: createFhirFetch(supabase) as never,
    });

    await medplum.searchResources("Appointment", "practitioner:missing=true");

    const search = calls[calls.length - 1];
    expect(search.ops).toEqual([{ op: "is", column: "clinician_user_id", value: null }]);
  });
});
