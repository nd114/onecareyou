import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MedplumClient } from "@medplum/core";
import { MedplumProvider, useSearchResources } from "@medplum/react-hooks";
import type { ReactNode } from "react";

import { createFhirFetch, type SupabaseLike } from "@/lib/fhir/repository";
import { toAppointmentRow } from "@/lib/fhir/appointment";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/**
 * Medplum's hooks, reading our tables.
 *
 * The point of this suite is one claim: their data layer works against our
 * database with no Medplum server, no second identity system, and no Mantine.
 * If that stops being true, adopting `@medplum/react-hooks` stops being worth
 * the second cache it brings.
 */
function fakeSupabase(rows: Record<string, unknown>[]) {
  const from = () => {
    const filters: [string, unknown][] = [];
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      maybeSingle: async () => ({
        data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
        error: null,
      }),
      then: (resolve: (r: unknown) => void) =>
        Promise.resolve({
          data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)),
          error: null,
        }).then(resolve),
    };
    return builder;
  };
  return { from } as SupabaseLike;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    ...toAppointmentRow(
      {
        patientUserId: PATIENT,
        status: "booked",
        start: "2026-09-10T09:00:00.000Z",
        end: "2026-09-10T09:30:00.000Z",
      },
      PATIENT,
    ),
    id: "appt-1",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as Record<string, unknown>;
}

function wrapper(rows: Record<string, unknown>[]) {
  const medplum = new MedplumClient({
    baseUrl: "https://local/",
    fetch: createFhirFetch(fakeSupabase(rows)) as never,
  });
  return ({ children }: { children: ReactNode }) => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
}

describe("Medplum's hooks over our database", () => {
  it("reads appointments out of Supabase as FHIR resources", async () => {
    const { result } = renderHook(() => useSearchResources("Appointment", { patient: PATIENT }), {
      wrapper: wrapper([row()]),
    });

    await waitFor(() => expect(result.current[1]).toBe(false));
    const [resources] = result.current;
    expect(resources).toHaveLength(1);
    expect(resources?.[0].resourceType).toBe("Appointment");
    expect(resources?.[0].status).toBe("booked");
  });

  it("returns only what the filter asked for, and the filter reaches the database", async () => {
    // If the filter were applied in JavaScript after the rows arrived, this
    // would still pass — so the repository suite asserts the query builder
    // received it. Here the claim is narrower: the hook does not widen it.
    const { result } = renderHook(() => useSearchResources("Appointment", { patient: PATIENT }), {
      wrapper: wrapper([row(), row({ id: "appt-2", patient_user_id: OTHER })]),
    });

    await waitFor(() => expect(result.current[1]).toBe(false));
    expect(result.current[0]).toHaveLength(1);
  });

  it("surfaces a refusal as an OperationOutcome rather than an empty list", async () => {
    // An empty list reads as "no appointments", which is the one answer a
    // refused search must never give.
    const { result } = renderHook(
      () => useSearchResources("Appointment", { performer: "anyone" } as never),
      { wrapper: wrapper([row()]) },
    );

    await waitFor(() => expect(result.current[1]).toBe(false));
    const [resources, , outcome] = result.current;
    expect(resources).toBeUndefined();
    expect(JSON.stringify(outcome)).toMatch(/not supported/);
  });
});
