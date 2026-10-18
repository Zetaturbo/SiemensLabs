"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { FIELD_META, FIELD_ORDER, fieldsOfFamily, formatValue, isHigherBetter, labelOf, lowerLabel, num, str } from "./fields";
import { BlockEmpty, BlockFrame, Dot, MoreButton, Num, SupplierLink, WithResult, cn } from "./primitives";
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

/** Dimension rows shown before "Show all dimensions" when the model gives no field list. */
export const COMPARE_KEY_ROWS = 8;

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

/** Best supplier on a numeric field: per_field.best when the data service sent it, else direction-aware here. Null on a tie. */
function bestOf(field: string, suppliers: Rec[], pf: PerField | undefined): string | null {
  if (suppliers.length < 2) return null;
  if (pf?.best) return pf.spread === 0 ? null : pf.best;
  const vals = suppliers.map((s) => ({ id: s.supplier_id as string, v: num(s[field]) })).filter((x): x is { id: string; v: number } => x.v !== null);
  if (vals.length < 2 || FIELD_META[field]?.kind === "category") return null;
  const up = isHigherBetter(field);
  const sorted = [...vals].sort((a, b) => (up ? b.v - a.v : a.v - b.v));
  return sorted[0].v === sorted[1].v ? null : sorted[0].id;
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
        // Key rows: the overall score, the largest differences, financial, then delivery; capped so the grid reads at a glance.
        const key = [...new Set(["total_risk_index", ...largest, ...fieldsOfFamily("financial"), "delivery_rating", "order_confirmation_rate"])].filter((f) => present.has(f));
        const keyRows = ordered.filter((f) => key.slice(0, COMPARE_KEY_ROWS).includes(f));
        const collapsible = !requested?.length && ordered.length > keyRows.length;
        const rows = requested?.length ? requested : collapsible && !showAll ? keyRows : ordered;
        const many = suppliers.length > 1;

        return (
          <BlockFrame
            block="compare-grid"
            title={title ?? (many ? `${suppliers.length} suppliers compared` : "One supplier")}
            note={many ? "A dot marks the best value per row, direction-aware: lower is better for risk scores, higher for delivery and confirmation." : undefined}
          >
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b border-subtle">
                    <th scope="col" className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-medium text-subtext">
                      <span className="sr-only">Dimension</span>
                    </th>
                    {suppliers.map((s) => {
                      const id = s.supplier_id as string;
                      return (
                        <th key={id} scope="col" className="max-w-40 px-4 py-2 text-right align-bottom font-medium">
                          <SupplierLink id={id} className="ml-auto block max-w-40 text-right">
                            {str(s.supplier_name) ?? id}
                          </SupplierLink>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((field) => {
                    const best = bestOf(field, suppliers, perField.get(field));
                    return (
                      <tr key={field} className="group transition-colors hover:bg-hover">
                        <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 text-left font-normal text-subtext group-hover:bg-surface-hover">
                          {labelOf(field)}
                        </th>
                        {suppliers.map((s) => {
                          const id = s.supplier_id as string;
                          const isBest = best === id;
                          return (
                            <td key={id} className="whitespace-nowrap px-4 py-2 text-right">
                              <span className="inline-flex items-center justify-end gap-2">
                                {isBest && <Dot fill="var(--risk-low)" label="Best" />}
                                <Num className={cn(isBest ? "font-semibold text-ink" : "text-ink")}>{formatValue(field, s[field])}</Num>
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {many && !requested?.length && largest.length > 0 && (
              <p className="mt-3 text-sm text-subtext">
                Largest differences: {largest.slice(0, 3).map(lowerLabel).join(", ")}.
              </p>
            )}
            {collapsible && <MoreButton onClick={() => setShowAll((v) => !v)}>{showAll ? "Key dimensions only" : `Show all ${ordered.length} dimensions`}</MoreButton>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const CompareGridBlock: ComponentRenderer<BlockProps<"CompareGrid">> = ({ props }) => (
  <CompareGridView resultId={props.resultId} title={props.title} fields={props.fields} />
);
