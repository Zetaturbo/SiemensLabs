import { labelOf } from "./fields";

/**
 * Short chip labels for filter conditions, shared by the case filter bar, the Guidance block and the
 * chat receipts: "Quality: not Critical", "Delivery ≥ 90 %", "Volume > 1 M EUR".
 */
type Cond = { field: string; op: string; value: unknown };

const SHORT: Record<string, string> = {
  total_risk_index: "Total risk",
  quality_risk: "Quality",
  safety_incident: "Safety",
  compliance_risk: "Compliance",
  financial_health: "Financial health",
  credit_rating: "Credit",
  governance_risk: "Governance",
  geopolitical_risk: "Geopolitical",
  labor_stability: "Labor",
  esg_performance: "ESG",
  digital_security: "Cyber",
  operational_resilience: "Resilience",
  sub_tier_visibility: "Sub-tier",
  environmental_exposure: "Environment",
  political_stability: "Political",
  delivery_rating: "Delivery",
  order_confirmation_rate: "Confirmation",
  order_change_rate: "Order changes",
  po_volume_eur: "Volume",
  sourcing_risk_level: "Sourcing risk",
  supply_chain_complexity: "Complexity",
  // brakes dataset
  supplier_status: "Status",
  certifications: "Certified",
  region: "Region",
  country: "Country",
  product_types: "Offers",
  applications: "Application",
  application_count: "Applications",
  supplier_name: "Name",
};

/** Text fields that read as "Field: value" chips (the brakes dataset's supplier attributes). */
const TEXT_FIELDS = new Set(["supplier_status", "region", "country", "certifications", "product_types", "applications", "supplier_name"]);

const OP: Record<string, string> = { eq: "=", ne: "≠", lt: "<", lte: "≤", gt: ">", gte: "≥" };

export function fieldShortLabel(field: string): string {
  const base = field === "sourcing_risk_level" ? field : field.replace(/_level$/, "");
  return SHORT[base] ?? labelOf(base).replace(/ (Risk|Score)$/i, "");
}

function fmtValue(field: string, v: unknown): string {
  if (typeof v !== "number") return String(v);
  if (field === "po_volume_eur") return v >= 1e6 ? `${+(v / 1e6).toFixed(1)} M EUR` : v >= 1e3 ? `${Math.round(v / 1e3)} k EUR` : `${v} EUR`;
  if (field === "delivery_rating" || field === "order_confirmation_rate" || field === "order_change_rate") return `${v} %`;
  return String(v);
}

const list = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : String(v));

export function conditionLabel(c: Cond): string {
  const name = fieldShortLabel(c.field);
  if (c.op === "contains") return `${name}: ${list(c.value)}`;
  if (c.op === "not_contains") return `${name}: not ${list(c.value)}`;
  if (TEXT_FIELDS.has(c.field) && (c.op === "eq" || c.op === "ne")) return `${name}: ${c.op === "ne" ? "not " : ""}${list(c.value)}`;
  const isLevel = c.field.endsWith("_level") || c.field === "supply_chain_complexity";
  if (isLevel) {
    switch (c.op) {
      case "eq":
        return `${name}: ${c.value}`;
      case "ne":
        return `${name}: not ${c.value}`;
      case "in":
        return `${name}: ${list(c.value)}`;
      case "not_in":
        return `${name}: not ${list(c.value)}`;
      default:
        return `${name} ${OP[c.op] ?? c.op} ${list(c.value)}`;
    }
  }
  if (c.op === "between" && Array.isArray(c.value) && c.value.length === 2) {
    const [lo, hi] = c.value;
    return `${name} ${fmtValue(c.field, lo).replace(/ (%|M EUR|k EUR|EUR)$/, "")}–${fmtValue(c.field, hi)}`;
  }
  if (c.op === "in" || c.op === "not_in") return `${name}: ${c.op === "not_in" ? "not " : ""}${list(c.value)}`;
  return `${name} ${OP[c.op] ?? c.op} ${fmtValue(c.field, c.value)}`;
}

export const conditionKey = (c: Cond) => `${c.field}|${c.op}|${Array.isArray(c.value) ? c.value.join(",") : String(c.value)}`;

/**
 * Merge filter conditions: the conditions in `next` replace every condition in `base` on the same field
 * (the newer requirement wins) and take the place of the first one they replace, so chips keep their order;
 * new fields are appended. Used by filter_suppliers, update_workflow and the Guidance block's Apply.
 */
export function mergeConditions<C extends Cond>(base: readonly C[], next: readonly C[]): C[] {
  const byField = new Map<string, C[]>();
  for (const c of next) byField.set(c.field, [...(byField.get(c.field) ?? []), c]);
  const merged: C[] = [];
  for (const c of base) {
    const repl = byField.get(c.field);
    if (!repl) merged.push(c);
    else if (repl.length) {
      merged.push(...repl);
      byField.set(c.field, []);
    }
  }
  for (const c of next) if (byField.get(c.field)?.length) merged.push(c);
  const seen = new Set<string>();
  return merged.filter((c) => {
    const k = conditionKey(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
