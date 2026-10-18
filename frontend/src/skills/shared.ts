import { z } from "zod/v4";
import { callDataTool } from "@/lib/data-api/client";
import { BRAKE_SUPPLIER_FIELDS, DEFAULT_DATASET, datasetForPart, type Dataset } from "@/lib/data-api/datasets";
import type { DataTool } from "@/lib/data-api/types";
import type { WorkflowContext } from "./types";

/** The 18 risk scores (higher = worse) in dataset order. total_risk_index is their weighted average. */
export const RISK_SCORES = [
  "industry_benchmark",
  "media_sentiment",
  "external_intelligence",
  "sub_tier_visibility",
  "labor_stability",
  "financial_health",
  "compliance_risk",
  "safety_incident",
  "environmental_exposure",
  "esg_performance",
  "digital_security",
  "operational_resilience",
  "market_sentiment",
  "quality_risk",
  "governance_risk",
  "geopolitical_risk",
  "political_stability",
  "credit_rating",
] as const;
export type RiskScore = (typeof RISK_SCORES)[number];

export const SCORE_FIELDS = ["total_risk_index", ...RISK_SCORES] as const;
export const LEVEL_FIELDS = SCORE_FIELDS.map((f) => `${f}_level`);
export const METRIC_FIELDS = ["po_volume_eur", "order_change_rate", "delivery_rating", "order_confirmation_rate"] as const;
export const CATEGORY_FIELDS = ["sourcing_risk_level", "supply_chain_complexity"] as const;
/** Derived fields usable in profile weights (ARCHITECTURE.md 5.2). */
export const DERIVED_FIELDS = ["delivery_risk", "confirmation_risk", "change_risk"] as const;

export const FILTER_FIELDS = [...SCORE_FIELDS, ...LEVEL_FIELDS, ...METRIC_FIELDS, ...CATEGORY_FIELDS] as [string, ...string[]];
export const HIGHER_IS_BETTER = new Set(["delivery_rating", "order_confirmation_rate"]);

/** "Financial risk" means these two together (ARCHITECTURE.md section 4). */
export const FINANCIAL_RISK_FIELDS = ["financial_health", "credit_rating"] as const;

export const FAMILIES = ["financial", "operational_quality", "compliance_governance", "external_environment", "supply_chain_structure"] as const;
export type Family = (typeof FAMILIES)[number];

export const PROFILE_IDS = ["default", "safety_critical", "strategic_system", "commodity", "lksg_due_diligence"] as const;

export const conditionSchema = z.object({
  field: z.enum(FILTER_FIELDS).describe("snake_case field; *_level fields take Low/Medium/High/Critical"),
  op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in", "between"]),
  value: z
    .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
    .describe("number, level string, or array for in/not_in/between ([low, high])"),
});
export type Condition = z.infer<typeof conditionSchema>;

/** Filter fields on the brakes dataset: the portfolio fields plus the supplier attributes and joined offering lists. */
export const BRAKE_FILTER_FIELDS = [...FILTER_FIELDS, "supplier_name", ...BRAKE_SUPPLIER_FIELDS] as [string, ...string[]];

export const brakeConditionSchema = z.object({
  field: z
    .enum(BRAKE_FILTER_FIELDS)
    .describe(
      "snake_case field; *_level fields take Low/Medium/High/Critical. Brake fields: country, region (EU, Europe (non-EU), North America, South America, Asia-Pacific), " +
        "supplier_status (Approved/Prospect), certifications, product_types, applications (use op contains), supplier_name (contains), application_count, offering_count",
    ),
  op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in", "between", "contains", "not_contains"]),
  value: z
    .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
    .describe('number, level or text, or array for in/not_in/between; contains takes one item ("ISO/TS 22163", "Rail")'),
});

export const supplierIdSchema = z.string().describe('Supplier id like "SUPP_00018"');

/** The dataset of a turn: the workflow's, else its part's (train-parts.json), else portfolio. */
export const datasetOf = (w: Pick<WorkflowContext, "dataset" | "part_id"> | null | undefined): Dataset => w?.dataset ?? datasetForPart(w?.part_id) ?? DEFAULT_DATASET;

/**
 * Accepts SUPP_00018, supp_18, "18", "SUPP-00018" and returns SUPP_00018; brake ids (brk_46, BRK-0046) become
 * BRK_0046, and so do bare numbers on the brakes dataset.
 */
export function normalizeSupplierId(raw: string, dataset?: Dataset): string {
  const digits = raw.match(/(\d{1,5})\s*$/)?.[1];
  if (!digits) return raw.trim().toUpperCase();
  const brake = /brk/i.test(raw) || (dataset === "brakes" && !/supp/i.test(raw));
  return brake ? `BRK_${digits.padStart(4, "0")}` : `SUPP_${digits.padStart(5, "0")}`;
}

export function normalizeIds(ids: readonly string[] | undefined | null, dataset?: Dataset): string[] {
  return [...new Set((ids ?? []).map((id) => normalizeSupplierId(id, dataset)))];
}

/**
 * Calls a data tool and throws a readable error (the model sees it as a tool error and can explain it).
 * `dataset` other than portfolio is added to the input; portfolio inputs stay exactly as they were.
 */
export async function dataOrThrow<T>(tool: DataTool, input: Record<string, unknown>, dataset?: Dataset): Promise<T> {
  const res = await callDataTool<T>(tool, dataset && dataset !== DEFAULT_DATASET ? { ...input, dataset } : input);
  if (!res.ok || res.data == null) {
    const code = res.error?.code ?? "INTERNAL";
    throw new Error(`${tool} failed (${code}): ${res.error?.message ?? "no data"}`);
  }
  return res.data;
}

export const fmt = (v: unknown, digits = 1): string => {
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v ?? "n/a");
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
};

export const fmtEur = (v: unknown): string =>
  typeof v === "number" ? (v >= 1e6 ? `${(v / 1e6).toFixed(2)} M EUR` : `${Math.round(v / 1e3)} k EUR`) : "n/a";

/** Risk-oriented value: higher = worse for every field (delivery_rating 97 -> 3). */
export function riskValue(field: string, value: unknown): number | null {
  if (typeof value !== "number") return null;
  return HIGHER_IS_BETTER.has(field) ? 100 - value : value;
}

export const levelOf = (v: number): "Low" | "Medium" | "High" | "Critical" =>
  v < 25 ? "Low" : v < 50 ? "Medium" : v < 75 ? "High" : "Critical";

export const conditionText = (c: { field: string; op: string; value: unknown }) =>
  `${c.field} ${c.op} ${Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value)}`;

/** Pure helper shared with the Guidance block: the newer condition on a field replaces the older one, order kept. */
export { mergeConditions } from "@/components/ui-blocks/condition-label";

type AnyCondition = { field: string; op: string; value: unknown };
export const sameConditions = (a: readonly AnyCondition[], b: readonly AnyCondition[]) =>
  a.length === b.length && a.map(conditionText).sort().join("|") === b.map(conditionText).sort().join("|");
