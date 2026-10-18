import { z } from "zod/v4";
import { loadBrakeData } from "@/lib/data-api/brakes";
import { APPLICATIONS, CERTIFICATIONS, PRODUCT_TYPES, REGIONS } from "@/lib/data-api/datasets";
import { defineSkill } from "./types";
import { eur, filterOfferings, fmtUnits, offeringStats, type OfferingFilter } from "./brake-rfq";
import { normalizeIds } from "./shared";

export interface OfferingRowOut {
  offering_id: string;
  supplier_id: string;
  supplier_name: string;
  country: string;
  supplier_status: "Approved" | "Prospect";
  product_type: string;
  application: string;
  material: string | null;
  copper_free: boolean | null;
  unit_price_eur: number;
  moq_units: number;
  lead_time_days: number;
  annual_capacity_units: number;
  total_risk_index: number;
  total_risk_index_level: string;
  financial_health: number;
  financial_health_level: string;
}

export interface OfferingsResult {
  filters: OfferingFilter;
  total: number;
  supplier_ids: string[];
  offerings: OfferingRowOut[];
  stats: ReturnType<typeof offeringStats>;
  /** "live" = run_sql on the data service views, "csv" = data/brakes/source. */
  source: "live" | "csv";
  handle: string;
}

/** Filters in words for the summary and the block title. */
export function filterText(f: OfferingFilter): string {
  const parts = [
    f.product_type && f.product_type.toLowerCase(),
    f.application && `application ${f.application}`,
    f.material && `material ${f.material}`,
    f.copper_free !== undefined && (f.copper_free ? "copper-free" : "not copper-free"),
    f.certifications?.length && `certified ${f.certifications.join(" + ")}`,
    f.max_lead_time_days !== undefined && `lead time <= ${f.max_lead_time_days} days`,
    f.min_annual_capacity !== undefined && `capacity >= ${fmtUnits(f.min_annual_capacity)}`,
    f.max_moq !== undefined && `MOQ <= ${fmtUnits(f.max_moq)}`,
    f.region && `region ${f.region}`,
    f.country && `country ${f.country}`,
    f.supplier_status && `${f.supplier_status} suppliers`,
    f.supplier_ids?.length && f.supplier_ids.join(", "),
  ].filter(Boolean);
  return parts.join(", ") || "all brake offerings";
}

/** Offers listed by price in the summary, and offers that also get their full terms. */
const LIST_MAX = 10;
const TERMS_MAX = 3;

export const findOfferings = defineSkill({
  name: "find_offerings",
  description:
    "Brake product offerings (brakes dataset): who offers a product and at what terms. Filters on product type, application, material, copper-free, " +
    "max lead time, min annual capacity, max MOQ, required certifications, region, country, supplier status (Approved / Prospect) or supplier ids; " +
    "returns each offering with unit price, MOQ, lead time, capacity and its supplier's country, status, Total Risk Index and Financial Health Score, " +
    "cheapest first, plus count, average / min / max unit price and median lead time. Use for RFQ step 1 ('which suppliers offer rail brake pads'), " +
    "a supplier's price, lead time, MOQ or capacity for a product, offering counts ('how many copper-free offerings') and price or lead-time averages. " +
    "Do not use to qualify suppliers against an RFQ's mandatory requirements, apply the risk gate, award, cost or split an RFQ (qualify_for_rfq). Renders an offering table.",
  priority: "core",
  stage: "any",
  input: z.object({
    product_type: z.enum(PRODUCT_TYPES).optional().describe("Catalog product type; map the buyer's wording ('pads for trains' -> Rail brake pads)"),
    application: z.enum(APPLICATIONS).optional(),
    material: z.string().optional().describe("Friction material or construction, matched as text (Sintered, Organic composite, cast iron)"),
    copper_free: z.boolean().optional().describe("true = copper-free offerings only"),
    max_lead_time_days: z.number().int().positive().optional(),
    min_annual_capacity: z.number().int().positive().optional(),
    max_moq: z.number().int().positive().optional(),
    certifications: z.array(z.enum(CERTIFICATIONS)).optional().describe("Certifications the supplier must hold (all of them)"),
    region: z.enum(REGIONS).optional(),
    country: z.string().optional(),
    supplier_status: z.enum(["Approved", "Prospect"]).optional(),
    supplier_ids: z.array(z.string()).optional().describe('Only these suppliers, e.g. ["BRK_0046"]'),
  }),
  run: async (input, ctx): Promise<OfferingsResult> => {
    const filters: OfferingFilter = { ...input, supplier_ids: input.supplier_ids?.length ? normalizeIds(input.supplier_ids, "brakes") : undefined };
    for (const k of Object.keys(filters) as Array<keyof OfferingFilter>) if (filters[k] === undefined) delete filters[k];
    const data = await loadBrakeData();
    const unknown = (filters.supplier_ids ?? []).filter((id) => !data.rows.some((r) => r.supplier_id === id));
    if (unknown.length) throw new Error(`${unknown.join(", ")} does not exist; brake supplier ids run from BRK_0001 to BRK_0060`);
    const rows = filterOfferings(data.rows, filters);
    const offerings: OfferingRowOut[] = rows.map((r) => ({
      offering_id: r.offering_id,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      country: r.country,
      supplier_status: r.supplier_status,
      product_type: r.product_type,
      application: r.application,
      material: r.material,
      copper_free: r.copper_free,
      unit_price_eur: r.unit_price_eur,
      moq_units: r.moq_units,
      lead_time_days: r.lead_time_days,
      annual_capacity_units: r.annual_capacity_units,
      total_risk_index: r.total_risk_index,
      total_risk_index_level: r.total_risk_index_level,
      financial_health: r.financial_health,
      financial_health_level: r.financial_health_level,
    }));
    const result = {
      filters,
      total: offerings.length,
      supplier_ids: [...new Set(offerings.map((o) => o.supplier_id))].sort(),
      offerings,
      stats: offeringStats(rows),
      source: data.source,
    };
    return { ...result, handle: ctx.putResult(result) };
  },
  // Short on purpose: Nemotron Ultra (reasoning off) starts inventing values once a tool result runs past ~2,000
  // characters, so the summary carries the ordered list, the counts and full terms only for a handful of offers.
  summarize: (r) => {
    const s = r.stats;
    if (!r.total) return `No offering in the catalog matches [${filterText(r.filters)}] (0 offerings, 0 suppliers).`;
    const shown = r.offerings.slice(0, LIST_MAX);
    const order = shown.map((o) => `${o.supplier_id} (${o.supplier_name}) ${eur(o.unit_price_eur)}`).join(", ");
    const more =
      r.offerings.length > LIST_MAX ? ` (${r.offerings.length - LIST_MAX} more in the table${r.supplier_ids.length <= 30 ? `; all ${r.supplier_ids.length} supplier ids: ${r.supplier_ids.join(", ")}` : ""})` : "";
    const terms =
      r.offerings.length <= TERMS_MAX
        ? ` Terms: ${r.offerings
            .map(
              (o) =>
                `${o.supplier_id} ${o.product_type}: ${eur(o.unit_price_eur)}, lead time ${o.lead_time_days} days, capacity ${fmtUnits(o.annual_capacity_units)}/yr, ` +
                `MOQ ${fmtUnits(o.moq_units)}${o.copper_free === null ? "" : o.copper_free ? ", copper-free" : ", not copper-free"}, ${o.supplier_status}, ${o.country}, ` +
                `Total Risk Index ${o.total_risk_index} (${o.total_risk_index_level}), Financial Health Score ${o.financial_health} (${o.financial_health_level})`,
            )
            .join("; ")}.`
        : "";
    return (
      `${r.total} offering(s) from ${s.suppliers} supplier(s) match [${filterText(r.filters)}]. By unit price: ${order}${more}. ` +
      `Average unit price ${eur(s.avg_price_eur!)} (range ${eur(s.min_price_eur!)} to ${eur(s.max_price_eur!)}), median lead time ${s.median_lead_time_days} days; ` +
      `prices exclude freight, duties and tooling.${terms}`
    );
  },
  view: (_r, handle) => `root = OfferingTable("${handle}")`,
  examples: ["Which suppliers offer rail brake pads?", "What is the unit price of BRK_0040 for disc brake pads?"],
  workedExamples: [
    { question: "We need 30,000 rail brake pads a year for a regional train. Which suppliers offer rail brake pads?", input: { product_type: "Rail brake pads" } },
    { question: "How many copper-free friction offerings are in the catalog?", input: { copper_free: true } },
  ],
});
