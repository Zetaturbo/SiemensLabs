"use client";
import { useState } from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { FAMILY_LABEL, FIELD_META, FIELD_ORDER, fieldsOfFamily, formatValue, labelOf, levelFor, num, str, type Family } from "./fields";
import { BlockEmpty, BlockFrame, LEVEL_STYLE, LevelChip, PinButton, SupplierLink, WithResult, cx } from "./primitives";

type Rec = Record<string, unknown>;

export interface PerField {
  field: string;
  best: string | null;
  worst: string | null;
  spread: number | null;
}

export interface CompareData {
  suppliers: Rec[];
  perField: Map<string, PerField>;
  familyScores: Rec[];
  largest: string[];
}

const SKIP = new Set(["supplier_id", "supplier_name", "rank"]);

export function parseCompare(data: unknown): CompareData {
  const d = (data ?? {}) as Rec;
  const suppliers = (Array.isArray(d.suppliers) ? d.suppliers : []).filter((s): s is Rec => !!s && typeof s === "object" && typeof (s as Rec).supplier_id === "string").slice(0, 20);
  const perField = new Map<string, PerField>();
  if (Array.isArray(d.per_field))
    for (const p of d.per_field as Rec[]) if (typeof p?.field === "string") perField.set(p.field, { field: p.field, best: str(p.best), worst: str(p.worst), spread: num(p.spread) });
  const familyScores = (Array.isArray(d.family_scores) ? d.family_scores : []).filter((f): f is Rec => !!f && typeof f === "object");
  const largest = (Array.isArray(d.largest_differences) ? d.largest_differences : []).filter((x): x is string => typeof x === "string");
  return { suppliers, perField, familyScores, largest };
}

function groupOf(field: string): string {
  if (field === "total_risk_index") return "Overall";
  const fam = FIELD_META[field]?.family;
  if (fam) return FAMILY_LABEL[fam as Family];
  return "Operations";
}

export function CompareGridView({ resultId, data, title, fields }: { resultId?: string | null; data?: unknown; title?: string | null; fields?: string[] | null }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <WithResult block="compare-grid" resultId={resultId} data={data} title={title ?? undefined} skeletonRows={6}>
      {(value) => {
        const { suppliers, perField, largest } = parseCompare(value);
        if (suppliers.length === 0) return <BlockEmpty block="compare-grid" title={title ?? "Comparison"} message="No suppliers in this comparison." />;

        const present = new Set<string>();
        for (const s of suppliers) for (const [k, v] of Object.entries(s)) if (!SKIP.has(k) && !k.endsWith("_level") && v !== null && v !== undefined) present.add(k);
        const ordered = [...FIELD_ORDER.filter((f) => present.has(f)), ...[...present].filter((f) => !FIELD_ORDER.includes(f)).sort()];
        const requested = fields?.length ? fields.filter((f) => present.has(f)) : null;
        const keyRows = new Set(["total_risk_index", ...largest, ...fieldsOfFamily("financial"), "delivery_rating", "order_confirmation_rate"]);
        const collapsible = !requested && ordered.length > 12;
        const rows = requested ?? (collapsible && !showAll ? ordered.filter((f) => keyRows.has(f)) : ordered);

        let lastGroup = "";
        return (
          <BlockFrame
            block="compare-grid"
            title={title ?? `Comparing ${suppliers.length} suppliers`}
            subtitle="Cells colored by risk level. ★ best, ▼ worst in this comparison (direction-aware)."
          >
            <div className="-mx-3 overflow-x-auto">
              <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-36 bg-white px-3 py-1 text-left align-bottom text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:bg-zinc-900">
                      Dimension
                    </th>
                    {suppliers.map((s) => {
                      const id = s.supplier_id as string;
                      return (
                        <th key={id} className="min-w-24 max-w-32 px-1.5 py-1 text-left align-bottom font-normal">
                          <SupplierLink id={id}>
                            <span className="block truncate text-[11px] font-semibold" title={str(s.supplier_name) ?? id}>
                              {str(s.supplier_name) ?? id}
                            </span>
                          </SupplierLink>
                          <span className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[10px] text-zinc-400">{id}</span>
                            <PinButton supplierId={id} className="h-5 px-1 text-[10px]" />
                          </span>
                        </th>
                      );
                    })}
                    <th className="px-2 py-1 text-right align-bottom text-[10px] font-medium uppercase tracking-wide text-zinc-400">Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap((field) => {
                    const pf = perField.get(field);
                    const group = groupOf(field);
                    const out = [];
                    if (group !== lastGroup) {
                      lastGroup = group;
                      out.push(
                        <tr key={`g-${group}`}>
                          <td colSpan={suppliers.length + 2} className="sticky left-0 px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                            {group}
                          </td>
                        </tr>,
                      );
                    }
                    out.push(
                      <tr key={field} className="group">
                        <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-0.5 text-left font-normal text-zinc-700 group-hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:group-hover:bg-zinc-800/60">
                          <span className="flex items-center gap-1">
                            {labelOf(field)}
                            {FIELD_META[field]?.higherIsBetter && <span className="text-[9px] text-zinc-400" title="Higher is better">↑ better</span>}
                            {largest.includes(field) && (
                              <span className="rounded bg-sky-500/15 px-1 text-[9px] font-semibold text-sky-700 dark:text-sky-300" title="One of the largest differences">
                                Δ
                              </span>
                            )}
                          </span>
                        </th>
                        {suppliers.map((s) => {
                          const id = s.supplier_id as string;
                          const level = levelFor(s, field);
                          const isBest = pf?.best === id && suppliers.length > 1;
                          const isWorst = pf?.worst === id && suppliers.length > 1;
                          return (
                            <td key={id} className="px-0.5 py-0.5">
                              <span
                                className={cx(
                                  "flex h-6 items-center justify-between gap-1 rounded px-1.5 font-mono tabular-nums",
                                  level ? LEVEL_STYLE[level].cell : "bg-zinc-50 dark:bg-zinc-800/40",
                                )}
                                title={level ? `${labelOf(field)}: ${formatValue(field, s[field])} (${level})` : `${labelOf(field)}: ${formatValue(field, s[field])}`}
                              >
                                <span className={level ? LEVEL_STYLE[level].text : ""}>{formatValue(field, s[field])}</span>
                                <span className="text-[10px]">
                                  {isBest && <span className="text-emerald-600 dark:text-emerald-400" aria-label="best">★</span>}
                                  {isWorst && <span className="text-red-600 dark:text-red-400" aria-label="worst">▼</span>}
                                </span>
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-2 py-0.5 text-right font-mono text-zinc-500 tabular-nums">{pf?.spread != null ? formatValue(field, pf.spread) : "–"}</td>
                      </tr>,
                    );
                    return out;
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                {(["Low", "Medium", "High", "Critical"] as const).map((l) => (
                  <LevelChip key={l} level={l} />
                ))}
              </span>
              {collapsible && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400">
                  {showAll ? "Show key dimensions" : `Show all ${ordered.length} dimensions`}
                </button>
              )}
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const CompareGrid = defineComponent({
  name: "CompareGrid",
  description:
    "Side-by-side comparison of up to 20 suppliers: suppliers as columns, risk dimensions as rows, cells colored by level, " +
    "best and worst marked per dimension. Use for compare_suppliers results.",
  props: z.object({
    resultId: z.string().describe("Handle of a compare_suppliers result"),
    title: z.string().optional().describe("Optional heading"),
    fields: z.array(z.string()).optional().describe("Optional subset of dimension field names to show, e.g. [\"financial_health\", \"credit_rating\"]"),
  }),
  component: ({ props }) => <CompareGridView resultId={props.resultId} title={props.title} fields={props.fields} />,
});
