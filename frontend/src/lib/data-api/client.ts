import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runMockEngine } from "@/app/api/data/_engine/engine";
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
 * Every envelope carries meta.source = "live" | "engine" | "mock" (the UI shows it as a badge), and each
 * fallback logs one line. A live envelope with ok: false (unknown supplier, bad filter) is returned as is:
 * the service answered, so the engine does not second-guess it.
 */

export const LIVE_TIMEOUT_MS = 3000;

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
  const env = await resolveDataTool(tool, input);
  if (listeners.size) {
    const event: DataCallEvent = { tool, source: env.meta.source ?? "mock", ok: env.ok, ms: Math.round(performance.now() - t0) };
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
