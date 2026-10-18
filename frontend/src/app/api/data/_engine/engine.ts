import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DataTool, Envelope, FilterCondition } from "@/lib/data-api/types";
import {
  FALLBACK_METADATA,
  levelOf,
  normalizeMetadata,
  normalizeProfiles,
  scoreFields,
  type Metadata,
  type Profile,
  type SupplierRow,
} from "@/components/case/domain";

/**
 * Input-aware mock engine, active only when DATA_API_MOCK=1.
 *
 * The static mocks in src/lib/data-api/mocks hold one response per tool for one fixed input, so
 * they ignore filters, ids and weights. To keep the case screens coherent end to end, this engine
 * answers the supplier tools from a row pool, following ARCHITECTURE.md section 5 and the
 * computation rules in mocks/README.md (same formulas as scripts/gen-mocks.py):
 *   1. the dataset CSV (DATA_MOCK_CSV, default ../data/supplier_risk_dataset.csv): real values;
 *   2. otherwise every supplier row found in the static mocks (approximate counts and percentiles).
 * get_metadata and list_profiles always come from the static mocks (fallback constants if missing).
 * Responses carry meta.source = "mock_engine:<csv|fixtures>" so nobody mistakes them for the service.
 */

type Row = SupplierRow;
interface Pool {
  rows: Row[];
  byId: Map<string, Row>;
  source: "csv" | "fixtures";
}

const MOCK_DIR = path.join(process.cwd(), "src/lib/data-api/mocks");
const CSV_CANDIDATES = [process.env.DATA_MOCK_CSV, path.join(process.cwd(), "../data/supplier_risk_dataset.csv")].filter(Boolean) as string[];

const CSV_RENAME: Record<string, string> = {
  supplierid: "supplier_id",
  "supplier name": "supplier_name",
  "purchase order volume (eur)": "po_volume_eur",
  "order change rate": "order_change_rate",
  "supplier delivery rating": "delivery_rating",
  "order confirmation rate": "order_confirmation_rate",
  "sourcing risk level": "sourcing_risk_level",
  "supply chain complexity": "supply_chain_complexity",
};

const ORDINAL: Record<string, string[]> = {
  level: ["Low", "Medium", "High", "Critical"],
  sourcing_risk_level: ["Low", "Medium", "High"],
  supply_chain_complexity: ["Simple", "Moderate", "Complex"],
};

function csvColumn(name: string): string {
  const k = name.trim().toLowerCase();
  if (CSV_RENAME[k]) return CSV_RENAME[k];
  return k.replace(/_score(_level)?$/, (_m, lvl) => (lvl ? "_level" : "")).replace(/[^a-z0-9]+/g, "_");
}

async function loadCsv(): Promise<Row[] | null> {
  for (const file of CSV_CANDIDATES) {
    try {
      const text = await readFile(file, "utf8");
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      const header = lines[0].split(",").map(csvColumn);
      return lines.slice(1).map((line) => {
        const cells = line.split(",");
        const row: Record<string, unknown> = {};
        header.forEach((h, i) => {
          const raw = cells[i] ?? "";
          const n = Number(raw);
          row[h] = raw !== "" && Number.isFinite(n) && h !== "supplier_id" && h !== "supplier_name" ? n : raw;
        });
        return row as Row;
      });
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function readMock(tool: string): Promise<Envelope<unknown> | null> {
  try {
    return JSON.parse(await readFile(path.join(MOCK_DIR, `${tool}.json`), "utf8")) as Envelope<unknown>;
  } catch {
    return null;
  }
}

function harvestRows(value: unknown, into: Map<string, Row>) {
  if (Array.isArray(value)) {
    for (const v of value) harvestRows(v, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const o = value as Record<string, unknown>;
  if (typeof o.supplier_id === "string" && ("supplier_name" in o || "total_risk_index" in o)) {
    const merged: Record<string, unknown> = { ...(into.get(o.supplier_id) ?? {}) };
    for (const [k, v] of Object.entries(o)) if (v !== null && typeof v !== "object" && k !== "rank" && k !== "profile_score") merged[k] = v;
    into.set(o.supplier_id, merged as Row);
  }
  for (const v of Object.values(o)) if (v && typeof v === "object") harvestRows(v, into);
}

let poolPromise: Promise<Pool | null> | null = null;

async function buildPool(): Promise<Pool | null> {
  const csv = await loadCsv();
  if (csv && csv.length) return { rows: csv, byId: new Map(csv.map((r) => [r.supplier_id, r])), source: "csv" };
  const into = new Map<string, Row>();
  try {
    for (const f of await readdir(MOCK_DIR)) {
      if (!f.endsWith(".json") || f.startsWith("get_metadata") || f.startsWith("list_profiles") || f.startsWith("run_sql")) continue;
      const env = await readMock(f.replace(/\.json$/, ""));
      if (env?.data) harvestRows(env.data, into);
    }
  } catch {
    // no mocks dir
  }
  // only keep rows that carry the full score set, otherwise compare/explain would mislead
  const rows = [...into.values()].filter((r) => typeof r.total_risk_index === "number" && typeof r.quality_risk === "number");
  return rows.length ? { rows, byId: new Map(rows.map((r) => [r.supplier_id, r])), source: "fixtures" } : null;
}

async function getPool(): Promise<Pool | null> {
  if (!poolPromise) poolPromise = buildPool();
  const pool = await poolPromise;
  if (!pool) poolPromise = null; // retry later, mocks may land
  return pool;
}

async function getMeta(): Promise<Metadata> {
  const env = await readMock("get_metadata");
  return env?.ok ? normalizeMetadata(env.data) : FALLBACK_METADATA;
}

async function getProfiles(): Promise<Profile[]> {
  const env = await readMock("list_profiles");
  return normalizeProfiles(env?.ok ? env.data : null);
}

// ------------------------------------------------------------------ helpers

const ok = <T>(data: T, meta: Record<string, unknown>): Envelope<T> => ({ ok: true, data, meta, error: null });
const fail = (code: NonNullable<Envelope<unknown>["error"]>["code"], message: string): Envelope<never> => ({ ok: false, data: null, meta: {}, error: { code, message } });

function ordinalOf(field: string, v: unknown): number | null {
  const scale = ORDINAL[field] ?? (field.endsWith("_level") ? ORDINAL.level : null);
  if (!scale) return null;
  const i = scale.indexOf(String(v));
  return i < 0 ? null : i;
}

/** Numeric view of a value; level and category fields compare by their ordinal order. */
function cmpValue(field: string, v: unknown): number {
  const o = ordinalOf(field, v);
  return o !== null ? o : Number(v);
}

function matches(row: Row, c: FilterCondition): boolean {
  const v = row[c.field] as string | number | undefined;
  if (v === undefined || v === null || v === "") return false;
  const val = c.value;
  const x = cmpValue(c.field, v);
  const y = Array.isArray(val) ? NaN : cmpValue(c.field, val);
  switch (c.op) {
    case "eq":
      return String(v) === String(val);
    case "ne":
      return String(v) !== String(val);
    case "lt":
      return x < y;
    case "lte":
      return x <= y;
    case "gt":
      return x > y;
    case "gte":
      return x >= y;
    case "in":
      return Array.isArray(val) && val.map(String).includes(String(v));
    case "not_in":
      return Array.isArray(val) && !val.map(String).includes(String(v));
    case "between":
      return Array.isArray(val) && val.length === 2 && x >= cmpValue(c.field, val[0]) && x <= cmpValue(c.field, val[1]);
    default:
      return false;
  }
}

function validateConditions(conditions: unknown, sample: Row | undefined): Envelope<never> | null {
  if (conditions === undefined || conditions === null) return null;
  if (!Array.isArray(conditions)) return fail("INVALID_FILTER", "conditions must be an array");
  const ops = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in", "between"]);
  for (const c of conditions as FilterCondition[]) {
    if (!c || typeof c.field !== "string" || !ops.has(c.op)) return fail("INVALID_FILTER", `Invalid condition ${JSON.stringify(c)}`);
    if (sample && !(c.field in sample)) return fail("UNKNOWN_FIELD", `Unknown field ${c.field}`);
    if ((c.op === "in" || c.op === "not_in" || c.op === "between") && !Array.isArray(c.value)) return fail("INVALID_FILTER", `${c.op} needs an array value`);
  }
  return null;
}

function applyConditions(rows: Row[], conditions: unknown): Row[] {
  if (!Array.isArray(conditions) || conditions.length === 0) return rows;
  const cs = conditions as FilterCondition[];
  return rows.filter((r) => cs.every((c) => matches(r, c)));
}

function project(row: Row, fields: unknown): Row {
  if (!Array.isArray(fields) || fields.length === 0) return row;
  const out: Record<string, unknown> = { supplier_id: row.supplier_id, supplier_name: row.supplier_name };
  for (const f of fields as string[]) out[f] = row[f];
  return out as Row;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

interface Ctx {
  changeMin: number;
  changeMax: number;
}

function derived(row: Row, field: string, ctx: Ctx): number | null {
  if (field === "delivery_risk") return typeof row.delivery_rating === "number" ? 100 - row.delivery_rating : null;
  if (field === "confirmation_risk") return typeof row.order_confirmation_rate === "number" ? 100 - row.order_confirmation_rate : null;
  if (field === "change_risk") {
    const v = row.order_change_rate;
    if (typeof v !== "number") return null;
    return (100 * (v - ctx.changeMin)) / (ctx.changeMax - ctx.changeMin || 1);
  }
  const v = row[field];
  return typeof v === "number" ? v : null;
}

function changeCtx(rows: Row[]): Ctx {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    const v = r.order_change_rate;
    if (typeof v === "number") {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return { changeMin: Number.isFinite(lo) ? lo : 0, changeMax: Number.isFinite(hi) ? hi : 100 };
}

/** profile_score = sum(weight * value); weights are renormalized when they do not sum to 1. */
function weightedScore(row: Row, weights: Record<string, number>, ctx: Ctx) {
  let sum = 0;
  let wsum = 0;
  const parts: Array<{ field: string; value: number; contribution: number }> = [];
  for (const [f, w] of Object.entries(weights)) {
    if (!w) continue;
    const v = derived(row, f, ctx);
    if (v === null) continue;
    sum += w * v;
    wsum += w;
    parts.push({ field: f, value: round(v), contribution: w * v });
  }
  const norm = wsum && Math.abs(wsum - 1) > 1e-9 ? wsum : 1;
  return {
    score: wsum ? sum / norm : NaN,
    parts: parts.filter((p) => p.contribution !== 0).map((p) => ({ ...p, contribution: round(p.contribution / norm) })),
  };
}

function officialWeights(meta: Metadata): Record<string, number> {
  return Object.fromEntries(scoreFields(meta).map((f) => [f.field, f.official_weight ?? 0]));
}

function resolveWeights(meta: Metadata, profiles: Profile[], profileId: string): Record<string, number> | null {
  if (profileId === "default") return officialWeights(meta);
  return profiles.find((p) => p.profile_id === profileId)?.weights ?? null;
}

const KRALJIC_P75 = 0.75;

// ------------------------------------------------------------------ tools

export async function runMockEngine(tool: DataTool, input: Record<string, unknown>): Promise<Envelope<unknown> | null> {
  if (tool === "get_metadata") {
    const env = await readMock("get_metadata");
    return env?.ok ? env : ok(FALLBACK_METADATA, { source: "mock_engine:fallback" });
  }
  if (tool === "list_profiles") {
    const env = await readMock("list_profiles");
    if (env?.ok) return env;
    return ok({ profiles: await getProfiles() }, { source: "mock_engine:fallback" });
  }

  const pool = await getPool();
  if (!pool) return null; // nothing to compute from: the caller serves the static mock or its error
  const meta = await getMeta();
  const baseMeta = { source: `mock_engine:${pool.source}`, pool_size: pool.rows.length };
  const ctx = changeCtx(pool.rows);
  const sample = pool.source === "csv" ? pool.rows[0] : undefined;

  switch (tool) {
    case "filter_suppliers": {
      const bad = validateConditions(input.conditions, sample);
      if (bad) return bad;
      let rows = applyConditions(pool.rows, input.conditions);
      const sortBy = Array.isArray(input.sort_by) ? (input.sort_by as Array<{ field: string; order?: string }>) : [];
      rows = [...rows].sort((a, b) => {
        for (const s of sortBy) {
          const av = a[s.field];
          const bv = b[s.field];
          if (av === bv) continue;
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          const x = cmpValue(s.field, av);
          const y = cmpValue(s.field, bv);
          const cmp = Number.isFinite(x) && Number.isFinite(y) ? x - y : String(av).localeCompare(String(bv));
          if (cmp !== 0) return s.order === "desc" ? -cmp : cmp;
        }
        return a.supplier_id.localeCompare(b.supplier_id);
      });
      const limit = Math.max(0, Math.min(Number(input.limit ?? 50) || 0, 500));
      const offset = Math.max(0, Number(input.offset ?? 0) || 0);
      const page = rows.slice(offset, offset + limit).map((r) => project(r, input.fields));
      return ok({ total_matching: rows.length, suppliers: page }, { ...baseMeta, row_count: page.length, truncated: rows.length > offset + page.length });
    }

    case "get_suppliers": {
      const ids = Array.isArray(input.ids) ? (input.ids as string[]) : [];
      const unknown = ids.filter((id) => !pool.byId.has(id));
      if (pool.source === "csv" && unknown.length) return fail("UNKNOWN_SUPPLIER", `${unknown.join(", ")} does not exist`);
      const rows = ids.map((id) => pool.byId.get(id)).filter((r): r is Row => !!r).map((r) => project(r, input.fields));
      return ok({ suppliers: rows }, { ...baseMeta, row_count: rows.length, unknown_ids: unknown });
    }

    case "rank_with_profile": {
      const profiles = await getProfiles();
      const profileId = typeof input.profile_id === "string" ? input.profile_id : "default";
      const custom = input.custom_weights && typeof input.custom_weights === "object" ? (input.custom_weights as Record<string, number>) : null;
      const weights = custom ?? resolveWeights(meta, profiles, profileId);
      if (!weights) return fail("UNKNOWN_PROFILE", `Unknown profile ${profileId}`);
      const bad = validateConditions(input.conditions, sample);
      if (bad) return bad;
      const ids = Array.isArray(input.ids) ? (input.ids as string[]) : null;
      const set = ids ? ids.map((id) => pool.byId.get(id)).filter((r): r is Row => !!r) : applyConditions(pool.rows, input.conditions);
      const def = officialWeights(meta);
      const scored = set.map((r) => ({ r, ...weightedScore(r, weights, ctx), def: weightedScore(r, def, ctx).score }));
      const byDefault = [...scored].sort((a, b) => a.def - b.def || a.r.supplier_id.localeCompare(b.r.supplier_id));
      const defRank = new Map(byDefault.map((x, i) => [x.r.supplier_id, i + 1]));
      const ranked = [...scored].sort((a, b) => a.score - b.score || a.r.supplier_id.localeCompare(b.r.supplier_id));
      const limit = Number(input.limit ?? 20) || 20;
      const ranking = ranked.slice(0, limit).map((x, i) => {
        const dr = defRank.get(x.r.supplier_id) ?? i + 1;
        return {
          rank: i + 1,
          supplier_id: x.r.supplier_id,
          supplier_name: x.r.supplier_name,
          profile_score: round(x.score),
          total_risk_index: x.r.total_risk_index,
          default_rank: dr,
          rank_change: dr - (i + 1),
          top_contributors: [...x.parts].sort((a, b) => b.contribution - a.contribution).slice(0, 3),
        };
      });
      const pid = custom ? "custom" : profileId;
      return ok({ profile_id: pid, weights, total_matching: set.length, ranking }, { ...baseMeta, row_count: ranking.length, truncated: set.length > ranking.length, profile_id: pid });
    }

    case "compare_suppliers": {
      const ids = Array.isArray(input.ids) ? (input.ids as string[]) : [];
      if (ids.length > 20) return fail("TOO_MANY_SUPPLIERS", "At most 20 suppliers can be compared");
      const unknown = ids.filter((id) => !pool.byId.has(id));
      if (pool.source === "csv" && unknown.length) return fail("UNKNOWN_SUPPLIER", `${unknown.join(", ")} does not exist`);
      const rows = ids.map((id) => pool.byId.get(id)).filter((r): r is Row => !!r);
      const sf = scoreFields(meta);
      const profiles = await getProfiles();
      const profileId = typeof input.profile_id === "string" ? input.profile_id : "default";
      const weights = resolveWeights(meta, profiles, profileId) ?? officialWeights(meta);
      const numeric =
        Array.isArray(input.fields) && input.fields.length
          ? (input.fields as string[])
          : ["total_risk_index", ...sf.map((f) => f.field), "po_volume_eur", "order_change_rate", "delivery_rating", "order_confirmation_rate"];
      const per_field = numeric
        .map((field) => {
          const vals = rows.map((r) => ({ id: r.supplier_id, v: r[field] })).filter((x): x is { id: string; v: number } => typeof x.v === "number");
          if (vals.length === 0) return null;
          const direction = meta.fields.find((f) => f.field === field)?.direction ?? "higher_is_worse";
          let lo = vals[0];
          let hi = vals[0];
          for (const x of vals) {
            if (x.v < lo.v) lo = x;
            if (x.v > hi.v) hi = x;
          }
          const spread = round(hi.v - lo.v);
          if (spread === 0 || field === "po_volume_eur") return { field, direction: field === "po_volume_eur" ? "exposure" : direction, best: null, worst: null, spread };
          const better = direction === "higher_is_better";
          return { field, direction, best: better ? hi.id : lo.id, worst: better ? lo.id : hi.id, spread };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const families = [...new Set(sf.map((f) => f.family as string))];
      const family_scores = rows.map((r) => {
        const out: Record<string, unknown> = { supplier_id: r.supplier_id };
        for (const fam of families) {
          let s = 0;
          let w = 0;
          for (const f of sf.filter((x) => x.family === fam)) {
            const v = r[f.field];
            if (typeof v !== "number") continue;
            const wt = f.official_weight ?? 1;
            s += wt * v;
            w += wt;
          }
          out[fam] = w ? round(s / w) : null;
        }
        return out;
      });
      const largest_differences = per_field
        .filter((p) => sf.some((f) => f.field === p.field))
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 3)
        .map((p) => p.field);
      const suppliers = rows.map((r) => ({
        ...project(r, Array.isArray(input.fields) && input.fields.length ? input.fields : null),
        profile_score: round(weightedScore(r, weights, ctx).score),
      }));
      return ok({ suppliers, per_field, family_scores, largest_differences }, { ...baseMeta, row_count: rows.length, profile_id: profileId, unknown_ids: unknown });
    }

    case "explain_supplier": {
      const id = String(input.id ?? "");
      const row = pool.byId.get(id);
      if (!row) return fail("UNKNOWN_SUPPLIER", `${id} does not exist`);
      const profiles = await getProfiles();
      const profileId = typeof input.profile_id === "string" ? input.profile_id : "default";
      const weights = resolveWeights(meta, profiles, profileId);
      if (!weights) return fail("UNKNOWN_PROFILE", `Unknown profile ${profileId}`);
      const contributions = Object.entries(weights)
        .filter(([, w]) => w > 0)
        .map(([field, weight]) => {
          const value = derived(row, field, ctx);
          if (value === null) return null;
          const all = pool.rows.map((r) => derived(r, field, ctx)).filter((v): v is number => v !== null);
          const m = mean(all);
          return {
            field,
            value: round(value),
            level: field.endsWith("_risk") && !(field in row) ? null : levelOf(value),
            weight,
            percentile: round((all.filter((v) => v < value).length / (all.length || 1)) * 100),
            dataset_mean: round(m),
            contribution_vs_mean: round(weight * (value - m)),
          };
        })
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => b.contribution_vs_mean - a.contribution_vs_mean);
      const tri = typeof row.total_risk_index === "number" ? row.total_risk_index : null;
      const triAll = pool.rows.map((r) => r.total_risk_index).filter((v): v is number => typeof v === "number");
      const critical = scoreFields(meta)
        .map((f) => f.field)
        .filter((f) => row[`${f}_level`] === "Critical" || levelOf(row[f] as number) === "Critical");
      const order = contributions.map((c) => c.field);
      critical.sort((a, b) => (order.includes(a) ? order.indexOf(a) : 99) - (order.includes(b) ? order.indexOf(b) : 99));
      return ok(
        {
          supplier_id: id,
          supplier_name: row.supplier_name,
          profile_id: profileId,
          total_risk_index: tri,
          total_risk_level: (row.total_risk_index_level as string) ?? levelOf(tri),
          percentile: tri === null ? null : round((triAll.filter((v) => v < tri).length / (triAll.length || 1)) * 100),
          dataset_mean: round(mean(triAll)),
          profile_score: round(weightedScore(row, weights, ctx).score),
          contributions,
          critical_fields: critical,
          operational_metrics: {
            delivery_rating: row.delivery_rating,
            order_confirmation_rate: row.order_confirmation_rate,
            order_change_rate: row.order_change_rate,
          },
          context: { po_volume_eur: row.po_volume_eur, sourcing_risk_level: row.sourcing_risk_level, supply_chain_complexity: row.supply_chain_complexity },
        },
        { ...baseMeta, row_count: 1, profile_id: profileId },
      );
    }

    case "kraljic_position": {
      const vols = pool.rows.map((r) => r.po_volume_eur).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
      const threshold = round(quantile(vols, KRALJIC_P75));
      // Team decision (mocks/README.md): only High sourcing risk counts as high supply risk.
      const highLevels = ["High"];
      const place = (r: Row) => {
        const spend_high = typeof r.po_volume_eur === "number" && r.po_volume_eur >= threshold;
        const supply_risk_high = highLevels.includes(String(r.sourcing_risk_level));
        const quadrant = spend_high ? (supply_risk_high ? "strategic" : "leverage") : supply_risk_high ? "bottleneck" : "non_critical";
        return { spend_high, supply_risk_high, quadrant };
      };
      const quadrant_counts: Record<string, number> = { strategic: 0, leverage: 0, bottleneck: 0, non_critical: 0 };
      for (const r of pool.rows) quadrant_counts[place(r).quadrant]++;
      const thresholds = { po_volume_eur_high: threshold, po_volume_eur_percentile: 75, supply_risk_high_levels: highLevels };
      const ids = Array.isArray(input.ids) ? (input.ids as string[]) : null;
      if (!ids) return ok({ thresholds, quadrant_counts }, baseMeta);
      const suppliers = ids
        .map((id) => pool.byId.get(id))
        .filter((r): r is Row => !!r)
        .map((r) => ({ supplier_id: r.supplier_id, supplier_name: r.supplier_name, po_volume_eur: r.po_volume_eur, sourcing_risk_level: r.sourcing_risk_level, ...place(r) }));
      return ok({ thresholds, quadrant_counts, suppliers }, { ...baseMeta, row_count: suppliers.length });
    }

    case "get_dataset_stats": {
      const bad = validateConditions(input.conditions, sample);
      if (bad) return bad;
      const rows = applyConditions(pool.rows, input.conditions);
      const fields = Array.isArray(input.fields) && input.fields.length ? (input.fields as string[]) : ["total_risk_index"];
      const stats = fields.map((field) => {
        const vals = rows.map((r) => derived(r, field, ctx)).filter((v): v is number => v !== null).sort((a, b) => a - b);
        const m = mean(vals);
        const std = vals.length > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1)) : 0;
        const hasLevel = rows.length > 0 && `${field}_level` in rows[0];
        let level_counts: Record<string, number> | null = null;
        if (hasLevel) {
          level_counts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
          for (const r of rows) {
            const l = r[`${field}_level`];
            if (typeof l === "string") level_counts[l] = (level_counts[l] ?? 0) + 1;
          }
        }
        return {
          field,
          count: vals.length,
          mean: round(m),
          std: round(std),
          p25: round(quantile(vals, 0.25)),
          median: round(quantile(vals, 0.5)),
          p75: round(quantile(vals, 0.75)),
          min: vals[0] ?? null,
          max: vals[vals.length - 1] ?? null,
          level_counts,
        };
      });
      return ok({ stats }, { ...baseMeta, row_count: stats.length });
    }

    default:
      return null;
  }
}
