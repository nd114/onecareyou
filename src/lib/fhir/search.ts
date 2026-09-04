import { Operator, type Filter, type SearchRequest, type SortRule } from "@medplum/core";

/**
 * FHIR search, translated into something PostgREST can run.
 *
 * The repository used to apply `.eq()` for every filter it was handed,
 * whatever operator the filter actually carried. `date=ge2026-01-01` became
 * `start = '2026-01-01'` — not an error, just the wrong appointments, which is
 * the failure the repository's own comment says it exists to prevent: "a search
 * that silently ignores the filter it was given is how a clinician ends up
 * looking at another patient's list believing it is filtered."
 *
 * So planning is separated from executing. This module turns a `SearchRequest`
 * into a list of concrete clauses, and refuses anything it cannot express. It
 * touches no network and no database, so the semantics can be tested against
 * the specification rather than against a live table.
 *
 * ## Types decide which operators are legal
 *
 * FHIR search parameters are typed, and the type is what makes an operator
 * meaningful. `date=ge2026-01-01` is a real query; `status=ge2026-01-01` is
 * nonsense, and coercing it to equality would answer a question nobody asked.
 * Each parameter below declares its type, and each type declares its operators.
 *
 * ## Dates on a period are not dates on an instant
 *
 * An Appointment occupies a stretch of time, so `date` is a period search, and
 * FHIR gives it interval semantics: `ge` matches appointments whose *end* is at
 * or after the value, `le` matches those whose *start* is at or before it.
 * Comparing a period against a single column would quietly drop every
 * appointment that straddles the boundary — the ones a clinician looking at
 * "this week" most wants to see.
 */

/** PostgREST's comparison verbs, which are the ones supabase-js exposes. */
export type PostgrestOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "ilike" | "is";

export interface SearchClause {
  column: string;
  op: PostgrestOp;
  value: string | null;
}

export interface SearchOrder {
  column: string;
  ascending: boolean;
}

export interface SearchPlan {
  table: string;
  clauses: SearchClause[];
  order: SearchOrder[];
  limit?: number;
  offset?: number;
}

export type ParamType = "reference" | "token" | "date-period" | "string";

export interface ParamDefinition {
  type: ParamType;
  /** The column for a scalar parameter. */
  column?: string;
  /** The two columns bounding a period parameter. */
  period?: { start: string; end: string };
}

/**
 * What a resource type can be searched by.
 *
 * Kept as data rather than branching code so that adding a resource is adding
 * a row, and so the set of things we claim to support is readable in one place.
 */
export interface ResourceSearchConfig {
  table: string;
  params: Record<string, ParamDefinition>;
  /** `_sort` targets, which are not always the same as the filterable ones. */
  sortable: Record<string, string>;
}

export const APPOINTMENT_SEARCH: ResourceSearchConfig = {
  table: "fhir_appointments",
  params: {
    _id: { type: "token", column: "id" },
    patient: { type: "reference", column: "patient_user_id" },
    actor: { type: "reference", column: "patient_user_id" },
    practitioner: { type: "reference", column: "clinician_user_id" },
    status: { type: "token", column: "status" },
    "service-type": { type: "string", column: "visit_type" },
    date: { type: "date-period", period: { start: "start_time", end: "end_time" } },
  },
  sortable: { date: "start_time", _lastUpdated: "updated_at", status: "status" },
};

export const SEARCH_CONFIG: Record<string, ResourceSearchConfig> = {
  Appointment: APPOINTMENT_SEARCH,
};

/** Thrown for anything we will not answer. The caller turns it into a 400. */
export class UnsupportedSearch extends Error {}

const TOKEN_OPERATORS = new Set<string>([Operator.EQUALS, Operator.NOT_EQUALS, Operator.MISSING]);
const REFERENCE_OPERATORS = new Set<string>([Operator.EQUALS, Operator.NOT_EQUALS, Operator.MISSING]);
const STRING_OPERATORS = new Set<string>([
  Operator.EQUALS,
  Operator.CONTAINS,
  Operator.STARTS_WITH,
  Operator.EXACT,
  Operator.MISSING,
]);
const DATE_OPERATORS = new Set<string>([
  Operator.EQUALS,
  Operator.GREATER_THAN,
  Operator.GREATER_THAN_OR_EQUALS,
  Operator.LESS_THAN,
  Operator.LESS_THAN_OR_EQUALS,
  Operator.STARTS_AFTER,
  Operator.ENDS_BEFORE,
  Operator.MISSING,
]);

const OPERATORS_BY_TYPE: Record<ParamType, Set<string>> = {
  token: TOKEN_OPERATORS,
  reference: REFERENCE_OPERATORS,
  string: STRING_OPERATORS,
  "date-period": DATE_OPERATORS,
};

export function planSearch(request: SearchRequest): SearchPlan {
  const config = SEARCH_CONFIG[request.resourceType];
  if (!config) {
    throw new UnsupportedSearch(`${request.resourceType} is not served by this repository yet`);
  }

  const clauses: SearchClause[] = [];
  for (const filter of request.filters ?? []) {
    clauses.push(...planFilter(filter, config));
  }

  const order: SearchOrder[] = [];
  for (const rule of request.sortRules ?? []) {
    order.push(planSort(rule, config));
  }

  const plan: SearchPlan = { table: config.table, clauses, order };
  if (request.count !== undefined) {
    if (!Number.isInteger(request.count) || request.count < 0) {
      throw new UnsupportedSearch(`_count must be a whole number, got '${request.count}'`);
    }
    plan.limit = request.count;
  }
  if (request.offset !== undefined) {
    if (!Number.isInteger(request.offset) || request.offset < 0) {
      throw new UnsupportedSearch(`_offset must be a whole number, got '${request.offset}'`);
    }
    plan.offset = request.offset;
  }
  return plan;
}

function planFilter(filter: Filter, config: ResourceSearchConfig): SearchClause[] {
  const definition = config.params[filter.code];
  if (!definition) {
    // Refuse rather than return everything, which is the whole point.
    throw new UnsupportedSearch(`Search parameter '${filter.code}' is not supported`);
  }

  const allowed = OPERATORS_BY_TYPE[definition.type];
  if (!allowed.has(filter.operator)) {
    throw new UnsupportedSearch(
      `'${filter.operator}' cannot be used with '${filter.code}', which is a ${definition.type} parameter`,
    );
  }

  if (filter.operator === Operator.MISSING) {
    return [missingClause(filter, definition)];
  }

  switch (definition.type) {
    case "reference":
      return [
        {
          column: definition.column!,
          op: filter.operator === Operator.NOT_EQUALS ? "neq" : "eq",
          value: stripReference(filter.value),
        },
      ];
    case "token":
      return [
        {
          column: definition.column!,
          op: filter.operator === Operator.NOT_EQUALS ? "neq" : "eq",
          value: filter.value,
        },
      ];
    case "string":
      return [stringClause(filter, definition.column!)];
    case "date-period":
      return periodClauses(filter, definition.period!);
  }
}

/**
 * `:missing=true` asks for rows where the field is absent.
 *
 * A period is missing only when both ends are, which is why this cannot be a
 * single clause for every type.
 */
function missingClause(filter: Filter, definition: ParamDefinition): SearchClause {
  const wantsMissing = filter.value !== "false";
  const column = definition.column ?? definition.period!.start;
  return { column, op: "is", value: wantsMissing ? null : "not.null" };
}

function stringClause(filter: Filter, column: string): SearchClause {
  switch (filter.operator) {
    case Operator.EXACT:
      return { column, op: "eq", value: filter.value };
    case Operator.CONTAINS:
      return { column, op: "ilike", value: `%${escapeLike(filter.value)}%` };
    case Operator.STARTS_WITH:
      return { column, op: "ilike", value: `${escapeLike(filter.value)}%` };
    default:
      // FHIR string search is "starts with, case-insensitive" by default. Not
      // an exact match, and not a contains — both would be a different answer.
      return { column, op: "ilike", value: `${escapeLike(filter.value)}%` };
  }
}

/**
 * FHIR interval semantics for a date parameter over a period.
 *
 * Straight from the specification's table, because the intuitive reading is
 * wrong in exactly the cases that matter. "Appointments on or after Monday"
 * has to include the one that started on Sunday and runs into Monday.
 */
function periodClauses(filter: Filter, period: { start: string; end: string }): SearchClause[] {
  const value = filter.value;
  switch (filter.operator) {
    case Operator.GREATER_THAN_OR_EQUALS:
      return [{ column: period.end, op: "gte", value }];
    case Operator.GREATER_THAN:
      return [{ column: period.end, op: "gt", value }];
    case Operator.LESS_THAN_OR_EQUALS:
      return [{ column: period.start, op: "lte", value }];
    case Operator.LESS_THAN:
      return [{ column: period.start, op: "lt", value }];
    // 'sa' and 'eb' are about the period as a whole, not an intersection.
    case Operator.STARTS_AFTER:
      return [{ column: period.start, op: "gt", value }];
    case Operator.ENDS_BEFORE:
      return [{ column: period.end, op: "lt", value }];
    case Operator.EQUALS:
    default:
      // Equality on a period means the period falls inside the search value's
      // own range. With a day given, that is the whole of that day.
      return [
        { column: period.start, op: "gte", value: dayStart(value) },
        { column: period.end, op: "lte", value: dayEnd(value) },
      ];
  }
}

function planSort(rule: SortRule, config: ResourceSearchConfig): SearchOrder {
  const column = config.sortable[rule.code];
  if (!column) {
    throw new UnsupportedSearch(`Cannot sort by '${rule.code}'`);
  }
  return { column, ascending: !rule.descending };
}

/** `Patient/abc` and `abc` both mean the same row. */
export function stripReference(value: string): string {
  const slash = value.indexOf("/");
  return slash === -1 ? value : value.slice(slash + 1);
}

/**
 * `%` and `_` are wildcards in LIKE, so a patient searching for a name that
 * contains one would otherwise get a query they did not write.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A bare date means the whole day; an instant means itself. */
function dayStart(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

function dayEnd(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
}
