import "server-only";
import { callDataTool } from "@/lib/data-api/client";

export interface FieldMeta {
  field: string;
  label: string;
  description: string;
  direction: "higher_is_worse" | "higher_is_better" | "exposure" | string;
  family: string | null;
  official_weight: number | null;
  type: string;
}

export interface FamilyMeta {
  family: string;
  label: string;
  description: string;
  score_fields: string[];
  official_weight: number;
}

export interface Metadata {
  fields: FieldMeta[];
  level_bands: Record<string, [number, number]>;
  families?: FamilyMeta[];
  /** "data-api" when get_metadata answered, "builtin" when the fallback below was used. */
  source: "data-api" | "builtin";
}

const W: Record<string, [number, string, string]> = {
  operational_resilience: [0.1, "supply_chain_structure", "Risks affecting day-to-day production and logistics capabilities."],
  financial_health: [0.1, "financial", "Financial stability, liquidity and bankruptcy risk."],
  quality_risk: [0.1, "operational_quality", "Product defects, recalls or quality management failures."],
  compliance_risk: [0.08, "compliance_governance", "Lawsuits, regulatory fines or legal disputes."],
  credit_rating: [0.06, "financial", "Financial creditworthiness based on international rating standards."],
  safety_incident: [0.06, "operational_quality", "Frequency and severity of industrial accidents or safety violations."],
  sub_tier_visibility: [0.06, "supply_chain_structure", "Risks within the supplier's own supply chain (Tier-N)."],
  geopolitical_risk: [0.05, "external_environment", "Exposure to humanitarian crises or regional instability."],
  governance_risk: [0.05, "compliance_governance", "Corporate leadership, ethics and internal controls."],
  esg_performance: [0.05, "compliance_governance", "Sustainability and ethical practices (E, S, G pillars)."],
  labor_stability: [0.04, "operational_quality", "Strikes, protests or labor disputes at supplier locations."],
  environmental_exposure: [0.04, "external_environment", "Earthquakes, floods or extreme weather exposure."],
  digital_security: [0.04, "operational_quality", "Data breaches, hacking or digital infrastructure failures."],
  industry_benchmark: [0.04, "compliance_governance", "Risk performance against industry peers and regional standards."],
  political_stability: [0.04, "external_environment", "Political unrest or government changes affecting operations."],
  market_sentiment: [0.03, "external_environment", "Public and consumer perception risks."],
  media_sentiment: [0.03, "external_environment", "News, social media and public report monitoring."],
  external_intelligence: [0.03, "external_environment", "Third-party intelligence and external databases."],
};

const label = (f: string) => f.split("_").map((w) => (w === "esg" ? "ESG" : w[0].toUpperCase() + w.slice(1))).join(" ");

export const BUILTIN_METADATA: Metadata = {
  source: "builtin",
  level_bands: { Low: [0, 24], Medium: [25, 49], High: [50, 74], Critical: [75, 100] },
  fields: [
    { field: "total_risk_index", label: "Total Risk Index", description: "Weighted average of the 18 risk scores (official weights).", direction: "higher_is_worse", family: null, official_weight: null, type: "score" },
    ...Object.entries(W).map(([field, [w, family, description]]) => ({ field, label: label(field), description, direction: "higher_is_worse", family, official_weight: w, type: "score" })),
    { field: "po_volume_eur", label: "PO Volume (EUR)", description: "Total value of orders placed (exposure, not risk).", direction: "exposure", family: null, official_weight: null, type: "metric" },
    { field: "order_change_rate", label: "Order Change Rate", description: "Frequency of changes to existing orders, percent.", direction: "higher_is_worse", family: null, official_weight: null, type: "metric" },
    { field: "delivery_rating", label: "Delivery Rating", description: "Delivery timeliness and accuracy, percent.", direction: "higher_is_better", family: null, official_weight: null, type: "metric" },
    { field: "order_confirmation_rate", label: "Order Confirmation Rate", description: "Orders confirmed within the requested timeframe, percent.", direction: "higher_is_better", family: null, official_weight: null, type: "metric" },
    { field: "sourcing_risk_level", label: "Sourcing Risk Level", description: "Difficulty of replacing the supplier (Low/Medium/High).", direction: "higher_is_worse", family: "supply_chain_structure", official_weight: null, type: "category" },
    { field: "supply_chain_complexity", label: "Supply Chain Complexity", description: "Simple/Moderate/Complex logistics and sub-tiers.", direction: "higher_is_worse", family: "supply_chain_structure", official_weight: null, type: "category" },
  ],
};

let cached: { at: number; value: Metadata } | null = null;
const TTL_MS = 10 * 60 * 1000;

/** get_metadata, cached for 10 minutes; falls back to the built-in copy so chat never blocks on it. */
export async function getMetadata(): Promise<Metadata> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const res = await callDataTool<Omit<Metadata, "source">>("get_metadata", {});
    if (res.ok && res.data?.fields?.length) {
      cached = { at: Date.now(), value: { ...res.data, source: "data-api" } };
      return cached.value;
    }
  } catch {
    // fall through to builtin
  }
  return BUILTIN_METADATA;
}

/** Score fields of a risk family with their official weights. */
export function familyMembers(meta: Metadata, family: string): Array<{ field: string; weight: number }> {
  const listed = meta.families?.find((f) => f.family === family)?.score_fields;
  const fields = listed ?? meta.fields.filter((f) => f.family === family && f.type === "score").map((f) => f.field);
  return fields.map((field) => ({ field, weight: weightOf(meta, field) }));
}

export function weightOf(meta: Metadata, field: string): number {
  return meta.fields.find((f) => f.field === field)?.official_weight ?? 0;
}
