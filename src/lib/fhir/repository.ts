import {
  FhirRepository,
  FhirRouter,
  type CreateResourceOptions,
  type RepositoryMode,
  type UpdateResourceOptions,
} from "@medplum/fhir-router";
import {
  OperationOutcomeError,
  getStatus,
  notFound,
  badRequest,
  allOk,
  type SearchRequest,
} from "@medplum/core";
import type { Bundle, Reference, Resource, ResourceType } from "@medplum/fhirtypes";
import { fromAppointmentRow, toAppointmentRow, type AppointmentRow } from "@/lib/fhir/appointment";
import { SEARCH_CONFIG, UnsupportedSearch, planSearch, stripReference } from "@/lib/fhir/search";

/**
 * A FHIR repository backed by our own Postgres.
 *
 * This is the piece that makes Medplum's code addressable. `FhirRouter` is a
 * pure function — `handleRequest(request, repo)` — so with a repository over our
 * tables, a FHIR REST request can be served in-process without a Medplum server,
 * without a second database, and without a second identity system. Their client
 * takes a custom `fetch`, so `@medplum/react` components and screens lifted from
 * their provider app can be pointed here.
 *
 * The important consequence: **RLS still decides everything**. Every read and
 * write below goes through the ordinary Supabase client carrying the signed-in
 * user's JWT, so a request that asks for an appointment the user cannot see comes
 * back empty because Postgres said so — not because this class checked. There is
 * no service-role key here and there must never be one; that would move
 * authorisation out of the database and into this file, which is the whole thing
 * we decided not to do.
 *
 * Scope is deliberately one resource type. Appointment is the one that already
 * has a FHIR-shaped table, and a repository that claims to serve resources it
 * cannot is worse than one that says so.
 */

/** The minimum of supabase-js this needs, so tests can supply a fake. */
export interface SupabaseLike {
  from(table: string): any;
}

/**
 * Derived from the search config rather than written twice. Two lists of
 * "resources we serve" is one list that eventually lies.
 */
const SUPPORTED: Record<string, string> = Object.fromEntries(
  Object.entries(SEARCH_CONFIG).map(([resourceType, config]) => [resourceType, config.table]),
);

export class SupabaseFhirRepository extends FhirRepository {
  constructor(private readonly supabase: SupabaseLike) {
    super();
  }

  /** Reads and writes both go to the same place: the user's own connection. */
  setMode(_mode: RepositoryMode): void {
    // Medplum uses this to route reads at a replica. We have one database and
    // one set of policies, so there is nothing to switch.
  }

  generateId(): string {
    return crypto.randomUUID();
  }

  private table(resourceType: string): string {
    const table = SUPPORTED[resourceType];
    if (!table) {
      throw new OperationOutcomeError(
        badRequest(`${resourceType} is not served by this repository yet`),
      );
    }
    return table;
  }

  async createResource<T extends Resource>(
    resource: T,
    _options?: CreateResourceOptions,
  ): Promise<any> {
    this.table(resource.resourceType);
    if (resource.resourceType !== "Appointment") throw new OperationOutcomeError(notFound);

    const row = toAppointmentRow(fromResourceInput(resource), currentUserPlaceholder(resource));
    const { data, error } = await this.supabase
      .from("fhir_appointments")
      .insert(row)
      .select()
      .single();

    if (error) throw new OperationOutcomeError(badRequest(error.message));
    return fromAppointmentRow(data as AppointmentRow);
  }

  async readResource<T extends Resource>(resourceType: string, id: string): Promise<any> {
    const table = this.table(resourceType);
    const { data, error } = await this.supabase.from(table).select("*").eq("id", id).maybeSingle();

    // An empty result here is usually a row policy declining, not a missing row.
    // FHIR has one answer for both, which is the correct one to give: a client
    // must not be able to tell "does not exist" from "not yours".
    if (error) throw new OperationOutcomeError(badRequest(error.message));
    if (!data) throw new OperationOutcomeError(notFound);
    return fromAppointmentRow(data as AppointmentRow);
  }

  async readReference<T extends Resource>(reference: Reference<T>): Promise<any> {
    const [resourceType, id] = (reference.reference ?? "").split("/");
    if (!resourceType || !id) throw new OperationOutcomeError(notFound);
    return this.readResource(resourceType, id);
  }

  async readReferences<T extends Resource>(references: readonly Reference<T>[]): Promise<any[]> {
    return Promise.all(
      references.map((r) => this.readReference(r).catch((e: Error) => e)),
    );
  }

  /**
   * Search.
   *
   * The planning is in `@/lib/fhir/search` — pure, and tested against the
   * specification rather than against a live table. This method's only job is
   * to turn a plan into PostgREST calls, which keeps the part that can be wrong
   * about FHIR separate from the part that talks to the database.
   */
  async search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<any>> {
    let plan;
    try {
      plan = planSearch(searchRequest as SearchRequest);
    } catch (e) {
      if (e instanceof UnsupportedSearch) throw new OperationOutcomeError(badRequest(e.message));
      throw e;
    }

    let query = this.supabase.from(plan.table).select("*");

    for (const clause of plan.clauses) {
      if (clause.op === "is") {
        query = clause.value === null ? query.is(clause.column, null) : query.not(clause.column, "is", null);
        continue;
      }
      query = query[clause.op](clause.column, clause.value);
    }

    for (const order of plan.order) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    // Offset without a limit is meaningless to PostgREST's range, so an offset
    // on its own reads to the end rather than silently returning nothing.
    if (plan.offset !== undefined && plan.limit !== undefined) {
      query = query.range(plan.offset, plan.offset + plan.limit - 1);
    } else if (plan.limit !== undefined) {
      query = query.limit(plan.limit);
    } else if (plan.offset !== undefined) {
      query = query.range(plan.offset, plan.offset + 999);
    }

    const { data, error } = await query;
    if (error) throw new OperationOutcomeError(badRequest(error.message));

    const rows = (data ?? []) as AppointmentRow[];
    return {
      resourceType: "Bundle",
      type: "searchset",
      entry: rows.map((row) => ({ resource: fromAppointmentRow(row) as any })),
    };
  }

  async searchByReference<T extends Resource>(
    searchRequest: SearchRequest<T>,
    referenceField: string,
    references: string[],
  ): Promise<Record<string, any[]>> {
    const out: Record<string, any[]> = {};
    for (const reference of references) {
      const bundle = await this.search({
        ...searchRequest,
        filters: [
          ...(searchRequest.filters ?? []),
          { code: referenceField, operator: "eq" as any, value: reference },
        ],
      });
      out[reference] = (bundle.entry ?? []).map((e) => e.resource!);
    }
    return out;
  }

  async updateResource<T extends Resource>(
    resource: T,
    _options?: UpdateResourceOptions,
  ): Promise<any> {
    const table = this.table(resource.resourceType);
    if (!resource.id) throw new OperationOutcomeError(badRequest("Cannot update without an id"));

    const row = toAppointmentRow(fromResourceInput(resource), currentUserPlaceholder(resource));
    delete (row as Record<string, unknown>).created_by;

    const { data, error } = await this.supabase
      .from(table)
      .update(row)
      .eq("id", resource.id)
      .select()
      .maybeSingle();

    if (error) throw new OperationOutcomeError(badRequest(error.message));
    if (!data) throw new OperationOutcomeError(notFound);
    return fromAppointmentRow(data as AppointmentRow);
  }

  /**
   * Not available, and that is the product decision rather than a gap.
   *
   * The table grants no DELETE and carries no DELETE policy: a cancelled or
   * missed appointment is part of the record, and FHIR has statuses for both.
   * Throwing here keeps the two layers saying the same thing.
   */
  async deleteResource(_resourceType: string, _id: string): Promise<void> {
    throw new OperationOutcomeError(
      badRequest("Appointments are cancelled by status, not deleted"),
    );
  }

  // ---------------------------------------------------------------------------
  // Not implemented, and honest about it.
  //
  // Versioning needs a history table we have not built, and patch and
  // transactions need semantics we have not decided. A repository that pretends
  // to support an operation and silently does the wrong thing is worse than one
  // that refuses, because the caller finds out later and from the data.
  // ---------------------------------------------------------------------------
  async readHistory<T extends Resource>(_resourceType: string, _id: string): Promise<Bundle<any>> {
    throw new OperationOutcomeError(badRequest("History is not recorded for this resource"));
  }

  async readVersion<T extends Resource>(
    _resourceType: string,
    _id: string,
    _vid: string,
  ): Promise<any> {
    throw new OperationOutcomeError(badRequest("History is not recorded for this resource"));
  }

  async patchResource<T extends Resource>(
    _resourceType: T["resourceType"],
    _id: string,
    _patch: never,
  ): Promise<any> {
    throw new OperationOutcomeError(badRequest("PATCH is not supported; send the whole resource"));
  }

  async withTransaction<TResult>(callback: (txRepo: this) => Promise<TResult>): Promise<TResult> {
    // PostgREST gives us no cross-statement transaction from the browser, so
    // this runs the callback without one rather than claiming atomicity it
    // cannot provide. Anything needing a real transaction belongs in a
    // SECURITY DEFINER function, where the database can give one.
    return callback(this);
  }
}

function fromResourceInput(resource: Resource): any {
  const a = resource as any;
  const patient = a.participant?.find((p: any) =>
    p.actor?.reference?.startsWith("Patient/"),
  )?.actor?.reference;
  const practitioner = a.participant?.find((p: any) =>
    p.actor?.reference?.startsWith("Practitioner/"),
  )?.actor?.reference;

  return {
    id: a.id,
    patientUserId: patient ? stripReference(patient) : "",
    clinicianUserId: practitioner ? stripReference(practitioner) : null,
    status: a.status,
    start: a.start ?? null,
    end: a.end ?? null,
    description: a.description ?? null,
    visitType: a.appointmentType?.text ?? null,
  };
}

/**
 * `created_by` must equal auth.uid() for the insert policy to pass, and the
 * database is the thing that knows who that is. The clinician reference on the
 * resource is what the caller claims; if it disagrees with the JWT, the policy
 * refuses the write, which is the correct outcome.
 */
function currentUserPlaceholder(resource: Resource): string {
  const a = resource as any;
  const practitioner = a.participant?.find((p: any) =>
    p.actor?.reference?.startsWith("Practitioner/"),
  )?.actor?.reference;
  return practitioner ? stripReference(practitioner) : "";
}

export { allOk };

/**
 * A `fetch` that answers FHIR requests from our own database.
 *
 * This is the join. `MedplumClient` takes a custom `fetch`, and `FhirRouter` is
 * a pure `handleRequest(request, repo)`, so a FHIR REST call made by any of
 * Medplum's code — their React components, screens lifted from their provider
 * app — can be served in-process against our Postgres. No Medplum server, no
 * second database, no second identity system, and no network hop.
 *
 * Authorisation is unchanged and unmoved: the request runs through the supplied
 * Supabase client, which carries the signed-in user's JWT, so row policies
 * decide what comes back exactly as they do for the rest of the app.
 *
 *   const medplum = new MedplumClient({
 *     baseUrl: 'https://local/',
 *     fetch: createFhirFetch(supabase),
 *   });
 */
export function createFhirFetch(supabase: SupabaseLike) {
  const router = new FhirRouter();
  const repo = new SupabaseFhirRepository(supabase);

  return async function fhirFetch(input: string | URL | Request, init?: RequestInit) {
    const url = new URL(typeof input === "string" ? input : input.toString(), "https://local/");
    const method = (init?.method ?? "GET").toUpperCase();

    // Only the FHIR path is ours. Anything else — Medplum's own auth and admin
    // endpoints — is not served here, and saying so plainly beats returning
    // something shaped like an answer.
    const fhirPath = url.pathname.replace(/^.*\/fhir\/R4/, "");
    if (!fhirPath) {
      return jsonResponse(404, {
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "not-found", details: { text: "Not served locally" } }],
      });
    }

    try {
      // Only `url` — the router parses pathname and query out of it, and
      // refuses a request that supplies them itself.
      const [outcome, result] = await router.handleRequest(
        {
          method: method as never,
          url: fhirPath + url.search,
          params: {},
          query: {},
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        } as never,
        repo,
      );

      // Medplum encodes the status in `outcome.id` and exposes `getStatus` for
      // it. Reading `issue[0].details.text` — which is the human sentence —
      // gave NaN every time, so every failure came back as 400 and a genuine
      // 404 was indistinguishable from a malformed request.
      const status = result ? 200 : getStatus(outcome);
      return jsonResponse(status, result ?? outcome);
    } catch (err) {
      const outcome = (err as { outcome?: unknown })?.outcome ?? {
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "exception", details: { text: String(err) } }],
      };
      return jsonResponse(400, outcome);
    }
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/fhir+json" },
  });
}
