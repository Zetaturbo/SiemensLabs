"use client";
import { useCallback, useEffect, useState } from "react";
import type { DataTool, Envelope } from "@/lib/data-api/types";

/**
 * Client access to the supplier data tools through POST /api/data/:tool (src/app/api/data/[tool]/route.ts).
 *
 *   const { data, loading, error, meta } = useDataTool<FilterResult>("filter_suppliers", { conditions, limit: 50 });
 *   const env = await fetchDataTool<CompareResult>("compare_suppliers", { ids });   // imperative
 *
 * Pass `null` as input to skip the call. Results are cached per (tool, input) for the session and
 * concurrent identical calls are de-duplicated. While a new input loads, the previous data stays
 * visible (`stale: true`) so tables and charts do not flash.
 */

type AnyEnvelope = Envelope<unknown>;

const MAX_CACHE = 300;
const cache = new Map<string, AnyEnvelope>();
const inflight = new Map<string, Promise<AnyEnvelope>>();

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function dataToolKey(tool: DataTool, input: Record<string, unknown>): string {
  return JSON.stringify([tool, sortKeys(input)]);
}

function networkError(message: string): AnyEnvelope {
  return { ok: false, data: null, meta: {}, error: { code: "INTERNAL", message } };
}

export async function fetchDataTool<T = unknown>(
  tool: DataTool,
  input: Record<string, unknown> = {},
  opts: { fresh?: boolean } = {},
): Promise<Envelope<T>> {
  const key = dataToolKey(tool, input);
  if (!opts.fresh) {
    const hit = cache.get(key);
    if (hit) return hit as Envelope<T>;
    const pending = inflight.get(key);
    if (pending) return (await pending) as Envelope<T>;
  }
  const p = (async (): Promise<AnyEnvelope> => {
    try {
      const res = await fetch(`/api/data/${tool}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const env = (await res.json()) as AnyEnvelope;
      if (!env || typeof env !== "object" || !("ok" in env)) return networkError(`Unexpected response from ${tool}`);
      if (env.ok) {
        cache.set(key, env);
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
      }
      return env;
    } catch (e) {
      return networkError(`Could not reach the data route: ${(e as Error).message}`);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return (await p) as Envelope<T>;
}

/** Drop cached results, e.g. after the data service switched from mocks to live. */
export function invalidateDataTools(tool?: DataTool) {
  for (const k of [...cache.keys()]) if (!tool || k.startsWith(`["${tool}"`)) cache.delete(k);
}

export interface DataToolState<T> {
  data: T | null;
  meta: Envelope<T>["meta"];
  error: Envelope<T>["error"];
  loading: boolean;
  /** true while showing the previous input's data during a reload */
  stale: boolean;
  refetch: () => void;
}

const EMPTY_META = {};

export function useDataTool<T = unknown>(tool: DataTool, input: Record<string, unknown> | null): DataToolState<T> {
  const key = input ? dataToolKey(tool, input) : null;
  const [state, setState] = useState<{ key: string | null; env: AnyEnvelope | null }>({ key: null, env: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const [t, inp] = JSON.parse(key) as [DataTool, Record<string, unknown>];
    fetchDataTool(t, inp, { fresh: nonce > 0 }).then((env) => {
      if (!cancelled) setState({ key, env });
    });
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const cached = key ? cache.get(key) : undefined;
  const current = key && state.key === key ? state.env : cached ?? null;
  const loading = !!key && !current;
  const shown = current ?? (loading ? state.env : null);
  return {
    data: (shown?.ok ? (shown.data as T) : null) ?? null,
    meta: (shown?.meta as Envelope<T>["meta"]) ?? EMPTY_META,
    error: current && !current.ok ? current.error : null,
    loading,
    stale: loading && !!shown,
    refetch,
  };
}
