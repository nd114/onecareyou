import { describe, expect, it } from "vitest";
import { Operator, type SearchRequest } from "@medplum/core";

import { UnsupportedSearch, planSearch } from "@/lib/fhir/search";

/**
 * The planner is pure, so these assertions are against the FHIR specification
 * rather than against a table. That matters most for the date semantics, where
 * the intuitive reading and the specified one differ in exactly the cases a
 * clinician cares about.
 */
function search(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return { resourceType: "Appointment", ...overrides } as SearchRequest;
}

describe("what it will and will not answer", () => {
  it("refuses a resource type it does not serve", () => {
    expect(() => planSearch(search({ resourceType: "Encounter" } as never))).toThrow(UnsupportedSearch);
  });

  it("refuses an unknown parameter rather than ignoring it", () => {
    // Silently dropping a filter is how a clinician ends up looking at another
    // patient's list believing it is filtered.
    expect(() =>
      planSearch(search({ filters: [{ code: "performer", operator: Operator.EQUALS, value: "x" }] })),
    ).toThrow(/not supported/);
  });

  it("refuses an operator the parameter's type cannot carry", () => {
    // 'status greater than booked' is not a question. Coercing it to equality
    // would answer a different one.
    expect(() =>
      planSearch(search({ filters: [{ code: "status", operator: Operator.GREATER_THAN, value: "booked" }] })),
    ).toThrow(/cannot be used with 'status'/);
  });

  it("refuses a sort it cannot perform", () => {
    expect(() => planSearch(search({ sortRules: [{ code: "description" }] }))).toThrow(/Cannot sort by/);
  });

  it("refuses a nonsense page size", () => {
    expect(() => planSearch(search({ count: -1 }))).toThrow(/_count/);
    expect(() => planSearch(search({ offset: 1.5 }))).toThrow(/_offset/);
  });
});

describe("references", () => {
  it("accepts a bare id and a typed reference as the same thing", () => {
    const bare = planSearch(search({ filters: [{ code: "patient", operator: Operator.EQUALS, value: "abc" }] }));
    const typed = planSearch(
      search({ filters: [{ code: "patient", operator: Operator.EQUALS, value: "Patient/abc" }] }),
    );
    expect(bare.clauses).toEqual(typed.clauses);
    expect(bare.clauses[0]).toEqual({ column: "patient_user_id", op: "eq", value: "abc" });
  });

  it("maps actor and patient to the same column, because they are", () => {
    const actor = planSearch(search({ filters: [{ code: "actor", operator: Operator.EQUALS, value: "abc" }] }));
    expect(actor.clauses[0].column).toBe("patient_user_id");
  });

  it("honours a negation instead of turning it into a match", () => {
    const plan = planSearch(
      search({ filters: [{ code: "status", operator: Operator.NOT_EQUALS, value: "cancelled" }] }),
    );
    expect(plan.clauses[0]).toEqual({ column: "status", op: "neq", value: "cancelled" });
  });
});

describe("dates over a period, which is where the old code was wrong", () => {
  // The repository used to apply .eq() whatever the operator said, so
  // date=ge2026-01-01 became start_time = '2026-01-01' — not an error, just
  // the wrong appointments.
  const on = (operator: string, value = "2026-09-10") =>
    planSearch(search({ filters: [{ code: "date", operator: operator as never, value }] })).clauses;

  it("'on or after' looks at the end, so an appointment straddling the boundary is kept", () => {
    // An appointment that began yesterday and runs into today is on today.
    expect(on(Operator.GREATER_THAN_OR_EQUALS)).toEqual([
      { column: "end_time", op: "gte", value: "2026-09-10" },
    ]);
  });

  it("'on or before' looks at the start, for the same reason in reverse", () => {
    expect(on(Operator.LESS_THAN_OR_EQUALS)).toEqual([
      { column: "start_time", op: "lte", value: "2026-09-10" },
    ]);
  });

  it("'starts after' is about the start, not an intersection", () => {
    expect(on(Operator.STARTS_AFTER)).toEqual([{ column: "start_time", op: "gt", value: "2026-09-10" }]);
  });

  it("'ends before' is about the end", () => {
    expect(on(Operator.ENDS_BEFORE)).toEqual([{ column: "end_time", op: "lt", value: "2026-09-10" }]);
  });

  it("a bare date means the whole of that day, both ends", () => {
    // Otherwise `date=2026-09-10` matches only an appointment starting at
    // exactly midnight, which is no appointment at all.
    expect(on(Operator.EQUALS)).toEqual([
      { column: "start_time", op: "gte", value: "2026-09-10T00:00:00.000Z" },
      { column: "end_time", op: "lte", value: "2026-09-10T23:59:59.999Z" },
    ]);
  });

  it("an instant is left as the instant it is", () => {
    expect(on(Operator.EQUALS, "2026-09-10T09:00:00.000Z")).toEqual([
      { column: "start_time", op: "gte", value: "2026-09-10T09:00:00.000Z" },
      { column: "end_time", op: "lte", value: "2026-09-10T09:00:00.000Z" },
    ]);
  });
});

describe("string search", () => {
  it("defaults to starts-with, case-insensitive, as FHIR specifies", () => {
    const plan = planSearch(
      search({ filters: [{ code: "service-type", operator: Operator.EQUALS, value: "Follow" }] }),
    );
    expect(plan.clauses[0]).toEqual({ column: "visit_type", op: "ilike", value: "Follow%" });
  });

  it("honours :contains and :exact as different questions", () => {
    const contains = planSearch(
      search({ filters: [{ code: "service-type", operator: Operator.CONTAINS, value: "up" }] }),
    );
    expect(contains.clauses[0].value).toBe("%up%");

    const exact = planSearch(
      search({ filters: [{ code: "service-type", operator: Operator.EXACT, value: "Follow-up" }] }),
    );
    expect(exact.clauses[0]).toEqual({ column: "visit_type", op: "eq", value: "Follow-up" });
  });

  it("escapes LIKE wildcards so a search term stays a search term", () => {
    // Otherwise searching for "100%" runs a query the user did not write.
    const plan = planSearch(
      search({ filters: [{ code: "service-type", operator: Operator.CONTAINS, value: "100%_x" }] }),
    );
    expect(plan.clauses[0].value).toBe("%100\\%\\_x%");
  });
});

describe(":missing", () => {
  it("asks for rows where the field is absent", () => {
    const plan = planSearch(
      search({ filters: [{ code: "practitioner", operator: Operator.MISSING, value: "true" }] }),
    );
    expect(plan.clauses[0]).toEqual({ column: "clinician_user_id", op: "is", value: null });
  });

  it("and :missing=false asks for the opposite", () => {
    const plan = planSearch(
      search({ filters: [{ code: "practitioner", operator: Operator.MISSING, value: "false" }] }),
    );
    expect(plan.clauses[0]).toEqual({ column: "clinician_user_id", op: "is", value: "not.null" });
  });
});

describe("sorting and paging", () => {
  it("sorts ascending by default and descending when asked", () => {
    expect(planSearch(search({ sortRules: [{ code: "date" }] })).order).toEqual([
      { column: "start_time", ascending: true },
    ]);
    expect(planSearch(search({ sortRules: [{ code: "date", descending: true }] })).order).toEqual([
      { column: "start_time", ascending: false },
    ]);
  });

  it("keeps several sort rules in the order they were given", () => {
    const plan = planSearch(
      search({ sortRules: [{ code: "status" }, { code: "date", descending: true }] }),
    );
    expect(plan.order.map((o) => o.column)).toEqual(["status", "start_time"]);
  });

  it("carries count and offset through", () => {
    const plan = planSearch(search({ count: 20, offset: 40 }));
    expect(plan.limit).toBe(20);
    expect(plan.offset).toBe(40);
  });

  it("allows a page size of zero, which is how a client asks for a count only", () => {
    expect(planSearch(search({ count: 0 })).limit).toBe(0);
  });
});

describe("several filters together", () => {
  it("keeps every clause rather than letting one win", () => {
    const plan = planSearch(
      search({
        filters: [
          { code: "patient", operator: Operator.EQUALS, value: "Patient/p1" },
          { code: "status", operator: Operator.NOT_EQUALS, value: "cancelled" },
          { code: "date", operator: Operator.GREATER_THAN_OR_EQUALS, value: "2026-09-01" },
        ],
      }),
    );
    expect(plan.clauses).toEqual([
      { column: "patient_user_id", op: "eq", value: "p1" },
      { column: "status", op: "neq", value: "cancelled" },
      { column: "end_time", op: "gte", value: "2026-09-01" },
    ]);
  });
});
