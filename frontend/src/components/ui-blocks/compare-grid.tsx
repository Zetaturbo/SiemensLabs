"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Button } from "@/design-system/react";
import { FAMILY_LABEL, FIELD_META, FIELD_ORDER, fieldsOfFamily, formatValue, labelOf, levelFor, num, str, type Family } from "./fields";
import { BETTER, BlockEmpty, BlockFrame, LEVEL_STYLE, LevelChip, PinButton, SupplierLink, WORSE, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

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

/** compare_suppliers { suppliers, per_field, family_scores, largest_differences }; missing parts default to empty. */
export function parseCompare(data: unknown): CompareData {
  const d = (data ?? {}) as Rec;
  const suppliers = (Array.isArray(d.suppliers) ? d.suppliers : [])
    .filter((s): s is Rec => !!s && typeof s === "object" && typeof (s as Rec).supplier_id === "string")
    .slice(0, 20);
  const perField = new Map<string, PerField>();
  if (Array.isArray(d.per_field))
    for (const p of d.per_field as Rec[]) if (typeof p?.field === "string") perField.set(p.field, { field: p.field, best: str(p.best), worst: str(p.worst), spread: num(p.spread) });
  const familyScores = (Array.isArray(d.family_scores) ? d.family_scores : []).filter((f): f is Rec => !!f && typeof f === "object");
  const largest = (Array.isArray(d.largest_differences) ? d.largest_differences : []).filter((x): x is string => typeof x === "string");
  return { suppliers, perField, familyScores, largest };
}

function groupOf(field: string): string {
  if (field === "total_risk_index" || field === "profile_score") return "Overall";
  const fam = FIELD_META[field]?.family;
  return fam ? FAMILY_LABEL[fam as Family] : "Operations";
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
          <BlockFrame block="compare-grid" title={title ?? `Comparing ${suppliers.length} suppliers`} subtitle="Cells colored by risk level. ★ best and ▼ worst per dimension, direction-aware.">
            <div className="-mx-3 overflow-x-auto">
              <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-36 bg-surface px-3 py-1 text-left align-bottom text-2xs font-medium uppercase tracking-wide text-tertiary">Dimension</th>
                    {suppliers.map((s) => {
                      const id = s.supplier_id as string;
                      return (
                        <th key={id} className="min-w-24 max-w-32 px-1 py-1 text-left align-bottom font-normal">
                          <SupplierLink id={id} className="block text-xs font-semibold">
                            {str(s.supplier_name) ?? id}
                          </SupplierLink>
                          <span className="flex items-center justify-between gap-1">
                            <span className="font-mono text-2xs text-tertiary">{id}</span>
                            <PinButton supplierId={id} className="size-6" />
                          </span>
                        </th>
                      );
                    })}
                    <th className="px-2 py-1 text-right align-bottom text-2xs font-medium uppercase tracking-wide text-tertiary">Spread</th>
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
                          <td colSpan={suppliers.length + 2} className="sticky left-0 px-3 pb-0.5 pt-2 text-2xs font-semibold uppercase tracking-wide text-tertiary">
                            {group}
                          </td>
                        </tr>,
                      );
                    }
                    out.push(
                      <tr key={field} className="group">
                        <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-0.5 text-left font-normal text-subtext group-hover:bg-hover">
                          <span className="flex items-center gap-1">
                            {labelOf(field)}
                            {FIELD_META[field]?.higherIsBetter && <span className="text-2xs text-tertiary" title="Higher is better">↑ better</span>}
                            {largest.includes(field) && (
                              <span className="rounded-sm bg-sunken px-1 text-2xs font-semibold text-ink" title="One of the largest differences">
                                Δ
                              </span>
                            )}
                          </span>
                        </th>
                        {suppliers.map((s) => {
                          const id = s.supplier_id as string;
                          const level = levelFor(s, field);
                          const isBest = suppliers.length > 1 && pf?.best === id;
                          const isWorst = suppliers.length > 1 && pf?.worst === id;
                          const text = formatValue(field, s[field]);
                          return (
                            <td key={id} className="px-0.5 py-0.5">
                              <span
                                className={cn("tabular flex h-6 items-center justify-between gap-1 rounded-sm px-1.5 font-mono", level ? LEVEL_STYLE[level].cell : "bg-sunken")}
                                title={`${labelOf(field)}: ${text}${level ? ` (${level})` : ""}${isBest ? ", best" : ""}${isWorst ? ", worst" : ""}`}
                              >
                                <span className={level ? LEVEL_STYLE[level].text : "text-ink"}>{text}</span>
                                <span className="text-2xs">
                                  {isBest && <span className={BETTER} aria-label="best">★</span>}
                                  {isWorst && <span className={WORSE} aria-label="worst">▼</span>}
                                </span>
                              </span>
                            </td>
                          );
                        })}
                        <td className="tabular px-2 py-0.5 text-right font-mono text-subtext">{pf?.spread != null ? formatValue(field, pf.spread) : "–"}</td>
                      </tr>,
                    );
                    return out;
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                {(["Low", "Medium", "High", "Critical"] as const).map((l) => (
                  <LevelChip key={l} level={l} />
                ))}
              </span>
              {collapsible && (
                <Button variant="link" size="sm" className="text-xs" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show key dimensions" : `Show all ${ordered.length} dimensions`}
                </Button>
              )}
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const CompareGridBlock: ComponentRenderer<BlockProps<"CompareGrid">> = ({ props }) => (
  <CompareGridView resultId={props.resultId} title={props.title} fields={props.fields} />
);
