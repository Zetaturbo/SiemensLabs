import { z } from "zod/v4";
import { loadBrakeData } from "@/lib/data-api/brakes";
import { CERTIFICATIONS, PRODUCT_TYPES, REGIONS } from "@/lib/data-api/datasets";
import { defineSkill } from "./types";
import { RISK_GATE_DEFAULT, eur, fmtUnits, gateText, idName, qualifyRfq, specText, type EvaluatedOffer, type RfqOutcome, type RfqSpec } from "./brake-rfq";
import { normalizeSupplierId } from "./shared";

/** Which RFQ step the buyer asked; the summary carries that step only (the board shows all of them). */
export const RFQ_FOCUS = ["qualification", "exclusion", "cheapest", "award", "gate_cost", "dual_sourcing", "moq"] as const;
export type RfqFocus = (typeof RFQ_FOCUS)[number];

export interface RfqResult extends RfqOutcome {
  focus: RfqFocus;
  /** Supplier the buyer asked about (exclusion reason, gate result, MOQ), if any. */
  focus_id: string | null;
  source: "live" | "csv";
  handle: string;
}

const gateLine = (o: EvaluatedOffer) =>
  o.gate?.pass ? `passes (Total Risk Index ${o.total_risk_index}, Financial Health Score ${o.financial_health})` : `fails on ${o.gate?.failures.join(" and ")}`;

const prospectNote = (o: { supplier_id: string; supplier_status: string }) =>
  o.supplier_status === "Prospect" ? ` ${o.supplier_id} is a Prospect with no order history: it must be onboarded first.` : "";

function supplierLine(r: RfqResult): string {
  const o = r.offers.find((x) => x.supplier_id === r.focus_id);
  if (!o) return `${r.focus_id} does not offer ${r.spec.product_type}, so it is not part of this RFQ.`;
  const head = `${idName(o)} quotes ${eur(o.unit_price_eur)} (lead time ${o.lead_time_days} days, capacity ${fmtUnits(o.annual_capacity_units)}/yr, ${o.supplier_status}).`;
  if (o.qualified) return `${head} It meets every mandatory requirement${o.gate ? `; risk gate: it ${gateLine(o)}` : ""}.`;
  const n = o.failed.length;
  return `${head} It fails ${n} mandatory requirement${n === 1 ? "" : "s"}: ${o.failed.join("; ")}.${n === 1 ? " That is the only failed requirement; it meets all the others." : ""}`;
}

/**
 * Short, step-focused summaries: Nemotron Ultra (reasoning off) starts inventing values once a tool result runs past
 * ~2,000 characters, so each focus returns the few facts its step needs (under ~900 characters).
 */
function summarizeRfq(r: RfqResult): string {
  const s = r.spec;
  const q = r.offers.filter((o) => o.qualified);
  const head = `RFQ ${specText(s)}. ${r.offers.length} offerings checked: ${q.length} qualified (${q.map((o) => o.supplier_id).join(", ") || "none"}), ${r.excluded_ids.length} excluded.`;
  const c = r.cheapest_qualified;
  const a = r.award;
  switch (r.focus) {
    case "qualification":
      return `${head} Qualified, cheapest first: ${q.map((o) => `${idName(o)} ${eur(o.unit_price_eur)}`).join(", ") || "none"}.`;
    case "exclusion":
      return r.focus_id
        ? `${supplierLine(r)} RFQ: ${specText(s)}.`
        : `${head} Excluded: ${r.offers.filter((o) => !o.qualified).map((o) => `${o.supplier_id}: ${o.failed.join("; ")}`).join(" | ") || "none"}.`;
    case "cheapest":
      return c
        ? `${head} Cheapest qualified: ${idName(c)} at ${eur(c.unit_price_eur)}; annual spend ${fmtUnits(s.annual_volume)} x ${eur(c.unit_price_eur)} = ${eur(c.annual_cost_eur)}.` +
            (r.tie_at_top ? ` Tie: ${r.tie_at_top.join(" and ")} are within EUR 0.05.` : "")
        : `${head} No supplier qualifies.`;
    case "award": {
      if (!q.length) return `${head} No supplier qualifies, so there is no award.`;
      const gate = `Risk gate (${gateText(s)}): ${q.map((o) => `${o.supplier_id} ${gateLine(o)}`).join("; ")}.`;
      if (!a) return `${head} ${gate} No award: every qualified supplier fails the gate.`;
      const cheapestFails = c && c.supplier_id !== a.supplier_id ? ` The cheapest qualified offer, ${c.supplier_id} at ${eur(c.unit_price_eur)}, fails the gate.` : " It is also the cheapest qualified offer.";
      return (
        `${head} ${gate} Award: ${idName(a)}, ${a.country}, ${a.supplier_status}, at ${eur(a.unit_price_eur)}, annual spend ${eur(a.annual_cost_eur)}.${cheapestFails}${prospectNote(a)}` +
        (r.award_tie ? ` Tie: ${r.award_tie.join(" and ")} are within EUR 0.05.` : "")
      );
    }
    case "gate_cost":
      if (!a || !c) return `${head} No award passes the gate, so the gate has no cost to compare.`;
      return a.supplier_id === c.supplier_id
        ? `Award ${idName(a)} is also the cheapest qualified offer, so the risk gate costs EUR 0.00 per year.`
        : `Cost of the risk gate: award ${idName(a)} at ${eur(a.unit_price_eur)} vs the cheapest qualified ${idName(c)} at ${eur(c.unit_price_eur)}: ` +
            `(${eur(a.unit_price_eur)} - ${eur(c.unit_price_eur)}) x ${fmtUnits(s.annual_volume)} = ${eur(r.gate_cost_eur!)} per year (${eur(a.annual_cost_eur)} vs ${eur(c.annual_cost_eur)}).`;
    case "dual_sourcing": {
      if (!r.dual) return `${head} No dual-sourcing option: ${r.dual_note}.`;
      const { primary: p, secondary: d } = r.dual;
      const cap = [p, d].filter((x) => !x.capacity_ok).map((x) => ` ${x.supplier_id} capacity is below its share.`).join("");
      return (
        `Dual sourcing ${p.share_pct}/${d.share_pct} across the two cheapest qualified suppliers that pass the risk gate: ` +
        `${idName(p)} ${fmtUnits(p.units)} units x ${eur(p.unit_price_eur)} = ${eur(p.cost_eur)}; ${idName(d)} ${fmtUnits(d.units)} units x ${eur(d.unit_price_eur)} = ${eur(d.cost_eur)}. ` +
        `Total ${eur(r.dual.total_eur)} per year, ${eur(r.dual.extra_vs_single_eur)} more than single-sourcing from ${p.supplier_id} (${eur(r.award!.annual_cost_eur)}).` +
        `${prospectNote(p)}${prospectNote(d)}${cap}`
      );
    }
    case "moq": {
      const list = r.focus_id ? r.offers.filter((o) => o.supplier_id === r.focus_id) : q;
      if (!list.length) return `${r.focus_id ?? "No supplier"} has no ${s.product_type} offer in this RFQ.`;
      return `Monthly call-off ${fmtUnits(r.moq.monthly_call_off)} units (${fmtUnits(s.annual_volume)} / 12): ${list
        .map((o) => `${o.supplier_id} MOQ ${fmtUnits(o.moq_units)} units ${o.moq_fits ? "fits (below or equal to the call-off)" : "is above the call-off"}`)
        .join("; ")}.`;
    }
  }
}

export const qualifyForRfq = defineSkill({
  name: "qualify_for_rfq",
  description:
    "Runs a brake RFQ (brakes dataset) against one spec: checks every offering of the product type against the mandatory requirements " +
    "(certifications, copper-free, max lead time, min annual capacity = volume unless given, region, approved-only) and names the failed criteria; " +
    "ranks the qualified by unit price with annual cost = volume x unit price; applies the risk gate (default Total Risk Index < 50 and Financial Health Score < 50); " +
    "awards the cheapest qualified supplier that passes the gate; costs the gate ((award price - cheapest qualified price) x volume); splits 70/30 across the two " +
    "cheapest gate-passing suppliers; checks MOQ against the monthly call-off (volume / 12). Use for RFQ steps 2 to 7 and set focus to the step asked: " +
    "qualification, exclusion (why a supplier is out; pass supplier_id), cheapest (cheapest qualified offer and annual spend), award (risk gate and award), " +
    "gate_cost, dual_sourcing, moq. Pass the full spec every turn (restate it from the conversation). " +
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
    focus: z.enum(RFQ_FOCUS).default("qualification").describe("The step the buyer asked"),
    supplier_id: z.string().optional().describe("Supplier the buyer asks about, e.g. why BRK_0009 is excluded, or whose MOQ to check"),
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
    const focus: RfqFocus = focus_id && input.focus === "qualification" ? "exclusion" : input.focus;
    const result = { ...qualifyRfq(data.rows, spec), focus, focus_id, source: data.source };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => `${summarizeRfq(r)} Unit prices exclude freight, duties and tooling.`,
  view: (_r, handle) => `root = RfqBoard("${handle}")`,
  examples: [
    "Which of them meet ISO/TS 22163, lead time of 90 days or less and capacity of at least 30,000 a year?",
    "Apply our risk gate and recommend an award",
  ],
  workedExamples: [
    {
      question: "Which of them meet our mandatory requirements: ISO/TS 22163 certified, lead time of 90 days or less, and capacity of at least 30,000 units a year? (30,000 rail brake pads a year)",
      input: { product_type: "Rail brake pads", annual_volume: 30000, certifications: ["ISO/TS 22163"], max_lead_time_days: 90, focus: "qualification" },
    },
    {
      question: "BRK_0009 is the cheapest offer. Why is it not on the shortlist? (same RFQ)",
      input: { product_type: "Rail brake pads", annual_volume: 30000, certifications: ["ISO/TS 22163"], max_lead_time_days: 90, focus: "exclusion", supplier_id: "BRK_0009" },
    },
    {
      question: "Apply our risk gate, Total Risk Index below 50 and Financial Health Score below 50, and recommend an award. (same RFQ)",
      input: { product_type: "Rail brake pads", annual_volume: 30000, certifications: ["ISO/TS 22163"], max_lead_time_days: 90, focus: "award" },
    },
  ],
});
