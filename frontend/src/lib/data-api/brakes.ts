import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The brakes dataset: 60 simulated brake suppliers (BRK_0001..BRK_0060, the 46 portfolio columns plus country,
 * region, supplier status and certifications) and their 124 offerings. Two readers:
 *
 *   loadBrakeCsv()   supplier rows (contract field names, offerings joined on supplierID) + offerings, from
 *                    ../data/brakes/source (DATA_BRAKES_DIR overrides). The request-time engine builds its
 *                    brakes pool from it, so every data tool answers on brake rows.
 *   loadBrakeData()  one offering row per product with its supplier's facts, for the RFQ skills
 *                    (find_offerings, qualify_for_rfq, the brake briefing in explain_supplier). Live first:
 *                    run_sql against the data service views supplier_offerings, supplier_profiles and suppliers;
 *                    the CSVs when the service is not configured, does not answer, or holds no brake rows.
 *                    Same shapes either way; numbers never pass through the model.
 */

export interface BrakeOffering {
  offering_id: string;
  supplier_id: string;
  product_type: string;
  application: string;
  material: string | null;
  /** null where the product is not a friction product (no copper-free rating). */
  copper_free: boolean | null;
  unit_price_eur: number;
  moq_units: number;
  lead_time_days: number;
  annual_capacity_units: number;
}

/** An offering with the supplier facts the RFQ steps need. */
export interface BrakeOfferingRow extends BrakeOffering {
  supplier_name: string;
  country: string;
  region: string;
  supplier_status: "Approved" | "Prospect";
  certifications: string[];
  total_risk_index: number;
  total_risk_index_level: string;
  financial_health: number;
  financial_health_level: string;
  /** null for prospects (no order history). */
  delivery_rating: number | null;
}

export interface BrakeData {
  source: "live" | "csv";
  /** Why the CSVs were used when a live service is configured. */
  fallback_reason?: string;
  rows: BrakeOfferingRow[];
}

// ------------------------------------------------------------------ CSV

/** RFC 4180 lines: quoted cells may hold commas ("Lumora Brake Systems Co., Ltd."). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) out.push(row);
  return out;
}

const CSV_RENAME: Record<string, string> = {
  supplierid: "supplier_id",
  "supplier name": "supplier_name",
  "purchase order volume (eur)": "po_volume_eur",
  "order change rate": "order_change_rate",
  "supplier delivery rating": "delivery_rating",
  "order confirmation rate": "order_confirmation_rate",
  "sourcing risk level": "sourcing_risk_level",
  "supply chain complexity": "supply_chain_complexity",
  "supplier status": "supplier_status",
};

/** Same mapping as the portfolio engine: Financial_Health_Score -> financial_health, ..._Score_Level -> ..._level. */
function supplierColumn(name: string): string {
  const k = name.trim().toLowerCase();
  if (CSV_RENAME[k]) return CSV_RENAME[k];
  return k.replace(/_score(_level)?$/, (_m, lvl) => (lvl ? "_level" : "")).replace(/[^a-z0-9]+/g, "_");
}

const TEXT_FIELDS = new Set(["supplier_id", "supplier_name", "country", "region", "supplier_status", "certifications", "sourcing_risk_level", "supply_chain_complexity"]);

export type BrakeSupplierRow = { supplier_id: string; supplier_name: string } & Record<string, unknown>;

export interface BrakeCsv {
  suppliers: BrakeSupplierRow[];
  offerings: BrakeOffering[];
}

const brakesDir = () => process.env.DATA_BRAKES_DIR || path.join(process.cwd(), "../data/brakes/source");

let csvPromise: Promise<BrakeCsv | null> | null = null;

async function readBrakeCsv(): Promise<BrakeCsv | null> {
  try {
    const [sText, oText] = await Promise.all([
      readFile(path.join(brakesDir(), "brake_suppliers.csv"), "utf8"),
      readFile(path.join(brakesDir(), "brake_offerings.csv"), "utf8"),
    ]);
    const [oHead, ...oLines] = parseCsv(oText);
    const oi = (name: string) => oHead.indexOf(name);
    const offerings: BrakeOffering[] = oLines.map((c) => ({
      offering_id: c[oi("offeringID")],
      supplier_id: c[oi("supplierID")],
      product_type: c[oi("Product Type")],
      application: c[oi("Application")],
      material: c[oi("Material")] || null,
      copper_free: c[oi("Copper Free")] === "Yes" ? true : c[oi("Copper Free")] === "No" ? false : null,
      unit_price_eur: Number(c[oi("Unit Price (EUR)")]),
      moq_units: Number(c[oi("MOQ (units)")]),
      lead_time_days: Number(c[oi("Lead Time (days)")]),
      annual_capacity_units: Number(c[oi("Annual Capacity (units)")]),
    }));

    const [sHead, ...sLines] = parseCsv(sText);
    const cols = sHead.map(supplierColumn);
    const suppliers = sLines.map((cells) => {
      const row: Record<string, unknown> = {};
      cols.forEach((col, i) => {
        const raw = (cells[i] ?? "").trim();
        if (TEXT_FIELDS.has(col) || col.endsWith("_level")) row[col] = raw === "" ? null : raw;
        else row[col] = raw === "" ? null : Number(raw);
      });
      const own = offerings.filter((o) => o.supplier_id === row.supplier_id);
      const uniq = (xs: string[]) => [...new Set(xs)].sort();
      row.product_types = uniq(own.map((o) => o.product_type)).join("; ");
      row.applications = uniq(own.map((o) => o.application)).join("; ");
      row.application_count = uniq(own.map((o) => o.application)).length;
      row.offering_count = own.length;
      return row as BrakeSupplierRow;
    });
    return { suppliers, offerings };
  } catch {
    return null;
  }
}

/** Supplier rows and offerings from the CSVs, cached for the process (null when the files are missing). */
export async function loadBrakeCsv(): Promise<BrakeCsv | null> {
  if (!csvPromise) csvPromise = readBrakeCsv();
  const v = await csvPromise;
  if (!v) csvPromise = null;
  return v;
}

const certList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map(String)
    : typeof v === "string"
      ? v
          .replace(/^[{[]|[}\]]$/g, "")
          .split(/;|,(?=\s*["']?[A-Z])/)
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)
      : [];

const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const boolOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : v === true || v === "true" || v === "t" || v === "Yes");

function joinCsv(csv: BrakeCsv): BrakeOfferingRow[] {
  const byId = new Map(csv.suppliers.map((s) => [s.supplier_id, s]));
  return csv.offerings.flatMap((o) => {
    const s = byId.get(o.supplier_id);
    if (!s) return [];
    return [
      {
        ...o,
        supplier_name: s.supplier_name,
        country: String(s.country ?? ""),
        region: String(s.region ?? ""),
        supplier_status: s.supplier_status === "Prospect" ? "Prospect" : "Approved",
        certifications: certList(s.certifications),
        total_risk_index: Number(s.total_risk_index),
        total_risk_index_level: String(s.total_risk_index_level ?? ""),
        financial_health: Number(s.financial_health),
        financial_health_level: String(s.financial_health_level ?? ""),
        delivery_rating: numOrNull(s.delivery_rating),
      } satisfies BrakeOfferingRow,
    ];
  });
}

// ------------------------------------------------------------------ live (run_sql on the service views)

/** One SELECT over the three views run_sql can see (api/README.md); 124 rows, under the 200-row cap. */
export const BRAKE_ROWS_SQL = `select o.offering_id, o.supplier_id, s.supplier_name, o.product_type, o.application, o.material, o.copper_free,
       o.unit_price_eur, o.moq_units, o.lead_time_days, o.annual_capacity_units,
       p.country, p.region, p.supplier_status, array_to_string(p.certifications, '; ') as certifications,
       s.total_risk_index, s.total_risk_index_level, s.financial_health, s.financial_health_level, s.delivery_rating
from supplier_offerings o
join supplier_profiles p on p.supplier_id = o.supplier_id
join suppliers s on s.supplier_id = o.supplier_id
where o.commodity = 'Brakes'
order by o.offering_id`;

/** Maps run_sql { columns, rows } to offering rows; null when a column is missing. */
export function rowsFromSql(columns: string[], rows: unknown[][]): BrakeOfferingRow[] | null {
  const need = ["offering_id", "supplier_id", "supplier_name", "product_type", "unit_price_eur", "lead_time_days", "annual_capacity_units", "supplier_status", "total_risk_index", "financial_health"];
  if (!need.every((c) => columns.includes(c))) return null;
  const at = (r: unknown[], c: string) => r[columns.indexOf(c)];
  return rows.map((r) => ({
    offering_id: String(at(r, "offering_id")),
    supplier_id: String(at(r, "supplier_id")),
    supplier_name: String(at(r, "supplier_name")),
    product_type: String(at(r, "product_type")),
    application: String(at(r, "application") ?? ""),
    material: (at(r, "material") as string | null) ?? null,
    copper_free: boolOrNull(at(r, "copper_free")),
    unit_price_eur: Number(at(r, "unit_price_eur")),
    moq_units: Number(at(r, "moq_units")),
    lead_time_days: Number(at(r, "lead_time_days")),
    annual_capacity_units: Number(at(r, "annual_capacity_units")),
    country: String(at(r, "country") ?? ""),
    region: String(at(r, "region") ?? ""),
    supplier_status: at(r, "supplier_status") === "Prospect" ? "Prospect" : "Approved",
    certifications: certList(at(r, "certifications")),
    total_risk_index: Number(at(r, "total_risk_index")),
    total_risk_index_level: String(at(r, "total_risk_index_level") ?? ""),
    financial_health: Number(at(r, "financial_health")),
    financial_health_level: String(at(r, "financial_health_level") ?? ""),
    delivery_rating: numOrNull(at(r, "delivery_rating")),
  }));
}

const LIVE_TTL_MS = 30_000;
let liveCache: { at: number; rows: BrakeOfferingRow[] } | null = null;

/**
 * Brake offering rows for the RFQ skills: live run_sql when DATA_API_URL is set and the service answers with
 * brake rows, else the CSVs. Throws only when neither is available.
 */
export async function loadBrakeData(): Promise<BrakeData> {
  // Imported lazily: client.ts imports the engine, which imports this module.
  const { callDataTool, dataApiConfig } = await import("./client");
  let reason: string | undefined;
  if (dataApiConfig().live) {
    if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) return { source: "live", rows: liveCache.rows };
    const env = await callDataTool<{ columns: string[]; rows: unknown[][] }>("run_sql", { query: BRAKE_ROWS_SQL, dataset: "brakes" });
    if (env.ok && env.meta?.source === "live" && env.data) {
      const rows = rowsFromSql(env.data.columns, env.data.rows);
      if (rows && rows.length) {
        liveCache = { at: Date.now(), rows };
        return { source: "live", rows };
      }
      reason = rows ? "the service holds no brake rows (db/ingest_brakes.py not run)" : "run_sql returned other columns";
    } else reason = env.error ? `${env.error.code}: ${env.error.message}` : "no live answer";
    console.warn(`[data-api] brake rows: live -> csv (${reason})`);
  }
  const csv = await loadBrakeCsv();
  if (!csv) throw new Error(`The brake dataset is not available (no live brake rows${reason ? `: ${reason}` : ""}, and no CSVs in ${brakesDir()})`);
  return { source: "csv", ...(reason ? { fallback_reason: reason } : {}), rows: joinCsv(csv) };
}
