import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runMockEngine } from "@/app/api/data/_engine/engine";
import { DEFAULT_DATASET, parseDataset, type Dataset } from "./datasets";
import type { DataSource, DataTool, Envelope } from "./types";

/**
 * One entry point for every data tool, used by the skills (chat) and by POST /api/data/:tool (screens).
 *
 * Resolution order, per call:
 *   1. live    the data service at POST {DATA_API_URL}/tools/<tool>, 3 s timeout. Skipped when DATA_API_URL
 *              is empty or DATA_API_MOCK=1.
 *   2. engine  on connection error, timeout, HTTP 404 (tool not built yet) or a response that is not an
 *              envelope: the request-time engine (src/app/api/data/_engine/engine.ts), which computes the
 *              tool from the dataset CSV.
 *   3. mock    when the engine does not cover the tool: the static file src/lib/data-api/mocks/<tool>.json
 *              (one fixed input; meta.mock_input says which).
 * Exception: run_sql never falls back. Its static mock is one canned table for one query, which the chat would
 * present as the answer to any query, so without the live service it returns ok: false, code NOT_AVAILABLE
 * (meta.source "engine"); the skill then fails and the model is told the query could not run.
 * Every envelope carries meta.source = "live" | "engine" | "mock" (the UI shows it as a badge), and each
 * fallback logs one line. A live envelope with ok: false (unknown supplier, bad filter) is returned as is:
 * the service answered, so the engine does not second-guess it.
 *
 * Datasets (src/lib/data-api/datasets.ts): every input may carry `dataset` (default "portfolio"). It is taken out
 * of the input before any layer sees it, so portfolio calls are exactly what they were. For "brakes":
 *   - the contract tools skip the live step: the service has no dataset switch, and its Postgres load mixes the
 *     brake suppliers into the portfolio, so it answers them as if the tool were not built (the 404 path);
 *   - run_sql still goes live (the service views supplier_offerings, supplier_profiles and suppliers hold the
 *     brake rows) and is NOT_AVAILABLE without it;
 *   - the engine computes every tool from the brake CSVs (meta.dataset = "brakes");
 *   - the static mocks are portfolio-only, so there is no third step: an engine miss is NOT_AVAILABLE.
 */

export const LIVE_TIMEOUT_MS = 3000;

/** Tools only the live service can answer: no engine, and the static mock would mislead (see above). */
const LIVE_ONLY: ReadonlySet<DataTool> = new Set<DataTool>(["run_sql"]);

/** Read per call, so scripts and tests can change the environment after import. */
export function dataApiConfig() {
  const url = (process.env.DATA_API_URL ?? "").trim().replace(/\/+$/, "");
  const mock = process.env.DATA_API_MOCK === "1";
  return { url, mock, live: Boolean(url) && !mock };
}

const MOCK_DIR = () => path.join(process.cwd(), "src/lib/data-api/mocks");

function withSource<T>(env: Envelope<T>, source: DataSource, extra: Record<string, unknown> = {}): Envelope<T> {
  return { ...env, meta: { ...(env.meta ?? {}), ...extra, source } };
}

function isEnvelope(v: unknown): v is Envelope<unknown> {
  return !!v && typeof v === "object" && "ok" in v && typeof (v as { ok: unknown }).ok === "boolean";
}

type LiveOutcome = { env: Envelope<unknown> } | { fallback: string };

async function callLive(base: string, tool: DataTool, input: Record<string, unknown>): Promise<LiveOutcome> {
  let res: Response;
  try {
    res = await fetch(`${base}/tools/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    if (err.name === "TimeoutError" || err.name === "AbortError") return { fallback: `timeout after ${LIVE_TIMEOUT_MS} ms` };
    return { fallback: `connection error (${err.cause?.code ?? err.message})` };
  }
  if (res.status === 404) return { fallback: "404, tool not built in the service" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { fallback: `HTTP ${res.status} without a JSON envelope` };
  }
  if (!isEnvelope(body)) return { fallback: `HTTP ${res.status} without a JSON envelope` };
  return { env: body };
}

async function readStaticMock(tool: DataTool): Promise<Envelope<unknown>> {
  const file = path.join(MOCK_DIR(), `${tool}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as Envelope<unknown>;
  } catch {
    return { ok: false, data: null, meta: {}, error: { code: "INTERNAL", message: `No mock for ${tool} at ${file}` } };
  }
}

function logFallback(tool: DataTool, from: DataSource, to: DataSource, reason: string) {
  console.warn(`[data-api] ${tool}: ${from} -> ${to} (${reason})`);
}

/** One event per callDataTool call, after resolution. The answers eval uses it to record which layer answered. */
export interface DataCallEvent {
  tool: DataTool;
  dataset: Dataset;
  source: DataSource;
  ok: boolean;
  ms: number;
}
const listeners = new Set<(e: DataCallEvent) => void>();

/** Subscribe to data calls; returns the unsubscribe function. */
export function onDataCall(fn: (e: DataCallEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function callDataTool<T = unknown>(tool: DataTool, input: Record<string, unknown> = {}): Promise<Envelope<T>> {
  const t0 = performance.now();
  const { dataset: rawDataset, ...rest } = input;
  const dataset = parseDataset(rawDataset) ?? DEFAULT_DATASET;
  const env = dataset === DEFAULT_DATASET ? await resolveDataTool(tool, rest) : await resolveDatasetTool(tool, rest, dataset);
  if (listeners.size) {
    const event: DataCallEvent = { tool, dataset, source: env.meta.source ?? "mock", ok: env.ok, ms: Math.round(performance.now() - t0) };
    for (const fn of listeners) fn(event);
  }
  return env as Envelope<T>;
}

async function resolveDataTool(tool: DataTool, input: Record<string, unknown>): Promise<Envelope<unknown>> {
  const cfg = dataApiConfig();

  if (cfg.live) {
    const live = await callLive(cfg.url, tool, input);
    if ("env" in live) return withSource(live.env, "live");
    logFallback(tool, "live", "engine", live.fallback);
  }

  if (LIVE_ONLY.has(tool)) {
    console.warn(`[data-api] ${tool}: NOT_AVAILABLE (live only, no engine or mock fallback)`);
    return {
      ok: false,
      data: null,
      meta: { source: "engine" },
      error: { code: "NOT_AVAILABLE", message: `${tool} needs the live data service (DATA_API_URL)` },
    };
  }

  let engine: Envelope<unknown> | null = null;
  let reason = "engine does not cover this tool";
  try {
    engine = await runMockEngine(tool, input);
  } catch (e) {
    reason = `engine failed: ${(e as Error).message}`;
  }
  if (engine) return withSource(engine, "engine");
  logFallback(tool, "engine", "mock", reason);

  return withSource(await readStaticMock(tool), "mock");
}

const notAvailable = (tool: DataTool, message: string): Envelope<unknown> => ({
  ok: false,
  data: null,
  meta: { source: "engine" },
  error: { code: "NOT_AVAILABLE", message: `${tool}: ${message}` },
});

/** Non-portfolio datasets: run_sql live only, every other tool from the engine on that dataset (see the header). */
async function resolveDatasetTool(tool: DataTool, input: Record<string, unknown>, dataset: Dataset): Promise<Envelope<unknown>> {
  const cfg = dataApiConfig();
  if (LIVE_ONLY.has(tool)) {
    if (cfg.live) {
      const live = await callLive(cfg.url, tool, input);
      if ("env" in live) return withSource(live.env, "live", { dataset });
      logFallback(tool, "live", "engine", live.fallback);
    }
    console.warn(`[data-api] ${tool}: NOT_AVAILABLE on ${dataset} (live only, no engine or mock fallback)`);
    return notAvailable(tool, "needs the live data service (DATA_API_URL)");
  }
  if (cfg.live) logFallback(tool, "live", "engine", `${dataset} dataset: the service serves the portfolio only`);
  try {
    const env = await runMockEngine(tool, { ...input, dataset });
    if (env) return withSource(env, "engine", { dataset });
    return notAvailable(tool, `the engine does not compute this tool on the ${dataset} dataset, and the static mocks are portfolio-only`);
  } catch (e) {
    return notAvailable(tool, `engine failed on the ${dataset} dataset: ${(e as Error).message}`);
  }
}
