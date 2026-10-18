import { z } from "zod/v4";
import { defineSkill } from "./types";
import {
  BRAKE_FILTER_FIELDS,
  brakeConditionSchema,
  conditionSchema,
  conditionText,
  dataOrThrow,
  fmt,
  fmtEur,
  FILTER_FIELDS,
  mergeConditions,
  sameConditions,
  type Condition,
} from "./shared";

interface FilterResult {
  total_matching: number;
  suppliers: Array<Record<string, unknown>>;
  conditions: Condition[];
  sort_by: Array<{ field: string; order: "asc" | "desc" }>;
  /** brakes dataset: every matching id and the summed PO volume (counts and spend questions). */
  all_ids?: string[];
  po_volume_total?: number;
  handle: string;
}

export const filterSuppliers = defineSkill({
  name: "filter_suppliers",
  description:
    "Finds suppliers in the full dataset that meet hard requirements (score levels, delivery rating, PO volume, sourcing risk) and sorts them. " +
    "Use when the buyer asks which suppliers, or to find, list, show or narrow down suppliers by conditions (e.g. 'suppliers without a Critical compliance score and PO volume over 5 M EUR'). " +
    "The workflow's hard requirements are ANDed in automatically (a condition in the question replaces the one on the same field) and the result becomes the case's filters. " +
    "Do not use to compare named suppliers (compare_suppliers), to explain one supplier (explain_supplier), to re-rank with a weight profile (rank_with_profile), " +
    "or to count or aggregate (run_sql). Renders a ranked list with pin-to-shortlist actions.",
  priority: "core",
  stage: "shortlist",
  input: z.object({
    conditions: z.array(conditionSchema).default([]).describe("AND-combined filter conditions from this question"),
    sort_by: z
      .array(z.object({ field: z.enum(FILTER_FIELDS), order: z.enum(["asc", "desc"]) }))
      .default([{ field: "total_risk_index", order: "asc" }]),
    limit: z.number().int().min(1).max(100).default(20),
    apply_workflow_requirements: z.boolean().default(true).describe("AND the workflow's hard requirements into the filter"),
  }),
  run: async (input, ctx): Promise<FilterResult> => {
    const extra = (input.apply_workflow_requirements ? ctx.workflow.hard_requirements : []) as Condition[];
    const conditions = mergeConditions(extra, input.conditions);
    const data = await dataOrThrow<{ total_matching: number; suppliers: Array<Record<string, unknown>> }>("filter_suppliers", {
      conditions,
      sort_by: input.sort_by,
      limit: input.limit,
      offset: 0,
    });
    const result = { ...data, conditions, sort_by: input.sort_by };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const key = r.sort_by[0]?.field ?? "total_risk_index";
    const top = r.suppliers
      .slice(0, 5)
      .map((s) => `${s.supplier_id} (${key} ${fmt(s[key])})`)
      .join(", ");
    const conds = r.conditions.length ? r.conditions.map(conditionText).join(" AND ") : "no conditions";
    return `${r.total_matching} suppliers match [${conds}]; showing ${r.suppliers.length}, sorted by ${key} ${r.sort_by[0]?.order ?? "asc"}. Top: ${top || "none"}.`;
  },
  view: (_r, handle) => `root = RankedList("${handle}")`,
  // The question's conditions become the case's filters (chips above the chat), so the next turn builds on them.
  uiActions: (r, input, workflow) =>
    input.apply_workflow_requirements && !sameConditions(r.conditions, workflow.hard_requirements)
      ? [{ type: "set_hard_requirements", conditions: r.conditions }]
      : [],
  examples: [
    "Show me low-risk suppliers with delivery rating above 95",
    "Which suppliers have no Critical quality score and volume above 1 M EUR?",
    "List suppliers with Low sourcing risk sorted by delivery rating",
  ],
  workedExamples: [
    {
      question: "Show me low-risk suppliers with delivery rating above 95",
      input: {
        conditions: [
          { field: "total_risk_index_level", op: "eq", value: "Low" },
          { field: "delivery_rating", op: "gt", value: 95 },
        ],
      },
    },
  ],
});

/** Every brake supplier fits in one page (60), so counts, id lists and PO-volume sums cover all matches. */
const BRAKE_PAGE = 100;
const BRAKE_LIST_MAX = 30;

/**
 * filter_suppliers on the brakes dataset: same tool name and behaviour, plus the brake supplier fields
 * (country, region, supplier_status, certifications / product_types / applications with `contains`, supplier_name),
 * and a summary that names every matching id and the summed PO volume.
 */
export const filterSuppliersBrakes = defineSkill({
  name: "filter_suppliers",
  description:
    "Finds brake suppliers (supplier level, brakes dataset, 60 suppliers BRK_0001 to BRK_0060) that meet conditions and sorts them. Fields: risk scores and levels, " +
    "delivery_rating, po_volume_eur, country, region (EU, Europe (non-EU), North America, South America, Asia-Pacific), supplier_status (Approved / Prospect), " +
    "certifications, product_types and applications (op contains, e.g. certifications contains 'ISO/TS 22163', applications contains 'Rail'), supplier_name (contains), " +
    "application_count. Use for 'which / how many suppliers' questions (the count is total_matching), supplier name lookups and total PO volume of a group. " +
    "The workflow's hard requirements are ANDed in automatically and the result becomes the case's filters. " +
    "Do not use for product offerings, prices, lead times, MOQ or capacity (find_offerings), RFQ qualification or awards (qualify_for_rfq), " +
    "or one supplier's briefing (explain_supplier). Renders a ranked list with pin-to-shortlist actions.",
  priority: "core",
  stage: "shortlist",
  input: z.object({
    conditions: z.array(brakeConditionSchema).default([]).describe("AND-combined filter conditions from this question"),
    sort_by: z
      .array(z.object({ field: z.enum(BRAKE_FILTER_FIELDS), order: z.enum(["asc", "desc"]) }))
      .default([{ field: "total_risk_index", order: "asc" }]),
    limit: z.number().int().min(1).max(100).default(20),
    apply_workflow_requirements: z.boolean().default(true).describe("AND the workflow's hard requirements into the filter"),
  }),
  run: async (input, ctx): Promise<FilterResult> => {
    const extra = (input.apply_workflow_requirements ? ctx.workflow.hard_requirements : []) as Condition[];
    const conditions = mergeConditions(extra, input.conditions as Condition[]);
    const data = await dataOrThrow<{ total_matching: number; suppliers: Array<Record<string, unknown>> }>(
      "filter_suppliers",
      { conditions, sort_by: input.sort_by, limit: BRAKE_PAGE, offset: 0 },
      "brakes",
    );
    const all_ids = data.suppliers.map((s) => String(s.supplier_id));
    const po_volume_total = Math.round(data.suppliers.reduce((a, s) => a + (typeof s.po_volume_eur === "number" ? s.po_volume_eur : 0), 0) * 100) / 100;
    const result = { ...data, suppliers: data.suppliers.slice(0, input.limit), conditions, sort_by: input.sort_by, all_ids, po_volume_total };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const key = r.sort_by[0]?.field ?? "total_risk_index";
    const conds = r.conditions.length ? r.conditions.map(conditionText).join(" AND ") : "no conditions";
    const ids = r.all_ids ?? [];
    const list = r.suppliers
      .slice(0, BRAKE_LIST_MAX)
      .map((s) => `${s.supplier_id} (${s.supplier_name}, ${s.country}, ${s.supplier_status}, ${key} ${fmt(s[key])})`)
      .join("; ");
    return (
      `${r.total_matching} brake suppliers match [${conds}]. All matching ids: ${ids.length ? ids.join(", ") : "none"}. ` +
      (list ? `Sorted by ${key} ${r.sort_by[0]?.order ?? "asc"}: ${list}. ` : "") +
      `Total PO volume of the matches: EUR ${(r.po_volume_total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${fmtEur(r.po_volume_total ?? 0)}; prospects have none).`
    );
  },
  view: (_r, handle) => `root = RankedList("${handle}")`,
  uiActions: (r, input, workflow) =>
    input.apply_workflow_requirements && !sameConditions(r.conditions, workflow.hard_requirements)
      ? [{ type: "set_hard_requirements", conditions: r.conditions }]
      : [],
  examples: ["How many brake suppliers are located in Germany?", "Which suppliers hold ISO/TS 22163?"],
  workedExamples: [
    { question: "How many brake suppliers hold ISO/TS 22163?", input: { conditions: [{ field: "certifications", op: "contains", value: "ISO/TS 22163" }] } },
    {
      question: "Which rail brake suppliers have a Geopolitical Risk Score of 50 or above?",
      input: {
        conditions: [
          { field: "applications", op: "contains", value: "Rail" },
          { field: "geopolitical_risk", op: "gte", value: 50 },
        ],
      },
    },
  ],
});
