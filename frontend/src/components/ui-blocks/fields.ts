import type { Level } from "@/lib/data-api/types";

/**
 * Client-side field metadata for the blocks (labels, direction, family).
 * Mirrors ARCHITECTURE.md section 4 and the family mapping in get_metadata
 * (src/lib/data-api/mocks/get_metadata.json, defined in scripts/gen-mocks.py).
 * Keep in sync with get_metadata if the data service changes it.
 */
export type Family =
  | "financial"
  | "operational_quality"
  | "compliance_governance"
  | "external_environment"
  | "supply_chain_structure";

export const FAMILIES: Family[] = [
  "financial",
  "operational_quality",
  "compliance_governance",
  "external_environment",
  "supply_chain_structure",
];

export const FAMILY_LABEL: Record<Family, string> = {
  financial: "Financial",
  operational_quality: "Operational quality",
  compliance_governance: "Compliance and governance",
  external_environment: "External environment",
  supply_chain_structure: "Supply chain structure",
};

export type FieldKind = "score" | "percent" | "eur" | "category";

export interface FieldMeta {
  label: string;
  kind: FieldKind;
  /** higher_is_worse for risk scores and order_change_rate. */
  higherIsBetter?: boolean;
  family?: Family;
  /** Official Total Risk Index weight. */
  weight?: number;
}

export const FIELD_META: Record<string, FieldMeta> = {
  total_risk_index: { label: "Total risk index", kind: "score" },
  profile_score: { label: "Profile score", kind: "score" },
  financial_health: { label: "Financial health", kind: "score", family: "financial", weight: 0.1 },
  credit_rating: { label: "Credit rating", kind: "score", family: "financial", weight: 0.06 },
  quality_risk: { label: "Quality risk", kind: "score", family: "operational_quality", weight: 0.1 },
  safety_incident: { label: "Safety incidents", kind: "score", family: "operational_quality", weight: 0.06 },
  labor_stability: { label: "Labor stability", kind: "score", family: "operational_quality", weight: 0.04 },
  digital_security: { label: "Digital security", kind: "score", family: "operational_quality", weight: 0.04 },
  compliance_risk: { label: "Compliance risk", kind: "score", family: "compliance_governance", weight: 0.08 },
  governance_risk: { label: "Governance risk", kind: "score", family: "compliance_governance", weight: 0.05 },
  esg_performance: { label: "ESG performance", kind: "score", family: "compliance_governance", weight: 0.05 },
  industry_benchmark: { label: "Industry benchmark", kind: "score", family: "compliance_governance", weight: 0.04 },
  geopolitical_risk: { label: "Geopolitical risk", kind: "score", family: "external_environment", weight: 0.05 },
  political_stability: { label: "Political stability", kind: "score", family: "external_environment", weight: 0.04 },
  environmental_exposure: { label: "Environmental exposure", kind: "score", family: "external_environment", weight: 0.04 },
  media_sentiment: { label: "Media sentiment", kind: "score", family: "external_environment", weight: 0.03 },
  market_sentiment: { label: "Market sentiment", kind: "score", family: "external_environment", weight: 0.03 },
  external_intelligence: { label: "External intelligence", kind: "score", family: "external_environment", weight: 0.03 },
  operational_resilience: { label: "Operational resilience", kind: "score", family: "supply_chain_structure", weight: 0.1 },
  sub_tier_visibility: { label: "Sub-tier visibility", kind: "score", family: "supply_chain_structure", weight: 0.06 },
  delivery_rating: { label: "Delivery rating", kind: "percent", higherIsBetter: true },
  order_confirmation_rate: { label: "Order confirmation", kind: "percent", higherIsBetter: true },
  order_change_rate: { label: "Order change rate", kind: "percent" },
  po_volume_eur: { label: "PO volume", kind: "eur" },
  sourcing_risk_level: { label: "Sourcing risk", kind: "category" },
  supply_chain_complexity: { label: "Supply chain complexity", kind: "category" },
  // Derived fields usable in profile weights (list_profiles).
  delivery_risk: { label: "Delivery risk", kind: "score" },
  confirmation_risk: { label: "Confirmation risk", kind: "score" },
  change_risk: { label: "Change risk", kind: "score" },
};

/** Display order for comparison rows: overall first, then families, then operations. */
export const FIELD_ORDER: string[] = [
  "total_risk_index",
  "profile_score",
  ...FAMILIES.flatMap((f) => Object.entries(FIELD_META).filter(([, m]) => m.family === f).map(([k]) => k)),
  "delivery_rating",
  "order_confirmation_rate",
  "order_change_rate",
  "po_volume_eur",
  "sourcing_risk_level",
  "supply_chain_complexity",
];

export const fieldsOfFamily = (family: Family) =>
  Object.entries(FIELD_META)
    .filter(([, m]) => m.family === family)
    .map(([k]) => k);

export const labelOf = (field: string) =>
  FIELD_META[field]?.label ?? field.replace(/_level$/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Field label inside a sentence: "Operational resilience" -> "operational resilience", acronyms kept ("ESG performance"). */
export const lowerLabel = (field: string) =>
  labelOf(field)
    .split(" ")
    .map((w) => (/^[A-Z][a-z]/.test(w) ? w.toLowerCase() : w))
    .join(" ");

export const isHigherBetter =(field: string) => FIELD_META[field]?.higherIsBetter === true;

export const LEVELS: Level[] = ["Low", "Medium", "High", "Critical"];

/** Level bands: 0-24 Low, 25-49 Medium, 50-74 High, 75-100 Critical. */
export function levelOf(score: number | null | undefined): Level | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

export function asLevel(value: unknown): Level | null {
  if (typeof value !== "string") return null;
  const v = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  return (LEVELS as string[]).includes(v) ? (v as Level) : null;
}

/** Level for a record's field: the explicit `<field>_level` column wins, else the band of the score. */
export function levelFor(row: Record<string, unknown> | undefined, field: string): Level | null {
  if (!row) return null;
  const explicit =
    asLevel(row[`${field}_level`]) ?? (field === "total_risk_index" ? asLevel(row.total_risk_index_level ?? row.total_risk_level) : null);
  if (explicit) return explicit;
  if (FIELD_META[field]?.kind !== "score") return null;
  return levelOf(num(row[field]));
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

const eur = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });

export function formatValue(field: string, v: unknown): string {
  const n = num(v);
  if (n === null) return typeof v === "string" && v ? v : "–";
  switch (FIELD_META[field]?.kind) {
    case "percent":
      return `${n.toFixed(1)}%`;
    case "eur":
      return eur.format(n);
    case "score":
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    default:
      return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }
}

export const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;

/** Display name for a supplier row: name when present, id otherwise. */
export const supplierLabel = (row: Record<string, unknown> | undefined, fallbackId?: string) =>
  str(row?.supplier_name) ?? str(row?.supplier_id) ?? fallbackId ?? "Unknown supplier";
