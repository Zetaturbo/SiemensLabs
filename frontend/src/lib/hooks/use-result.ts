"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Fetch + cache a skill result by handle (GET /api/results/:id).
 *
 * SWR-style: one module-level cache shared by every block, concurrent requests for the
 * same handle are deduplicated, cached values render synchronously (also during SSR when
 * primed), and `refresh()` refetches. Results are immutable per handle, so there is no
 * background revalidation. Envelopes ({ ok, data, error }) are unwrapped transparently.
 */

export type ResultStatus = "idle" | "loading" | "success" | "error";

export class ResultError extends Error {
  /** True when the handle is unknown or expired (HTTP 404). */
  readonly expired: boolean;
  readonly status: number | null;
  constructor(message: string, opts: { expired?: boolean; status?: number | null } = {}) {
    super(message);
    this.name = "ResultError";
    this.expired = opts.expired ?? false;
    this.status = opts.status ?? null;
  }
}

interface Entry {
  status: ResultStatus;
  data?: unknown;
  error?: ResultError;
  promise?: Promise<void>;
}

const IDLE: Entry = { status: "idle" };
const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function setEntry(id: string, entry: Entry) {
  cache.set(id, entry);
  listeners.get(id)?.forEach((l) => l());
}

function unwrap(json: unknown): unknown {
  if (json && typeof json === "object" && "ok" in json && "data" in json) {
    const env = json as { ok: unknown; data: unknown; error?: { message?: string } | null };
    if (env.ok === false) throw new ResultError(env.error?.message ?? "The data service returned an error");
    return env.data;
  }
  return json;
}

let fetcher: (id: string) => Promise<unknown> = async (id) => {
  const res = await fetch(`/api/results/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) throw new ResultError("This result has expired or is unknown. Ask again to refresh it.", { expired: true, status: 404 });
  if (!res.ok) throw new ResultError(`Could not load the result (HTTP ${res.status})`, { status: res.status });
  return unwrap(await res.json());
};

/** Swap the fetcher (tests, demo mode without a server). */
export function setResultFetcher(fn: (id: string) => Promise<unknown>) {
  fetcher = fn;
}

function load(id: string, force = false): Promise<void> {
  const current = cache.get(id);
  if (current?.promise) return current.promise;
  if (!force && current && current.status === "success") return Promise.resolve();
  const promise = fetcher(id)
    .then((value) => setEntry(id, { status: "success", data: value }))
    .catch((e: unknown) => {
      const error = e instanceof ResultError ? e : new ResultError(e instanceof Error ? e.message : String(e));
      setEntry(id, { status: "error", error });
    });
  setEntry(id, { status: "loading", data: current?.data, promise });
  return promise;
}

/** Put a value into the cache under a handle (fixtures, demo mode, optimistic results). */
export function primeResult(id: string, value: unknown) {
  setEntry(id, { status: "success", data: value });
}

export function primeResults(values: Record<string, unknown>) {
  for (const [id, value] of Object.entries(values)) primeResult(id, value);
}

export function invalidateResult(id: string) {
  cache.delete(id);
  listeners.get(id)?.forEach((l) => l());
}

/** Read a cached value without subscribing (null when not loaded). */
export function peekResult<T = unknown>(id: string): T | null {
  const e = cache.get(id);
  return e?.status === "success" ? (e.data as T) : null;
}

/** Fetch a handle ahead of render. */
export function prefetchResult(id: string) {
  return load(id);
}

function subscribe(id: string, cb: () => void) {
  let set = listeners.get(id);
  if (!set) listeners.set(id, (set = new Set()));
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(id);
  };
}

export interface UseResult<T> {
  data: T | undefined;
  error: ResultError | undefined;
  status: ResultStatus;
  isLoading: boolean;
  /** True when the handle is unknown or expired. */
  isExpired: boolean;
  refresh: () => void;
}

/**
 * @param resultId handle from a skill result; null/empty skips fetching.
 * @param opts.data pre-fetched value: when given, no request is made (lets screens reuse blocks with their own data).
 */
export function useResult<T = unknown>(resultId: string | null | undefined, opts: { data?: T } = {}): UseResult<T> {
  const id = opts.data !== undefined ? null : resultId || null;
  const sub = useCallback((cb: () => void) => (id ? subscribe(id, cb) : () => {}), [id]);
  const snap = useCallback(() => (id ? cache.get(id) ?? IDLE : IDLE), [id]);
  const entry = useSyncExternalStore(sub, snap, snap);

  // Errors stay put until refresh(); only a never-requested handle loads automatically.
  useEffect(() => {
    if (id && entry.status === "idle") void load(id);
  }, [id, entry.status]);

  const refresh = useCallback(() => {
    if (id) void load(id, true);
  }, [id]);

  if (opts.data !== undefined) {
    return { data: opts.data, error: undefined, status: "success", isLoading: false, isExpired: false, refresh };
  }
  return {
    data: entry.data as T | undefined,
    error: entry.error,
    status: id ? (entry.status === "idle" ? "loading" : entry.status) : "idle",
    isLoading: !!id && (entry.status === "idle" || entry.status === "loading"),
    isExpired: entry.error?.expired ?? false,
    refresh,
  };
}
