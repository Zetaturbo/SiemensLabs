import { z } from "zod/v4";
import { defineSkill } from "./types";
import { loadBrakeData } from "@/lib/data-api/brakes";
import { BRAKE_ID_RE, PRODUCT_TYPES } from "@/lib/data-api/datasets";
import { eur, fmtUnits, scoreLabel, topRawScores } from "./brake-rfq";
import { PROFILE_IDS, RISK_SCORES, dataOrThrow, fmt, normalizeSupplierId, supplierIdSchema } from "./shared";

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

// ------------------------------------------------------------------ brakes dataset: the risk briefing

interface BrakeBriefing {
  country: string;
  region: string;
  supplier_status: "Approved" | "Prospect";
  certifications: string[];
  /** Three highest raw risk scores (cut short on a tie), highest first. */
  top_scores: Array<{ field: string; value: number; level: string }>;
  delivery_rating: number | null;
  offerings: Array<{ product_type: string; unit_price_eur: number; moq_units: number; lead_time_days: number; annual_capacity_units: number }>;
  /** MOQ of the RFQ product vs the monthly call-off (annual volume / 12), when a volume is known. */
  moq_check: { product_type: string; moq_units: number; monthly_call_off: number; annual_volume: number; fits: boolean } | null;
  data_source: "live" | "csv";
}

type BrakeExplainResult = ExplainResult & { briefing: BrakeBriefing };

/** explain_supplier on the brakes dataset: the explanation plus the briefing facts the SKILL.md step 8 asks for. */
export const explainSupplierBrakes = defineSkill({
  name: "explain_supplier",
  description:
    "Risk briefing on ONE brake supplier (BRK_ id, brakes dataset): country, region, Approved or Prospect, certifications, Total Risk Index with level, " +
    "the three highest risk scores with levels, delivery rating (prospects have no delivery history), its offerings, MOQ vs the monthly call-off when an " +
    "annual volume is known, and which scores drive its Total Risk Index above or below the dataset mean. Use for 'risk briefing on BRK_0046', " +
    "'why is BRK_0030 risky', a supplier's country, status, certifications, delivery rating or overall risk score, and certification checks. " +
    "Do not use for two or more suppliers (compare_suppliers) or for RFQ qualification and awards (qualify_for_rfq). Renders a supplier card.",
  priority: "core",
  stage: "any",
  input: z.object({
    id: z.string().describe('One brake supplier id like "BRK_0046"; use the selected supplier for "this supplier"'),
    product_type: z.enum(PRODUCT_TYPES).optional().describe("RFQ product, for the MOQ check"),
    annual_volume: z.number().int().positive().optional().describe("RFQ units per year, for MOQ vs monthly call-off (volume / 12)"),
    profile_id: z.enum(PROFILE_IDS).optional().describe("Weight profile; default = workflow profile"),
  }),
  run: async (input, ctx): Promise<BrakeExplainResult> => {
    const id = normalizeSupplierId(input.id || ctx.workflow.selected_supplier || "", "brakes");
    if (!BRAKE_ID_RE.test(id)) throw new Error(`explain_supplier needs a brake supplier id like BRK_0046, got "${input.id}"`);
    const profile_id = input.profile_id ?? ctx.workflow.profile_id ?? "default";
    const [data, rowData, brake] = await Promise.all([
      dataOrThrow<Omit<ExplainResult, "handle" | "requested_id">>("explain_supplier", { id, profile_id }, "brakes"),
      dataOrThrow<{ suppliers: Array<Record<string, unknown>> }>("get_suppliers", { ids: [id] }, "brakes"),
      loadBrakeData(),
    ]);
    const row = rowData.suppliers[0] ?? {};
    const own = brake.rows.filter((r) => r.supplier_id === id);
    const first = own[0];
    const pick = input.product_type ? own.find((o) => o.product_type === input.product_type) : own.length === 1 ? own[0] : undefined;
    const volume = input.annual_volume;
    const monthly = volume ? Math.floor(volume / 12) : 0;
    const briefing: BrakeBriefing = {
      country: first?.country ?? String(row.country ?? ""),
      region: first?.region ?? String(row.region ?? ""),
      supplier_status: (first?.supplier_status ?? row.supplier_status) === "Prospect" ? "Prospect" : "Approved",
      certifications:
        first?.certifications ??
        String(row.certifications ?? "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
      top_scores: topRawScores(row, RISK_SCORES),
      delivery_rating: typeof row.delivery_rating === "number" ? row.delivery_rating : null,
      offerings: own.map((o) => ({
        product_type: o.product_type,
        unit_price_eur: o.unit_price_eur,
        moq_units: o.moq_units,
        lead_time_days: o.lead_time_days,
        annual_capacity_units: o.annual_capacity_units,
      })),
      moq_check: pick && volume ? { product_type: pick.product_type, moq_units: pick.moq_units, monthly_call_off: monthly, annual_volume: volume, fits: pick.moq_units <= monthly } : null,
      data_source: brake.source,
    };
    const result = { ...data, requested_id: id, briefing };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const b = r.briefing;
    const tops = b.top_scores.map((t) => `${scoreLabel(t.field)} ${t.value} (${t.level})`).join(", ");
    const perf =
      b.supplier_status === "Prospect" || b.delivery_rating === null
        ? "No delivery history: it is a Prospect with no order history, so delivery rating and PO volume are not available."
        : `Delivery rating ${b.delivery_rating.toFixed(2)}%.`;
    const offers = b.offerings
      .map((o) => `${o.product_type} ${eur(o.unit_price_eur)} (MOQ ${fmtUnits(o.moq_units)}, lead time ${o.lead_time_days} days, capacity ${fmtUnits(o.annual_capacity_units)}/yr)`)
      .join("; ");
    const m = b.moq_check;
    const moq = m ? ` MOQ ${fmtUnits(m.moq_units)} units ${m.fits ? "fits" : "is above"} the monthly call-off of ${fmtUnits(m.monthly_call_off)} (${fmtUnits(m.annual_volume)} / 12).` : "";
    const drivers = r.contributions
      .filter((c) => c.contribution_vs_mean > 0)
      .slice(0, 3)
      .map((c) => `${c.field} +${fmt(c.contribution_vs_mean, 2)}`)
      .join(", ");
    return (
      `${r.supplier_id} (${r.supplier_name}): ${b.supplier_status} supplier in ${b.country} (${b.region}). ` +
      `Total Risk Index ${r.total_risk_index} (${r.total_risk_level}; 0 = no risk, 100 = maximum). Highest risk areas: ${tops}. ` +
      `Certifications: ${b.certifications.join(", ") || "none"}. ${perf} Offers: ${offers || "none"}.${moq}` +
      (drivers ? ` Extra context, weighted contribution vs the brake-supplier mean (not the raw ranking): ${drivers}.` : "")
    );
  },
  view: (_r, handle) => `root = SupplierCard("${handle}")`,
  uiActions: (r) => [{ type: "open_supplier", id: r.supplier_id }],
  examples: ["Give me a short risk briefing on BRK_0046 before we negotiate.", "Is BRK_0014 ECE R90 certified?"],
  workedExamples: [
    {
      question: "Give me a short risk briefing on BRK_0046 before we negotiate. (RFQ: 30,000 rail brake pads a year)",
      input: { id: "BRK_0046", product_type: "Rail brake pads", annual_volume: 30000 },
    },
  ],
});
