"use client";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { UiAction } from "@/components/chat/ui-actions";
import type { ViewBlock } from "@/skills/types";

/**
 * What a block knows about where it is rendered: the current sourcing case (for pins),
 * who acts (for the case log), and how to raise UI actions or ask a follow-up question.
 * ChatPanel provides it; outside a provider blocks still render, pins are disabled.
 */
export interface BlockEnv {
  caseId: string | null;
  who: string;
  /** Raise a UI action (open_supplier, start_research, ...). ChatPanel routes it like a model ui_action. */
  dispatch: (action: UiAction) => void;
  /** Send a follow-up question to the chat, when there is one. */
  ask?: (text: string) => void;
  /** A block reports what it shows (component, handle, supplier ids, a label without numbers) for the chat's `view`. */
  report?: (block: ViewBlock) => void;
}

const DEFAULT_ENV: BlockEnv = { caseId: null, who: "buyer", dispatch: () => {} };
const BlockEnvContext = createContext<BlockEnv>(DEFAULT_ENV);

export function BlockEnvProvider({ caseId, who, dispatch, ask, report, children }: Partial<BlockEnv> & { children: ReactNode }) {
  const value = useMemo<BlockEnv>(
    () => ({ caseId: caseId ?? null, who: who ?? DEFAULT_ENV.who, dispatch: dispatch ?? DEFAULT_ENV.dispatch, ask, report }),
    [caseId, who, dispatch, ask, report],
  );
  return <BlockEnvContext.Provider value={value}>{children}</BlockEnvContext.Provider>;
}

export const useBlockEnv = () => useContext(BlockEnvContext);

// ------------------------------------------------------------------ view reports

type Rec = Record<string, unknown>;
const SUPPLIER_ID = /^(?:SUPP_\d{5}|BRK_\d{4})$/;

/** "ranked-list" -> "RankedList" (the OpenUI component name). */
const componentOf = (block: string) => block.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());

/** How many rows a block shows before "show all" (so visible_ids are what is on screen). */
const VISIBLE_CAP: Record<string, number> = { "ranked-list": 8, table: 8, "offering-table": 8, "rfq-board": 8 };

/** Supplier ids a result payload shows, in display order: lists of suppliers/ranking/similar, ids, a single supplier, table rows. */
export function visibleSupplierIds(block: string, data: unknown): string[] {
  const d = (data ?? {}) as Rec;
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && SUPPLIER_ID.test(v) && !out.includes(v)) out.push(v);
  };
  for (const key of ["ranking", "similar", "suppliers", "offerings"]) if (Array.isArray(d[key])) (d[key] as Rec[]).forEach((r) => push(r?.supplier_id));
  // RfqBoard: qualified offers first, as the board lists them
  if (Array.isArray(d.offers)) [...(d.offers as Rec[]).filter((o) => o?.qualified), ...(d.offers as Rec[]).filter((o) => !o?.qualified)].forEach((r) => push(r?.supplier_id));
  if (Array.isArray(d.ids)) (d.ids as unknown[]).forEach(push);
  if (Array.isArray(d.candidate_ids)) (d.candidate_ids as unknown[]).forEach(push);
  push(d.supplier_id);
  push(d.requested_id);
  if (Array.isArray(d.rows)) {
    const col = Array.isArray(d.columns) ? (d.columns as unknown[]).indexOf("supplier_id") : -1;
    (d.rows as unknown[]).forEach((r) => push(Array.isArray(r) ? (col >= 0 ? r[col] : undefined) : (r as Rec | null)?.supplier_id));
  }
  return out.slice(0, VISIBLE_CAP[block] ?? 20);
}

/** Short label without data values: what kind of result the block shows. */
function labelOf(block: string, data: unknown): string | undefined {
  const d = (data ?? {}) as Rec;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  if (block === "ranked-list") {
    if (Array.isArray(d.ranking)) return `ranked with profile ${s(d.profile_id) ?? "default"}`;
    if (Array.isArray(d.similar)) return `similar to ${s(d.reference) ?? "a supplier"}`;
    return "suppliers matching the filters";
  }
  if (block === "guidance") return `what matters for ${s((d.part as Rec | null)?.label) ?? s(d.query) ?? "the part"}`;
  if (block === "verdict" || block === "compare-grid" || block === "radar-profile") return "comparison";
  if (block === "supplier-card" || block === "contribution-waterfall") return "one supplier";
  if (block === "memo") return s(d.title) ?? "memo";
  if (block === "offering-table") return `offerings of ${s((d.filters as Rec | null)?.product_type)?.toLowerCase() ?? "brake products"}`;
  if (block === "rfq-board") return `RFQ for ${s((d.spec as Rec | null)?.product_type)?.toLowerCase() ?? "a brake product"}, qualified first`;
  return undefined;
}

/** Rendered by WithResult once a block has its data; reports it to the chat panel (no-op outside one). */
export function ReportVisible({ block, resultId, data }: { block: string; resultId?: string | null; data: unknown }) {
  const { report } = useBlockEnv();
  const ids = visibleSupplierIds(block, data);
  const label = labelOf(block, data);
  const key = ids.join(",");
  useEffect(() => {
    if (!report || !resultId) return;
    report({ component: componentOf(block), result_id: resultId, label, visible_ids: key ? key.split(",") : [] });
  }, [report, resultId, block, label, key]);
  return null;
}
