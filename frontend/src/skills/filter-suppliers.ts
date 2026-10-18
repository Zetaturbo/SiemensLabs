import { z } from "zod/v4";
import { defineSkill } from "./types";
import { callDataTool } from "@/lib/data-api/client";
import type { FilterCondition } from "@/lib/data-api/types";

const condition = z.object({
  field: z.string(),
  op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in", "between"]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
});

interface FilterResult {
  total_matching: number;
  suppliers: Array<Record<string, unknown>>;
}

/** Example skill. Copy this file for the others; keep the description shape. */
export const filterSuppliers = defineSkill({
  name: "filter_suppliers",
  description:
    "Finds suppliers that meet hard requirements (score levels, delivery rating, volume, sourcing risk) and sorts them. " +
    "Use when the buyer asks to find, list or show suppliers matching conditions. " +
    "Do not use to compare named suppliers (compare_suppliers) or to explain one supplier's score (explain_supplier). " +
    "Renders a ranked list with pin-to-shortlist actions.",
  priority: "core",
  stage: "shortlist",
  input: z.object({
    conditions: z.array(condition).describe("AND-combined filter conditions"),
    sort_by: z.array(z.object({ field: z.string(), order: z.enum(["asc", "desc"]) })).default([{ field: "total_risk_index", order: "asc" }]),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  run: async (input, ctx) => {
    const res = await callDataTool<FilterResult>("filter_suppliers", {
      conditions: input.conditions as FilterCondition[],
      sort_by: input.sort_by,
      limit: input.limit,
      offset: 0,
    });
    if (!res.ok || !res.data) throw new Error(res.error?.message ?? "filter_suppliers failed");
    const handle = ctx.putResult(res.data);
    return { ...res.data, handle };
  },
  summarize: (r) =>
    `${r.total_matching} suppliers match; showing ${r.suppliers.length}. Top ids: ${r.suppliers
      .slice(0, 5)
      .map((s) => s.supplier_id)
      .join(", ")}.`,
  view: (_r, handle) => `root = RankedList(resultId="${handle}")`,
  examples: [
    "Show me low-risk suppliers with delivery rating above 95",
    "Which suppliers have no Critical quality score and volume above 1 M EUR?",
  ],
});
