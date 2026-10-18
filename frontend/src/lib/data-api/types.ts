// Mirrors api/ARCHITECTURE.md section 5. Regenerate from the OpenAPI spec once the service exists:
//   pnpm gen:api  (writes src/lib/data-api/schema.d.ts)

export type Level = "Low" | "Medium" | "High" | "Critical";

export interface Envelope<T> {
  ok: boolean;
  data: T | null;
  meta: { row_count?: number; truncated?: boolean; profile_id?: string } & Record<string, unknown>;
  error: { code: DataApiErrorCode; message: string } | null;
}

export type DataApiErrorCode =
  | "UNKNOWN_SUPPLIER"
  | "UNKNOWN_FIELD"
  | "UNKNOWN_PROFILE"
  | "INVALID_FILTER"
  | "TOO_MANY_SUPPLIERS"
  | "QUERY_REJECTED"
  | "INTERNAL";

export type FilterOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "not_in" | "between";
export interface FilterCondition {
  field: string;
  op: FilterOp;
  value: string | number | Array<string | number>;
}

export type DataTool =
  | "get_metadata"
  | "list_profiles"
  | "get_suppliers"
  | "filter_suppliers"
  | "rank_with_profile"
  | "compare_suppliers"
  | "explain_supplier"
  | "find_similar"
  | "kraljic_position"
  | "get_dataset_stats"
  | "run_sql";
