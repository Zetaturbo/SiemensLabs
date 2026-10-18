import { z } from "zod/v4";
import { loadBrakeData } from "@/lib/data-api/brakes";
import { CERTIFICATIONS, PRODUCT_TYPES, REGIONS } from "@/lib/data-api/datasets";
import { defineSkill } from "./types";
import { RISK_GATE_DEFAULT, eur, fmtUnits, gateText, idName, qualifyRfq, specText, type EvaluatedOffer, type RfqOutcome, type RfqSpec } from "./brake-rfq";
import { normalizeSupplierId } from "./shared";

export interface RfqResult extends RfqOutcome {
  /** Supplier the buyer asked about (exclusion reason, gate result), if any. */
  focus_id: string | null;
  source: "live" | "csv";
  handle: string;
}

const gateLine = (o: EvaluatedOffer) =>
  o.gate?.pass ? `passes (Total Risk Index ${o.total_risk_index}, Financial Health Score ${o.financial_health})` : `fails: ${o.gate?.failures.join(", ")}`;

function focusLine(r: RfqResult): string {
  if (!r.focus_id) return "";
  const o = r.offers.find((x) => x.supplier_id === r.focus_id);
  if (!o) return `${r.focus_id} does not offer ${r.spec.product_type}, so it is not part of this RFQ. `;
  const head = `${idName(o)} quotes ${eur(o.unit_price_eur)} (lead time ${o.lead_time_days} days, capacity ${fmtUnits(o.annual_capacity_units)}/yr, ${o.supplier_status}). `;
  if (o.qualified)
    return head + `It meets every mandatory requirement${o.gate ? `; risk gate: ${gateLine(o)}` : ""}. `;
  const n = o.failed.length;
  return head + `It fails ${n} mandatory requirement${n === 1 ? "" : "s"}: ${o.failed.join("; ")}${n === 1 ? " (the only failed requirement; it meets all others)" : ""}. `;
}

export const qualifyForRfq = defineSkill({
  name: "qualify_for_rfq",
  description:
    "Runs a brake RFQ (brakes dataset) against one spec: every offering of the product type is checked against the mandatory requirements " +
    "(certifications, copper-free, max lead time, min annual capacity = volume unless given, region, approved-only) with the named failed criteria; " +
    "the qualified are ranked by unit price with annual cost = volume x unit price; the risk gate (default Total Risk Index < 50 and Financial Health Score < 50) " +
    "passes or fails each qualified supplier with the failing score; the award is the cheapest qualified supplier that passes the gate; the cost of the gate is " +
    "(award price - cheapest qualified price) x volume; dual sourcing splits 70/30 across the two cheapest gate-passing suppliers; MOQ is checked against the " +
    "monthly call-off (volume / 12). Use for RFQ steps 2 to 7: qualification, why a supplier is excluded (pass supplier_id), cheapest qualified offer and annual spend, " +
    "risk gate and award, cost of the gate, dual sourcing, MOQ vs call-off. Pass the same spec every turn (restate it from the conversation). " +
    "Do not use for plain 'who offers X' (find_offerings) or a risk briefing on one supplier (explain_supplier). Renders an RFQ board.",
  priority: "core",
  stage: "any",
  input: z.object({
    product_type: z.enum(PRODUCT_TYPES).describe("Catalog product type of the RFQ"),
    annual_volume: z.number().int().positive().describe("Units per year"),
    certifications: z.array(z.enum(CERTIFICATIONS)).default([]).describe("Mandatory certifications (all required)"),
    copper_free: z.boolean().default(false).describe("true when copper-free is mandatory"),
    max_lead_time_days: z.number().int().positive().optional().describe("Maximum lead time in days"),
    min_annual_capacity: z.number().int().positive().optional().describe("Default: annual_volume"),
    region: z.enum(REGIONS).optional().describe("Only suppliers located in this region"),
    approved_only: z.boolean().default(false).describe("true = exclude Prospects (no onboarding possible)"),
    risk_gate: z.boolean().default(true).describe("Apply the risk gate"),
    max_total_risk_index: z.number().default(RISK_GATE_DEFAULT.max_total_risk_index).describe("Gate: Total Risk Index must be below this"),
    max_financial_health: z.number().default(RISK_GATE_DEFAULT.max_financial_health).describe("Gate: Financial Health Score must be below this"),
    primary_share: z.number().min(50).max(95).default(70).describe("Dual sourcing: primary supplier's share in percent"),
    monthly_call_off: z.number().int().positive().optional().describe("Units per call-off; default annual_volume / 12"),
    supplier_id: z.string().optional().describe("Supplier the buyer asks about, e.g. why BRK_0009 is excluded"),
  }),
  run: async (input, ctx): Promise<RfqResult> => {
    const spec: RfqSpec = {
      product_type: input.product_type,
      annual_volume: input.annual_volume,
      certifications: input.certifications,
      copper_free: input.copper_free,
      max_lead_time_days: input.max_lead_time_days ?? null,
      min_annual_capacity: input.min_annual_capacity ?? input.annual_volume,
      region: input.region ?? null,
      approved_only: input.approved_only,
      risk_gate: input.risk_gate,
      max_total_risk_index: input.max_total_risk_index,
      max_financial_health: input.max_financial_health,
      primary_share: input.primary_share,
      monthly_call_off: input.monthly_call_off ?? Math.floor(input.annual_volume / 12),
    };
    const data = await loadBrakeData();
    const focus_id = input.supplier_id ? normalizeSupplierId(input.supplier_id, "brakes") : null;
    if (focus_id && !data.rows.some((r) => r.supplier_id === focus_id)) throw new Error(`${focus_id} does not exist; brake supplier ids run from BRK_0001 to BRK_0060`);
    const result = { ...qualifyRfq(data.rows, spec), focus_id, source: data.source };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const s = r.spec;
    const q = r.offers.filter((o) => o.qualified);
    const lines: string[] = [];
    lines.push(focusLine(r) + `RFQ: ${specText(s)}. ${r.offers.length} offering(s) checked: ${q.length} qualified, ${r.excluded_ids.length} excluded.`);
    lines.push(
      q.length
        ? `Qualified, cheapest first: ${q.map((o) => `${idName(o)} ${eur(o.unit_price_eur)} x ${fmtUnits(s.annual_volume)} = ${eur(o.annual_cost_eur)}/yr, ${o.supplier_status}`).join("; ")}.` +
            (r.tie_at_top ? ` Tie: ${r.tie_at_top.join(" and ")} are within EUR 0.05.` : "")
        : "No supplier qualifies.",
    );
    const ex = r.offers.filter((o) => !o.qualified);
    if (ex.length) lines.push(`Excluded: ${ex.map((o) => `${o.supplier_id} ${eur(o.unit_price_eur)}: ${o.failed.join("; ")}`).join(" | ")}.`);
    if (s.risk_gate && q.length) {
      lines.push(`Risk gate (${gateText(s)}): ${q.map((o) => `${o.supplier_id} ${gateLine(o)}`).join("; ")}.`);
    }
    if (r.award) {
      const a = r.award;
      const c = r.cheapest_qualified!;
      lines.push(
        `Award: ${idName(a)}, ${a.country}, ${a.supplier_status}, at ${eur(a.unit_price_eur)}, annual spend ${eur(a.annual_cost_eur)} (Total Risk Index ${a.total_risk_index}, Financial Health Score ${a.financial_health}).` +
          (a.supplier_id !== c.supplier_id
            ? ` The cheapest qualified offer ${c.supplier_id} (${eur(c.unit_price_eur)}) fails the risk gate.` +
              ` Cost of the risk gate: (${eur(a.unit_price_eur)} - ${eur(c.unit_price_eur)}) x ${fmtUnits(s.annual_volume)} = ${eur(r.gate_cost_eur!)} per year.`
            : ` It is also the cheapest qualified offer, so the risk gate costs nothing (EUR 0.00).`) +
          (a.supplier_status === "Prospect" ? ` ${a.supplier_id} is a Prospect with no order history: onboard it before award.` : "") +
          (r.award_tie ? ` Tie: ${r.award_tie.join(" and ")} are within EUR 0.05.` : ""),
      );
    } else if (q.length) lines.push(`No award: every qualified supplier fails the risk gate.`);
    if (r.dual) {
      const { primary: p, secondary: d } = r.dual;
      const flag = [p, d].filter((x) => x.supplier_status === "Prospect").map((x) => `${x.supplier_id} is a Prospect with no order history and must be onboarded first`);
      const cap = [p, d].filter((x) => !x.capacity_ok).map((x) => `${x.supplier_id} capacity is below its share`);
      lines.push(
        `Dual sourcing ${p.share_pct}/${d.share_pct}: ${p.supplier_id} ${fmtUnits(p.units)} units x ${eur(p.unit_price_eur)} = ${eur(p.cost_eur)}; ` +
          `${idName(d)} ${fmtUnits(d.units)} units x ${eur(d.unit_price_eur)} = ${eur(d.cost_eur)}; total ${eur(r.dual.total_eur)} per year, ` +
          `${eur(r.dual.extra_vs_single_eur)} more than single-sourcing from ${p.supplier_id}.${[...flag, ...cap].length ? ` ${[...flag, ...cap].join("; ")}.` : ""}`,
      );
    } else if (r.dual_note) lines.push(`No dual-sourcing option: ${r.dual_note}.`);
    if (q.length)
      lines.push(
        `MOQ vs monthly call-off ${fmtUnits(r.moq.monthly_call_off)}: ${q.map((o) => `${o.supplier_id} MOQ ${fmtUnits(o.moq_units)} ${o.moq_fits ? "fits" : "is above the call-off"}`).join("; ")}.`,
      );
    lines.push("Unit prices exclude freight, duties and tooling.");
    return lines.join("\n");
  },
  view: (_r, handle) => `root = RfqBoard("${handle}")`,
  examples: [
    "Which of them meet ISO/TS 22163, lead time of 90 days or less and capacity of at least 30,000 a year?",
    "Apply our risk gate and recommend an award",
  ],
  workedExamples: [
    {
      question: "Which of them meet our mandatory requirements: ISO/TS 22163 certified, lead time of 90 days or less, and capacity of at least 30,000 units a year? (30,000 rail brake pads a year)",
      input: { product_type: "Rail brake pads", annual_volume: 30000, certifications: ["ISO/TS 22163"], max_lead_time_days: 90 },
    },
    {
      question: "BRK_0009 is the cheapest offer. Why is it not on the shortlist? (same RFQ)",
      input: { product_type: "Rail brake pads", annual_volume: 30000, certifications: ["ISO/TS 22163"], max_lead_time_days: 90, supplier_id: "BRK_0009" },
    },
  ],
});
