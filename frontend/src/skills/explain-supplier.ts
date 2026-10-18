import { z } from "zod/v4";
import { defineSkill } from "./types";
import { PROFILE_IDS, dataOrThrow, fmt, normalizeSupplierId, supplierIdSchema } from "./shared";

interface Contribution {
  field: string;
  value: number;
  level: string;
  weight: number;
  percentile: number;
  contribution_vs_mean: number;
}

interface ExplainResult {
  supplier_id: string;
  supplier_name?: string;
  total_risk_index: number;
  total_risk_level: string;
  percentile: number;
  dataset_mean: number;
  profile_id?: string;
  profile_score?: number;
  contributions: Contribution[];
  critical_fields: string[];
  operational_metrics: { delivery_rating: number; order_confirmation_rate: number; order_change_rate: number };
  requested_id: string;
  handle: string;
}

export const explainSupplier = defineSkill({
  name: "explain_supplier",
  description:
    "Explains one supplier's risk: which scores drive its Total Risk Index (or profile score) above or below the dataset mean, its percentile, " +
    "Critical fields and delivery metrics. Use when the buyer asks why a supplier's score is high or low, what drives it, or for a deep dive on ONE supplier id " +
    "('this supplier' = the selected supplier). Do not use for two or more suppliers (compare_suppliers) or for real company names (research_company). " +
    "Renders a contribution waterfall.",
  priority: "core",
  stage: "any",
  input: z.object({
    id: supplierIdSchema.describe('One supplier id like "SUPP_00018"; use the selected supplier for "this supplier"'),
    profile_id: z.enum(PROFILE_IDS).optional().describe("Weight profile; default = workflow profile"),
  }),
  run: async (input, ctx): Promise<ExplainResult> => {
    const id = normalizeSupplierId(input.id || ctx.workflow.selected_supplier || "");
    if (!/^SUPP_\d{5}$/.test(id)) throw new Error(`explain_supplier needs a supplier id like SUPP_00018, got "${input.id}"`);
    const profile_id = input.profile_id ?? ctx.workflow.profile_id ?? "default";
    const data = await dataOrThrow<Omit<ExplainResult, "handle" | "requested_id">>("explain_supplier", { id, profile_id });
    const result = { ...data, requested_id: id };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const up = r.contributions
      .filter((c) => c.contribution_vs_mean > 0)
      .slice(0, 3)
      .map((c) => `${c.field} ${fmt(c.value)} (${c.level}, +${fmt(c.contribution_vs_mean, 2)})`)
      .join(", ");
    const down = r.contributions
      .filter((c) => c.contribution_vs_mean < 0)
      .slice(-2)
      .map((c) => `${c.field} ${fmt(c.value)} (${fmt(c.contribution_vs_mean, 2)})`)
      .join(", ");
    const m = r.operational_metrics;
    // Mocks answer one fixed supplier; say so instead of letting the model attribute the numbers to the requested id.
    const mismatch =
      r.requested_id !== r.supplier_id ? `Note: the data service returned ${r.supplier_id}, not ${r.requested_id} (mock data); attribute these values to ${r.supplier_id}. ` : "";
    return (
      mismatch +
      `${r.supplier_id}: Total Risk Index ${r.total_risk_index} (${r.total_risk_level}), higher than ${fmt(r.percentile)}% of suppliers; dataset mean ${fmt(r.dataset_mean, 2)}. ` +
      `Top drivers vs mean: ${up || "none"}.${down ? ` Offsetting: ${down}.` : ""} ${r.critical_fields.length} Critical fields. ` +
      `Delivery rating ${fmt(m.delivery_rating, 2)}%, confirmation rate ${fmt(m.order_confirmation_rate, 2)}%.`
    );
  },
  view: (_r, handle) => `root = ContributionWaterfall("${handle}")`,
  uiActions: (r) => [{ type: "open_supplier", id: r.supplier_id }],
  examples: ["Why is the Total Risk Index of SUPP_00018 so high?", "What drives the risk of the selected supplier?"],
  workedExamples: [{ question: "Why is the Total Risk Index of SUPP_00018 so high?", input: { id: "SUPP_00018" } }],
});
