import trainParts from "@/config/train-parts.json";

/**
 * Named datasets every data call can target (client-safe, no Node imports).
 *
 *   portfolio  the 10,000-supplier risk portfolio (../data/supplier_risk_dataset.csv); the live data service owns it.
 *   brakes     the 60 simulated brake suppliers BRK_0001..BRK_0060 with their 124 offerings
 *              (../data/brakes/source/*.csv, offerings joined on supplierID).
 *
 * A call carries `dataset` in its input (default portfolio). A case derives it from its part: train-parts.json sets
 * "dataset": "brakes" on brake_system. See src/lib/data-api/client.ts for how each dataset resolves.
 */
export const DATASETS = ["portfolio", "brakes"] as const;
export type Dataset = (typeof DATASETS)[number];
export const DEFAULT_DATASET: Dataset = "portfolio";

export const isDataset = (v: unknown): v is Dataset => typeof v === "string" && (DATASETS as readonly string[]).includes(v);
export const parseDataset = (v: unknown): Dataset | undefined => (isDataset(v) ? v : undefined);

/** The dataset of a train-map part (train-parts.json `dataset`, default portfolio). */
export function datasetForPart(partId: string | null | undefined): Dataset {
  const part = (trainParts.parts as Array<{ id: string; dataset?: string }>).find((p) => p.id === partId);
  return parseDataset(part?.dataset) ?? DEFAULT_DATASET;
}

/** Brake supplier ids: BRK_0001 to BRK_0060. */
export const BRAKE_ID_RE = /^BRK_\d{4}$/;
export const SUPPLIER_ID_RE = /^(?:SUPP_\d{5}|BRK_\d{4})$/;

/** Supplier attributes only the brakes dataset has (filterable on filter_suppliers rows). */
export const BRAKE_SUPPLIER_FIELDS = [
  "country",
  "region",
  "supplier_status",
  "certifications",
  "product_types",
  "applications",
  "application_count",
  "offering_count",
] as const;

/** Offering columns (view supplier_offerings), one row per product a supplier quotes. */
export const BRAKE_OFFERING_FIELDS = [
  "offering_id",
  "product_type",
  "application",
  "material",
  "copper_free",
  "unit_price_eur",
  "moq_units",
  "lead_time_days",
  "annual_capacity_units",
] as const;

export const PRODUCT_TYPES = [
  "Air disc brake pads",
  "Brake calipers",
  "Brake discs",
  "Composite brake blocks",
  "Disc brake pads",
  "Drum brake assemblies",
  "Hydraulic caliper brakes",
  "Rail brake discs",
  "Rail brake pads",
  "Rotor brake calipers",
  "Spring-applied brakes",
  "Yaw brake pads",
] as const;
export const APPLICATIONS = ["Passenger car", "Commercial vehicle", "Rail", "Industrial", "Wind turbine"] as const;
export const REGIONS = ["EU", "Europe (non-EU)", "North America", "South America", "Asia-Pacific"] as const;
export const CERTIFICATIONS = ["ISO 9001", "IATF 16949", "ECE R90", "ISO/TS 22163", "ISO 14001", "ISO 45001"] as const;
export const SUPPLIER_STATUSES = ["Approved", "Prospect"] as const;

/**
 * Dataset of an input that does not say: brake ids or a brake-only field mean brakes, everything else portfolio.
 * POST /api/data/:tool uses it, so the case screens (which send no dataset) still read BRK_ shortlists and
 * brake filter chips from the right rows.
 */
export function inferDataset(input: Record<string, unknown>): Dataset {
  const explicit = parseDataset(input.dataset);
  if (explicit) return explicit;
  const ids = [input.id, ...(Array.isArray(input.ids) ? input.ids : [])];
  if (ids.some((id) => typeof id === "string" && BRAKE_ID_RE.test(id))) return "brakes";
  const conds = Array.isArray(input.conditions) ? (input.conditions as Array<{ field?: unknown; value?: unknown }>) : [];
  const brakeField = (f: unknown) => typeof f === "string" && (BRAKE_SUPPLIER_FIELDS as readonly string[]).includes(f);
  if (conds.some((c) => brakeField(c?.field) || (c?.field === "supplier_id" && [c.value].flat().some((v) => typeof v === "string" && BRAKE_ID_RE.test(v))))) return "brakes";
  return DEFAULT_DATASET;
}
