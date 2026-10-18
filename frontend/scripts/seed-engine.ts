/**
 * Shared helpers for pick-seed.ts and check-seed.ts: run the input-aware mock engine
 * (src/app/api/data/_engine/engine.ts) under plain Node against the dataset CSV, so the seed
 * is chosen and checked with exactly the filters and profile scores the app uses.
 */
import Module from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FALLBACK_KNOCKOUTS } from "@/components/case/domain";
import partsConfig from "@/config/train-parts.json";
import type { DataTool, FilterCondition } from "@/lib/data-api/types";

/** A condition as the case store holds it (SourcingCase.hardRequirements) or as FilterCondition. */
type Condition = FilterCondition | { field: string; op: string; value: unknown };

// Next.js resolves "server-only" itself; under plain Node point it at Next's bundled no-op.
const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolveFilename.call(this, request === "server-only" ? "next/dist/compiled/server-only/empty.js" : request, ...rest);
};

export const ROOT = path.resolve(__dirname, "..");
process.chdir(ROOT); // the engine reads mocks and ../data/supplier_risk_dataset.csv relative to cwd

export type Row = Record<string, unknown> & { supplier_id: string; supplier_name: string };
export interface Ranked {
  rank: number;
  supplier_id: string;
  supplier_name: string;
  profile_score: number;
  total_risk_index: number;
}

export const PARTS = partsConfig.parts.map((p) => ({ id: p.id, label: p.label, group: p.group, profile: p.profile }));

/** The profile's knock-out rules, as the case screen presets them (list_profiles carries none, so the fallbacks apply). */
export const knockouts = (profileId: string): FilterCondition[] => FALLBACK_KNOCKOUTS[profileId] ?? [];

const meta = JSON.parse(readFileSync(path.join(ROOT, "src/lib/data-api/mocks/get_metadata.json"), "utf8")) as {
  data: { fields: Array<{ field: string; type: string; family: string | null }> };
};
/** The 18 risk scores (type "score"), with their family. */
export const SCORES = meta.data.fields.filter((f) => f.type === "score").map((f) => ({ field: f.field, family: f.family ?? "" }));

type Engine = typeof import("@/app/api/data/_engine/engine");
let enginePromise: Promise<Engine> | null = null;

export async function call<T>(tool: DataTool, input: Record<string, unknown>): Promise<T> {
  enginePromise ??= import("@/app/api/data/_engine/engine");
  const env = await (await enginePromise).runMockEngine(tool, input);
  if (!env) throw new Error(`${tool}: no engine result (dataset CSV missing?)`);
  if (!env.ok) throw new Error(`${tool}: ${env.error?.code} ${env.error?.message}`);
  if (env.meta.engine_pool !== "csv") throw new Error(`${tool}: expected the dataset CSV, got ${String(env.meta.engine_pool)}`);
  return env.data as T;
}

export async function getRows(ids: string[]): Promise<Row[]> {
  return (await call<{ suppliers: Row[] }>("get_suppliers", { ids })).suppliers;
}

export async function countMatching(conditions: Condition[]): Promise<number> {
  return (await call<{ total_matching: number }>("filter_suppliers", { conditions, limit: 1, fields: ["supplier_id"] })).total_matching;
}

/** Ids among `ids` that pass every condition. */
export async function passing(ids: string[], conditions: Condition[]): Promise<string[]> {
  const r = await call<{ suppliers: Row[] }>("filter_suppliers", {
    conditions: [...conditions, { field: "supplier_id", op: "in", value: ids }],
    limit: 500,
    fields: ["supplier_id"],
  });
  return r.suppliers.map((s) => s.supplier_id);
}

/** rank_with_profile over explicit ids (as the chat ranks a shortlist). */
export async function rankIds(ids: string[], profileId: string): Promise<Ranked[]> {
  return (await call<{ ranking: Ranked[] }>("rank_with_profile", { ids, profile_id: profileId, limit: ids.length })).ranking;
}

/** rank_with_profile over everything that passes the conditions. */
export async function rankAll(conditions: FilterCondition[], profileId: string, limit: number): Promise<{ total: number; ranking: Ranked[] }> {
  const r = await call<{ total_matching: number; ranking: Ranked[] }>("rank_with_profile", { conditions, profile_id: profileId, limit });
  return { total: r.total_matching, ranking: r.ranking };
}

export const levelFields = (row: Row, level: string) => SCORES.filter((s) => row[`${s.field}_level`] === level).map((s) => s.field);
