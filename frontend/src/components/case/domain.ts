// Domain constants, tolerant normalizers and tool output shapes for the case screens.
// Pure module (no "use client"): shared by client components and the mock engine.
// Real values always come from get_metadata / list_profiles; the fallbacks below only
// keep the UI usable when a mock lacks a field.
import type { FilterCondition, Level } from "@/lib/data-api/types";

export type { Level };
export const LEVELS: Level[] = ["Low", "Medium", "High", "Critical"];
export const DEFAULT_LEVEL_BANDS: Record<Level, [number, number]> = { Low: [0, 24], Medium: [25, 49], High: [50, 74], Critical: [75, 100] };

export function levelOf(score: number | null | undefined, bands: Record<Level, [number, number]> = DEFAULT_LEVEL_BANDS): Level | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  for (const l of LEVELS) if (score <= bands[l][1]) return l;
  return "Critical";
}

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVELS as string[]).includes(v);
}

export type Direction = "higher_is_worse" | "higher_is_better" | "neutral";

export interface FieldMeta {
  field: string;
  label: string;
  description?: string;
  direction: Direction;
  family: string | null;
  official_weight: number | null;
  type: string; // "score" | "index" | "metric" | "category" | ...
}

export interface FamilyMeta {
  id: string;
  label: string;
  description?: string;
}

export interface Metadata {
  fields: FieldMeta[];
  level_bands: Record<Level, [number, number]>;
  families: FamilyMeta[];
}

export const FAMILIES: FamilyMeta[] = [
  { id: "financial", label: "Financial" },
  { id: "operational_quality", label: "Operational quality" },
  { id: "compliance_governance", label: "Compliance and governance" },
  { id: "external_environment", label: "External environment" },
  { id: "supply_chain_structure", label: "Supply chain structure" },
];

export function familyLabel(id: string, meta?: Metadata | null): string {
  return (
    meta?.families.find((f) => f.id === id)?.label ??
    FAMILIES.find((f) => f.id === id)?.label ??
    id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

const S = (field: string, label: string, family: string, w: number, description = ""): FieldMeta => ({
  field,
  label,
  description,
  direction: "higher_is_worse",
  family,
  official_weight: w,
  type: "score",
});

/** The 18 weighted risk scores (official Total Risk Index weights). */
export const FALLBACK_SCORE_FIELDS: FieldMeta[] = [
  S("financial_health", "Financial Health", "financial", 0.1, "Financial stability, liquidity and bankruptcy risk."),
  S("credit_rating", "Credit Rating", "financial", 0.06, "Financial creditworthiness based on international rating standards."),
  S("quality_risk", "Quality Risk", "operational_quality", 0.1, "Product defects, recalls or quality management failures."),
  S("operational_resilience", "Operational Resilience", "supply_chain_structure", 0.1, "Risks to day-to-day production and logistics."),
  S("safety_incident", "Safety Incident", "operational_quality", 0.06, "Frequency and severity of industrial accidents."),
  S("digital_security", "Digital Security", "operational_quality", 0.04, "Data breaches, hacking, digital infrastructure failures."),
  S("compliance_risk", "Compliance Risk", "compliance_governance", 0.08, "Lawsuits, regulatory fines or legal disputes."),
  S("governance_risk", "Governance Risk", "compliance_governance", 0.05, "Corporate leadership, ethics and internal controls."),
  S("esg_performance", "ESG Performance", "compliance_governance", 0.05, "Sustainability and ethical practices (E, S, G)."),
  S("labor_stability", "Labor Stability", "operational_quality", 0.04, "Strikes, protests or labor disputes."),
  S("geopolitical_risk", "Geopolitical Risk", "external_environment", 0.05, "Humanitarian crises or regional instability."),
  S("political_stability", "Political Stability", "external_environment", 0.04, "Political unrest or government changes."),
  S("environmental_exposure", "Environmental Exposure", "external_environment", 0.04, "Earthquakes, floods, extreme weather."),
  S("industry_benchmark", "Industry Benchmark", "compliance_governance", 0.04, "Risk performance against industry peers."),
  S("market_sentiment", "Market Sentiment", "external_environment", 0.03, "Public and consumer perception."),
  S("media_sentiment", "Media Sentiment", "external_environment", 0.03, "News, social media and public reports."),
  S("external_intelligence", "External Intelligence", "external_environment", 0.03, "Third-party intelligence and external databases."),
  S("sub_tier_visibility", "Sub-Tier Visibility", "supply_chain_structure", 0.06, "Risks within the supplier's own supply chain (Tier-N)."),
];

export const FALLBACK_OTHER_FIELDS: FieldMeta[] = [
  { field: "total_risk_index", label: "Total Risk Index", description: "Weighted average of all risk scores.", direction: "higher_is_worse", family: null, official_weight: null, type: "index" },
  { field: "po_volume_eur", label: "PO volume (EUR)", description: "Total value of orders placed, financial exposure.", direction: "neutral", family: null, official_weight: null, type: "metric" },
  { field: "order_change_rate", label: "Order change rate", description: "Frequency of changes to existing orders, percent.", direction: "higher_is_worse", family: null, official_weight: null, type: "metric" },
  { field: "delivery_rating", label: "Delivery rating", description: "Delivery timeliness and accuracy, percent.", direction: "higher_is_better", family: null, official_weight: null, type: "metric" },
  { field: "order_confirmation_rate", label: "Order confirmation rate", description: "Orders confirmed within the requested timeframe, percent.", direction: "higher_is_better", family: null, official_weight: null, type: "metric" },
  { field: "sourcing_risk_level", label: "Sourcing risk", description: "Difficulty of replacing the supplier.", direction: "higher_is_worse", family: null, official_weight: null, type: "category" },
  { field: "supply_chain_complexity", label: "Supply chain complexity", description: "Logistics routes, sub-tiers.", direction: "higher_is_worse", family: null, official_weight: null, type: "category" },
];

export const FALLBACK_METADATA: Metadata = { fields: [...FALLBACK_SCORE_FIELDS, ...FALLBACK_OTHER_FIELDS], level_bands: DEFAULT_LEVEL_BANDS, families: FAMILIES };

export const DERIVED_FIELD_LABELS: Record<string, string> = {
  delivery_risk: "Delivery risk",
  confirmation_risk: "Confirmation risk",
  change_risk: "Order change risk",
};

export const SOURCING_LEVELS = ["Low", "Medium", "High"] as const;
export const COMPLEXITY_LEVELS = ["Simple", "Moderate", "Complex"] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Merge a get_metadata payload over the fallback so missing fields never break the UI. */
export function normalizeMetadata(raw: unknown): Metadata {
  const r = asRecord(raw);
  const fallback = new Map(FALLBACK_METADATA.fields.map((f) => [f.field, f]));
  const byField = new Map<string, FieldMeta>(); // service order first, fallback fills gaps
  const fields = r && Array.isArray(r.fields) ? (r.fields as unknown[]) : [];
  for (const x of fields) {
    const f = asRecord(x);
    if (!f || typeof f.field !== "string") continue;
    // level columns, ids and free text are not dimensions of their own
    if (f.type === "level" || f.type === "id" || f.type === "text" || (f.type === undefined && f.field.endsWith("_level") && f.field !== "sourcing_risk_level")) continue;
    const base = fallback.get(f.field);
    const dir: Direction =
      f.direction === "higher_is_better" || f.direction === "higher_is_worse" || f.direction === "neutral"
        ? f.direction
        : f.direction === "exposure"
          ? "neutral"
          : base?.direction ?? "higher_is_worse";
    byField.set(f.field, {
      field: f.field,
      label: typeof f.label === "string" ? f.label : base?.label ?? f.field,
      description: typeof f.description === "string" ? f.description : base?.description,
      direction: dir,
      family: typeof f.family === "string" ? f.family : base?.family ?? null,
      official_weight: typeof f.official_weight === "number" ? f.official_weight : base?.official_weight ?? null,
      type: typeof f.type === "string" ? f.type : base?.type ?? "score",
    });
  }
  const bandsRaw = asRecord(r?.level_bands);
  const level_bands = { ...DEFAULT_LEVEL_BANDS };
  if (bandsRaw) {
    for (const l of LEVELS) {
      const b = bandsRaw[l];
      if (Array.isArray(b) && b.length === 2 && typeof b[0] === "number" && typeof b[1] === "number") level_bands[l] = [b[0], b[1]];
    }
  }
  const famRaw = r && Array.isArray(r.families) ? (r.families as unknown[]) : [];
  const families: FamilyMeta[] = famRaw
    .map((x) => asRecord(x))
    .filter((f): f is Record<string, unknown> => !!f && (typeof f.family === "string" || typeof f.id === "string"))
    .map((f) => {
      const id = (typeof f.family === "string" ? f.family : f.id) as string;
      return { id, label: typeof f.label === "string" ? f.label : familyLabel(id), description: typeof f.description === "string" ? f.description : undefined };
    });
  for (const [k, f] of fallback) if (!byField.has(k)) byField.set(k, f);
  return { fields: [...byField.values()], level_bands, families: families.length ? families : FAMILIES };
}

/** The 18 weighted risk scores, in a stable order. */
export function scoreFields(meta: Metadata): FieldMeta[] {
  return meta.fields.filter((f) => f.type === "score" && !!f.family);
}

export function fieldLabel(meta: Metadata | null, field: string): string {
  const f = meta?.fields.find((x) => x.field === field) ?? FALLBACK_METADATA.fields.find((x) => x.field === field);
  if (f) return f.label;
  if (DERIVED_FIELD_LABELS[field]) return DERIVED_FIELD_LABELS[field];
  if (field.endsWith("_level")) return fieldLabel(meta, field.slice(0, -6));
  return field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function fieldDirection(meta: Metadata | null, field: string): Direction {
  if (field === "delivery_rating" || field === "order_confirmation_rate") return "higher_is_better";
  return meta?.fields.find((x) => x.field === field)?.direction ?? FALLBACK_METADATA.fields.find((x) => x.field === field)?.direction ?? "higher_is_worse";
}

export function familiesOf(meta: Metadata): string[] {
  const seen: string[] = [];
  for (const f of scoreFields(meta)) if (f.family && !seen.includes(f.family)) seen.push(f.family);
  const order = (meta.families.length ? meta.families : FAMILIES).map((f) => f.id);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : 99);
  return seen.sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------- profiles

export interface Profile {
  profile_id: string;
  label: string;
  description?: string;
  weights: Record<string, number>;
  knock_outs: FilterCondition[] | null;
}

const officialWeights = Object.fromEntries(FALLBACK_SCORE_FIELDS.map((f) => [f.field, f.official_weight ?? 0]));

export const FALLBACK_PROFILES: Profile[] = [
  { profile_id: "default", label: "Default (official TRI weights)", description: "Official Total Risk Index weights.", weights: officialWeights, knock_outs: null },
  {
    profile_id: "safety_critical",
    label: "Safety-critical component",
    description: "Brakes, bogies, signalling. Quality, safety and compliance weighted highest.",
    weights: { quality_risk: 0.25, safety_incident: 0.15, compliance_risk: 0.15, operational_resilience: 0.15, sub_tier_visibility: 0.1, delivery_risk: 0.1, financial_health: 0.05, governance_risk: 0.05 },
    knock_outs: null,
  },
  {
    profile_id: "strategic_system",
    label: "Strategic system",
    description: "Long-lived systems with few qualified suppliers. Financial stability and resilience weighted highest.",
    weights: { financial_health: 0.15, quality_risk: 0.12, operational_resilience: 0.12, credit_rating: 0.1, sub_tier_visibility: 0.08, geopolitical_risk: 0.08, digital_security: 0.08, governance_risk: 0.07, safety_incident: 0.05, compliance_risk: 0.05, political_stability: 0.05, delivery_risk: 0.05 },
    knock_outs: null,
  },
  {
    profile_id: "commodity",
    label: "Commodity",
    description: "Standard parts with many alternatives. Delivery performance weighted highest.",
    weights: { delivery_risk: 0.2, quality_risk: 0.15, confirmation_risk: 0.15, change_risk: 0.1, operational_resilience: 0.1, financial_health: 0.1, compliance_risk: 0.05, credit_rating: 0.05, esg_performance: 0.05, labor_stability: 0.05 },
    knock_outs: null,
  },
  {
    profile_id: "lksg_due_diligence",
    label: "LkSG due diligence",
    description: "Supply chain act focus: labor, ESG, compliance and sub-tier transparency.",
    weights: { esg_performance: 0.2, compliance_risk: 0.15, labor_stability: 0.15, sub_tier_visibility: 0.12, governance_risk: 0.12, safety_incident: 0.08, geopolitical_risk: 0.08, media_sentiment: 0.05, external_intelligence: 0.05 },
    knock_outs: null,
  },
];

/** Knock-out rules per profile when list_profiles does not carry them. */
export const FALLBACK_KNOCKOUTS: Record<string, FilterCondition[]> = {
  default: [],
  safety_critical: [
    { field: "quality_risk_level", op: "ne", value: "Critical" },
    { field: "safety_incident_level", op: "ne", value: "Critical" },
    { field: "delivery_rating", op: "gte", value: 90 },
  ],
  strategic_system: [
    { field: "financial_health_level", op: "ne", value: "Critical" },
    { field: "credit_rating_level", op: "ne", value: "Critical" },
  ],
  commodity: [{ field: "delivery_rating", op: "gte", value: 85 }],
  lksg_due_diligence: [
    { field: "compliance_risk_level", op: "ne", value: "Critical" },
    { field: "labor_stability_level", op: "ne", value: "Critical" },
    { field: "esg_performance_level", op: "ne", value: "Critical" },
  ],
};

function asConditions(v: unknown): FilterCondition[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((c): c is FilterCondition => {
    const r = asRecord(c);
    return !!r && typeof r.field === "string" && typeof r.op === "string" && r.value !== undefined;
  });
}

export function normalizeProfiles(raw: unknown): Profile[] {
  const r = asRecord(raw);
  const list = r && Array.isArray(r.profiles) ? (r.profiles as unknown[]) : [];
  const out: Profile[] = [];
  for (const x of list) {
    const p = asRecord(x);
    if (!p || typeof p.profile_id !== "string") continue;
    const fb = FALLBACK_PROFILES.find((f) => f.profile_id === p.profile_id);
    const weights = asRecord(p.weights);
    out.push({
      profile_id: p.profile_id,
      label: typeof p.label === "string" ? p.label : fb?.label ?? p.profile_id,
      description: typeof p.description === "string" ? p.description : fb?.description,
      weights: weights ? (Object.fromEntries(Object.entries(weights).filter(([, w]) => typeof w === "number")) as Record<string, number>) : fb?.weights ?? {},
      knock_outs: asConditions(p.knock_outs) ?? asConditions(p.knockouts) ?? asConditions(p.hard_requirements) ?? asConditions(p.default_conditions),
    });
  }
  for (const fb of FALLBACK_PROFILES) if (!out.some((p) => p.profile_id === fb.profile_id)) out.push(fb);
  return out;
}

export function profileKnockouts(profile: Profile | undefined | null, profileId: string): FilterCondition[] {
  return profile?.knock_outs ?? FALLBACK_KNOCKOUTS[profileId] ?? [];
}

// ---------------------------------------------------------------- tool outputs (tolerant)

export type SupplierRow = { supplier_id: string; supplier_name?: string } & Record<string, unknown>;

export interface FilterResult {
  total_matching?: number;
  suppliers?: SupplierRow[];
}
export interface RankEntry {
  rank: number;
  supplier_id: string;
  profile_score?: number;
  total_risk_index?: number;
  default_rank?: number;
  rank_change?: number;
  top_contributors?: Array<{ field: string; value?: number; contribution?: number }>;
}
export interface RankResult {
  profile_id?: string;
  ranking?: RankEntry[];
}
export interface PerField {
  field: string;
  best?: string;
  worst?: string;
  spread?: number;
}
export type FamilyScores = { supplier_id: string } & Record<string, number | string>;
export interface CompareResult {
  suppliers?: SupplierRow[];
  per_field?: PerField[];
  family_scores?: FamilyScores[];
  largest_differences?: string[];
}
export interface Contribution {
  field: string;
  value?: number;
  level?: Level;
  weight?: number;
  percentile?: number;
  contribution_vs_mean?: number;
}
export interface ExplainResult {
  supplier_id: string;
  total_risk_index?: number;
  total_risk_level?: Level;
  percentile?: number;
  dataset_mean?: number;
  contributions?: Contribution[];
  critical_fields?: string[];
  operational_metrics?: Record<string, number>;
}
export interface KraljicEntry {
  supplier_id: string;
  po_volume_eur?: number;
  sourcing_risk_level?: string;
  quadrant?: string;
}
export interface KraljicResult {
  thresholds?: { po_volume_eur_high?: number } & Record<string, unknown>;
  suppliers?: KraljicEntry[];
}
export interface StatsResult {
  stats?: Array<{ field: string; mean?: number; p25?: number; median?: number; p75?: number; min?: number; max?: number; level_counts?: Record<string, number> }>;
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

// ---------------------------------------------------------------- formatting

export function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined ? "–" : Math.round(v).toLocaleString("en-US");
}
export function fmtNum(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
export function fmtPct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : `${v.toFixed(digits)}%`;
}
export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  if (Math.abs(v) >= 1e6) return `€${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `€${(v / 1e3).toFixed(0)}k`;
  return `€${v.toFixed(0)}`;
}

const OP_TEXT: Record<string, string> = { eq: "=", ne: "≠", lt: "<", lte: "≤", gt: ">", gte: "≥", in: "in", not_in: "not in", between: "between" };

export function describeCondition(meta: Metadata | null, c: FilterCondition): string {
  const label = fieldLabel(meta, c.field);
  const v = Array.isArray(c.value) ? (c.op === "between" ? c.value.join(" and ") : c.value.join(", ")) : String(c.value);
  if (c.field.endsWith("_level") && c.op === "ne") return `${label} not ${v}`;
  if (c.field.endsWith("_level") && c.op === "in") return `${label} only ${v}`;
  return `${label} ${OP_TEXT[c.op] ?? c.op} ${v}`;
}
