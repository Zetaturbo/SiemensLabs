import { z } from "zod/v4";
import { defineSkill } from "./types";
import { RISK_SCORES, conditionSchema, dataOrThrow, datasetOf, fmt, normalizeSupplierId, supplierIdSchema } from "./shared";

interface SimilarResult {
  reference: string;
  total_matching?: number;
  similar: Array<{ supplier_id: string; supplier_name?: string; distance: number; total_risk_index: number; differences: Record<string, number> }>;
  must_be_lower: string[];
  handle: string;
}

export const findSimilar = defineSkill({
  name: "find_similar",
  description:
    "Finds alternative suppliers with a similar overall risk profile to one reference supplier, optionally strictly lower on chosen scores. " +
    "Use when the buyer asks for alternatives, replacements, a backup or 'suppliers like SUPP_x but with lower geopolitical risk'. " +
    "Do not use for plain threshold searches (filter_suppliers) or comparisons of named suppliers (compare_suppliers). Renders a table.",
  priority: "optional",
  stage: "any",
  input: z.object({
    id: supplierIdSchema.describe("Reference supplier; 'this supplier' = the selected supplier"),
    must_be_lower: z.array(z.enum(RISK_SCORES)).default([]).describe("Scores that must be strictly lower than the reference's"),
    conditions: z.array(conditionSchema).default([]),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  run: async (input, ctx): Promise<SimilarResult> => {
    const dataset = datasetOf(ctx.workflow);
    const id = normalizeSupplierId(input.id || ctx.workflow.selected_supplier || "", dataset);
    const data = await dataOrThrow<Omit<SimilarResult, "handle" | "must_be_lower">>("find_similar", {
      id,
      must_be_lower: input.must_be_lower,
      conditions: input.conditions,
      limit: input.limit,
    }, dataset);
    const result = { ...data, must_be_lower: input.must_be_lower };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const top = r.similar
      .slice(0, 3)
      .map((s) => `${s.supplier_id} (distance ${fmt(s.distance)}, TRI ${s.total_risk_index}${Object.entries(s.differences).map(([k, v]) => `, ${k} ${v > 0 ? "+" : ""}${v}`).join("")})`)
      .join("; ");
    return `${r.similar.length} alternatives to ${r.reference}${r.must_be_lower.length ? ` with lower ${r.must_be_lower.join(" and ")}` : ""}. Closest: ${top || "none"}.`;
  },
  view: (_r, handle) => `root = Table("${handle}")`,
  examples: ["Find alternatives to SUPP_00450 with lower geopolitical and environmental risk"],
  workedExamples: [
    {
      question: "Find alternatives to SUPP_00450 with lower geopolitical and environmental risk",
      input: { id: "SUPP_00450", must_be_lower: ["geopolitical_risk", "environmental_exposure"] },
    },
  ],
});
