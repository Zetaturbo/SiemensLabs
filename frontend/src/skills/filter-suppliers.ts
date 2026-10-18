import { z } from "zod/v4";
import { defineSkill } from "./types";
import { conditionSchema, conditionText, dataOrThrow, fmt, FILTER_FIELDS, mergeConditions, sameConditions, type Condition } from "./shared";

interface FilterResult {
  total_matching: number;
  suppliers: Array<Record<string, unknown>>;
  conditions: Condition[];
  sort_by: Array<{ field: string; order: "asc" | "desc" }>;
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
