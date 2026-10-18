"use client";
import { useEffect, useMemo, useState } from "react";
import type { FilterCondition } from "@/lib/data-api/types";
import { fetchDataTool } from "./use-data-tool";

/**
 * Supplier search by name or id inside the current filters, for screens (the board's candidate table).
 *
 *   const s = useSupplierSearch(query, conditions);   // { active, ids, loading, error }
 *
 * An id ("SUPP_00609", "609") resolves directly. A name searches an index of the matching suppliers' ids and names,
 * loaded once per filter set in pages of 500 through filter_suppliers (lowest Total Risk Index first, so the hits keep
 * that order), because the data tools have no text operator. Every word of the query must occur in the name or id.
 */

const PAGE = 500;
/** Upper bound on the index (the dataset has 10,000 suppliers). */
const MAX_ROWS = 12_000;

type Entry = { id: string; name: string };
const indexes = new Map<string, Promise<Entry[]>>();

async function loadIndex(conditions: FilterCondition[]): Promise<Entry[]> {
  const out: Entry[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const env = await fetchDataTool<{ total_matching?: number; suppliers?: Array<Record<string, unknown>> }>("filter_suppliers", {
      conditions,
      sort_by: [{ field: "total_risk_index", order: "asc" }],
      fields: ["supplier_id", "supplier_name"],
      limit: PAGE,
      offset,
    });
    if (!env.ok || !env.data) throw new Error(env.error?.message ?? "Search failed");
    const rows = env.data.suppliers ?? [];
    for (const r of rows) if (typeof r.supplier_id === "string") out.push({ id: r.supplier_id, name: typeof r.supplier_name === "string" ? r.supplier_name : "" });
    const total = env.data.total_matching ?? 0;
    if (rows.length < PAGE || offset + PAGE >= total) break;
  }
  return out;
}

function indexFor(conditions: FilterCondition[]): Promise<Entry[]> {
  const key = JSON.stringify(conditions);
  let p = indexes.get(key);
  if (!p) {
    p = loadIndex(conditions);
    p.catch(() => indexes.delete(key)); // a failed load is retried on the next search
    indexes.set(key, p);
    if (indexes.size > 8) indexes.delete(indexes.keys().next().value as string);
  }
  return p;
}

/** "SUPP_00609", "supp 609", "00609", "609" -> "SUPP_00609"; null for anything else. */
export function supplierIdFrom(query: string): string | null {
  const m = /^(?:supp[_\s-]?)?0*(\d{1,5})$/i.exec(query.trim());
  return m ? `SUPP_${m[1].padStart(5, "0")}` : null;
}

export interface SupplierSearch {
  /** true while there is a query */
  active: boolean;
  /** matching ids in display order; null while the index loads */
  ids: string[] | null;
  /** an id query: the supplier may lie outside the filters */
  byId: boolean;
  loading: boolean;
  error: string | null;
}

export function useSupplierSearch(query: string, conditions: FilterCondition[]): SupplierSearch {
  const q = query.trim().toLowerCase();
  const id = supplierIdFrom(q);
  const key = JSON.stringify(conditions);
  const [state, setState] = useState<{ key: string; entries: Entry[] | null; error: string | null } | null>(null);
  const needIndex = q !== "" && !id;

  useEffect(() => {
    if (!needIndex) return;
    let cancelled = false;
    indexFor(JSON.parse(key) as FilterCondition[]).then(
      (entries) => !cancelled && setState({ key, entries, error: null }),
      (e: Error) => !cancelled && setState({ key, entries: null, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [needIndex, key]);

  return useMemo<SupplierSearch>(() => {
    if (!q) return { active: false, ids: null, byId: false, loading: false, error: null };
    if (id) return { active: true, ids: [id], byId: true, loading: false, error: null };
    const current = state?.key === key ? state : null;
    if (!current) return { active: true, ids: null, byId: false, loading: true, error: null };
    if (current.error || !current.entries) return { active: true, ids: [], byId: false, loading: false, error: current.error };
    const words = q.split(/\s+/).filter(Boolean);
    const ids = current.entries.filter((e) => {
      const hay = `${e.name} ${e.id}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).map((e) => e.id);
    return { active: true, ids, byId: false, loading: false, error: null };
  }, [q, id, key, state]);
}
