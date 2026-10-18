import type { BrakeOfferingRow } from "@/lib/data-api/brakes";

/**
 * Deterministic RFQ math for the brakes dataset, shared by find_offerings and qualify_for_rfq (and the brake
 * briefing in explain_supplier). Pure functions over the offering rows from loadBrakeData(): no I/O, no model.
 * Wording of failed criteria follows the eval set (data/brakes/scripts/generate_brake_procurement_eval.py):
 * "missing ISO/TS 22163", "not copper-free", "located in Asia-Pacific (China)", "lead time 102 days exceeds 90",
 * "capacity 24,000 below 30,000", "status Prospect (approved suppliers only)".
 */

export const RISK_GATE_DEFAULT = { max_total_risk_index: 50, max_financial_health: 50 } as const;
/** Offers closer than this are a tie (the eval set keeps winners at least EUR 0.05 apart). */
export const TIE_EUR = 0.05;

export interface OfferingFilter {
  product_type?: string;
  application?: string;
  material?: string;
  copper_free?: boolean;
  max_lead_time_days?: number;
  min_annual_capacity?: number;
  max_moq?: number;
  certifications?: string[];
  region?: string;
  country?: string;
  supplier_status?: "Approved" | "Prospect";
  supplier_ids?: string[];
}

const eqi = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Offerings matching every given filter, cheapest first (ties by offering id). */
export function filterOfferings(rows: BrakeOfferingRow[], f: OfferingFilter): BrakeOfferingRow[] {
  return rows
    .filter(
      (r) =>
        (!f.product_type || eqi(r.product_type, f.product_type)) &&
        (!f.application || eqi(r.application, f.application)) &&
        (!f.material || (r.material ?? "").toLowerCase().includes(f.material.trim().toLowerCase())) &&
        (f.copper_free === undefined || r.copper_free === f.copper_free) &&
        (f.max_lead_time_days === undefined || r.lead_time_days <= f.max_lead_time_days) &&
        (f.min_annual_capacity === undefined || r.annual_capacity_units >= f.min_annual_capacity) &&
        (f.max_moq === undefined || r.moq_units <= f.max_moq) &&
        (f.certifications ?? []).every((c) => r.certifications.some((x) => eqi(x, c))) &&
        (!f.region || eqi(r.region, f.region)) &&
        (!f.country || eqi(r.country, f.country)) &&
        (!f.supplier_status || r.supplier_status === f.supplier_status) &&
        (!f.supplier_ids?.length || f.supplier_ids.includes(r.supplier_id)),
    )
    .sort((a, b) => a.unit_price_eur - b.unit_price_eur || a.offering_id.localeCompare(b.offering_id));
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Price and lead-time statistics over a set of offerings (aggregation questions). */
export function offeringStats(rows: BrakeOfferingRow[]) {
  const prices = rows.map((r) => r.unit_price_eur);
  return {
    offerings: rows.length,
    suppliers: new Set(rows.map((r) => r.supplier_id)).size,
    min_price_eur: prices.length ? Math.min(...prices) : null,
    max_price_eur: prices.length ? Math.max(...prices) : null,
    avg_price_eur: prices.length ? round2(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
    median_lead_time_days: median(rows.map((r) => r.lead_time_days)),
  };
}

// ------------------------------------------------------------------ RFQ qualification

export interface RfqSpec {
  product_type: string;
  annual_volume: number;
  certifications: string[];
  copper_free: boolean;
  max_lead_time_days: number | null;
  /** Default: the annual volume. */
  min_annual_capacity: number;
  region: string | null;
  approved_only: boolean;
  risk_gate: boolean;
  max_total_risk_index: number;
  max_financial_health: number;
  /** Share of the primary supplier in dual sourcing, percent (default 70). */
  primary_share: number;
  /** Units per call-off for the MOQ check (default annual volume / 12, rounded down). */
  monthly_call_off: number;
}

export interface EvaluatedOffer {
  offering_id: string;
  supplier_id: string;
  supplier_name: string;
  country: string;
  region: string;
  supplier_status: "Approved" | "Prospect";
  certifications: string[];
  unit_price_eur: number;
  lead_time_days: number;
  annual_capacity_units: number;
  moq_units: number;
  copper_free: boolean | null;
  total_risk_index: number;
  total_risk_index_level: string;
  financial_health: number;
  financial_health_level: string;
  delivery_rating: number | null;
  qualified: boolean;
  /** Failed mandatory requirements in the eval's wording; empty when qualified. */
  failed: string[];
  /** volume x unit price */
  annual_cost_eur: number;
  /** Gate result (null when the gate is off). */
  gate: { pass: boolean; failures: string[] } | null;
  /** MOQ fits the monthly call-off. */
  moq_fits: boolean;
}

export interface SourcingShare {
  supplier_id: string;
  supplier_name: string;
  supplier_status: "Approved" | "Prospect";
  share_pct: number;
  units: number;
  unit_price_eur: number;
  cost_eur: number;
  capacity_ok: boolean;
}

export interface RfqOutcome {
  spec: RfqSpec;
  offers: EvaluatedOffer[];
  qualified_ids: string[];
  excluded_ids: string[];
  cheapest_qualified: EvaluatedOffer | null;
  /** Cheapest qualified offer within TIE_EUR of the next one. */
  tie_at_top: string[] | null;
  gate_failures: EvaluatedOffer[];
  award: EvaluatedOffer | null;
  award_tie: string[] | null;
  /** (award price - cheapest qualified price) x volume; 0 when the award is the cheapest qualified. */
  gate_cost_eur: number | null;
  dual: { primary: SourcingShare; secondary: SourcingShare; total_eur: number; extra_vs_single_eur: number } | null;
  /** Why there is no dual-sourcing option. */
  dual_note: string | null;
  moq: { monthly_call_off: number; over: string[] };
}

const units = (v: number) => v.toLocaleString("en-US");

export function failedCriteria(spec: RfqSpec, o: BrakeOfferingRow): string[] {
  const failed = spec.certifications.filter((c) => !o.certifications.some((x) => eqi(x, c))).map((c) => `missing ${c}`);
  if (spec.copper_free && o.copper_free !== true) failed.push("not copper-free");
  if (spec.region && !eqi(o.region, spec.region)) failed.push(`located in ${o.region} (${o.country})`);
  if (spec.max_lead_time_days !== null && o.lead_time_days > spec.max_lead_time_days) failed.push(`lead time ${o.lead_time_days} days exceeds ${spec.max_lead_time_days}`);
  if (o.annual_capacity_units < spec.min_annual_capacity) failed.push(`capacity ${units(o.annual_capacity_units)} below ${units(spec.min_annual_capacity)}`);
  if (spec.approved_only && o.supplier_status !== "Approved") failed.push(`status ${o.supplier_status} (approved suppliers only)`);
  return failed;
}

export function gateFailures(spec: RfqSpec, o: BrakeOfferingRow): string[] {
  const out: string[] = [];
  if (o.total_risk_index >= spec.max_total_risk_index) out.push(`Total Risk Index ${o.total_risk_index} (${o.total_risk_index_level})`);
  if (o.financial_health >= spec.max_financial_health) out.push(`Financial Health Score ${o.financial_health} (${o.financial_health_level})`);
  return out;
}

function share(o: EvaluatedOffer, pct: number, volume: number, unitsOverride?: number): SourcingShare {
  const u = unitsOverride ?? Math.round((volume * pct) / 100);
  return {
    supplier_id: o.supplier_id,
    supplier_name: o.supplier_name,
    supplier_status: o.supplier_status,
    share_pct: pct,
    units: u,
    unit_price_eur: o.unit_price_eur,
    cost_eur: round2(u * o.unit_price_eur),
    capacity_ok: o.annual_capacity_units >= u,
  };
}

const tieWith = (list: EvaluatedOffer[]) => (list.length > 1 && list[1].unit_price_eur - list[0].unit_price_eur < TIE_EUR ? [list[0].supplier_id, list[1].supplier_id] : null);

/** Qualification, price ranking, risk gate, award, gate cost, dual sourcing and MOQ check for one RFQ. */
export function qualifyRfq(rows: BrakeOfferingRow[], spec: RfqSpec): RfqOutcome {
  const candidates = filterOfferings(rows, { product_type: spec.product_type });
  const offers: EvaluatedOffer[] = candidates.map((o) => {
    const failed = failedCriteria(spec, o);
    const gf = gateFailures(spec, o);
    return {
      offering_id: o.offering_id,
      supplier_id: o.supplier_id,
      supplier_name: o.supplier_name,
      country: o.country,
      region: o.region,
      supplier_status: o.supplier_status,
      certifications: o.certifications,
      unit_price_eur: o.unit_price_eur,
      lead_time_days: o.lead_time_days,
      annual_capacity_units: o.annual_capacity_units,
      moq_units: o.moq_units,
      copper_free: o.copper_free,
      total_risk_index: o.total_risk_index,
      total_risk_index_level: o.total_risk_index_level,
      financial_health: o.financial_health,
      financial_health_level: o.financial_health_level,
      delivery_rating: o.delivery_rating,
      qualified: failed.length === 0,
      failed,
      annual_cost_eur: round2(spec.annual_volume * o.unit_price_eur),
      gate: spec.risk_gate ? { pass: gf.length === 0, failures: gf } : null,
      moq_fits: o.moq_units <= spec.monthly_call_off,
    };
  });
  const qualified = offers.filter((o) => o.qualified);
  const passing = qualified.filter((o) => !o.gate || o.gate.pass);
  const cheapest = qualified[0] ?? null;
  const award = passing[0] ?? null;
  let dual: RfqOutcome["dual"] = null;
  let dual_note: string | null = null;
  if (passing.length >= 2) {
    const pct = spec.primary_share;
    const primaryUnits = Math.round((spec.annual_volume * pct) / 100);
    const primary = share(passing[0], pct, spec.annual_volume, primaryUnits);
    const secondary = share(passing[1], 100 - pct, spec.annual_volume, spec.annual_volume - primaryUnits);
    const total = round2(primary.cost_eur + secondary.cost_eur);
    dual = { primary, secondary, total_eur: total, extra_vs_single_eur: round2(total - passing[0].annual_cost_eur) };
  } else {
    dual_note = passing.length === 1 ? `only ${passing[0].supplier_id} is qualified${spec.risk_gate ? " and passes the risk gate" : ""}` : `no qualified supplier${spec.risk_gate ? " passes the risk gate" : ""}`;
  }
  return {
    spec,
    offers,
    qualified_ids: qualified.map((o) => o.supplier_id),
    excluded_ids: offers.filter((o) => !o.qualified).map((o) => o.supplier_id),
    cheapest_qualified: cheapest,
    tie_at_top: tieWith(qualified),
    gate_failures: spec.risk_gate ? qualified.filter((o) => o.gate && !o.gate.pass) : [],
    award,
    award_tie: tieWith(passing),
    gate_cost_eur: award && cheapest ? round2((award.unit_price_eur - cheapest.unit_price_eur) * spec.annual_volume) : null,
    dual,
    dual_note,
    moq: { monthly_call_off: spec.monthly_call_off, over: qualified.filter((o) => !o.moq_fits).map((o) => o.supplier_id) },
  };
}

// ------------------------------------------------------------------ formatting for summaries

export const eur = (v: number) => `EUR ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtUnits = units;

/** "BRK_0046 (Rendavo Railway Brakes SAS)" */
export const idName = (o: { supplier_id: string; supplier_name: string }) => `${o.supplier_id} (${o.supplier_name})`;

export function specText(spec: RfqSpec): string {
  const req = [
    ...spec.certifications.map((c) => `${c} certified`),
    ...(spec.copper_free ? ["copper-free"] : []),
    ...(spec.region ? [`supplier in ${spec.region}`] : []),
    ...(spec.max_lead_time_days !== null ? [`lead time <= ${spec.max_lead_time_days} days`] : []),
    `annual capacity >= ${units(spec.min_annual_capacity)}`,
    ...(spec.approved_only ? ["Approved suppliers only"] : []),
  ];
  return `${spec.product_type}, ${units(spec.annual_volume)} units/year; mandatory: ${req.join(", ")}`;
}

export const gateText = (spec: RfqSpec) => `Total Risk Index below ${spec.max_total_risk_index} and Financial Health Score below ${spec.max_financial_health}`;

/** Highest raw risk scores, cut short so the cut never falls inside a tie (same rule as the eval set). */
export function topRawScores(row: Record<string, unknown>, fields: readonly string[], n = 3): Array<{ field: string; value: number; level: string }> {
  const ranked = fields
    .filter((f) => typeof row[f] === "number")
    .map((f) => ({ field: f, value: row[f] as number, level: String(row[`${f}_level`] ?? "") }))
    .sort((a, b) => b.value - a.value || (a.field < b.field ? -1 : 1));
  let k = Math.min(n, ranked.length);
  while (k > 1 && k < ranked.length && ranked[k - 1].value === ranked[k].value) k--;
  return ranked.slice(0, k);
}

/** "external_intelligence" -> "External Intelligence Score" (the eval set's wording). */
export const scoreLabel = (field: string) =>
  field === "total_risk_index"
    ? "Total Risk Index"
    : `${field
        .split("_")
        .map((w) => (w === "esg" ? "ESG" : w[0].toUpperCase() + w.slice(1)))
        .join(" ")} Score`;
