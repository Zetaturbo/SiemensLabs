"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { asLevel, num, str } from "./fields";
import { BlockEmpty, BlockFrame, Dot, LEVEL_STYLE, MoreButton, Num, PinButton, SupplierLink, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/** Rows shown before "Show all". */
export const OFFERING_TABLE_CAP = 8;

export interface OfferingRow {
  id: string;
  name: string;
  prospect: boolean;
  product: string | null;
  price: number | null;
  lead: number | null;
  capacity: number | null;
  moq: number | null;
  tri: number | null;
  triLevel: ReturnType<typeof asLevel>;
}

/** find_offerings { total, offerings[], filters, stats, source }. */
export function parseOfferings(data: unknown) {
  const d = (data ?? {}) as Rec;
  const rows: OfferingRow[] = (Array.isArray(d.offerings) ? (d.offerings as Rec[]) : []).flatMap((o) =>
    typeof o?.supplier_id === "string"
      ? [
          {
            id: o.supplier_id,
            name: str(o.supplier_name) ?? o.supplier_id,
            prospect: o.supplier_status === "Prospect",
            product: str(o.product_type),
            price: num(o.unit_price_eur),
            lead: num(o.lead_time_days),
            capacity: num(o.annual_capacity_units),
            moq: num(o.moq_units),
            tri: num(o.total_risk_index),
            triLevel: asLevel(o.total_risk_index_level),
          },
        ]
      : [],
  );
  const filters = (d.filters ?? {}) as Rec;
  const products = [...new Set(rows.map((r) => r.product).filter(Boolean))] as string[];
  return { rows, total: num(d.total) ?? rows.length, product: str(filters.product_type) ?? (products.length === 1 ? products[0] : null), source: str(d.source) };
}

const int = (v: number | null) => (v === null ? "–" : v.toLocaleString("en-GB"));
const price = (v: number | null) => (v === null ? "–" : v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const COLUMNS = ["Supplier", "Unit price (EUR)", "Lead time (d)", "Capacity / yr", "MOQ", "Total risk"] as const;

export function OfferingTableView({ resultId, data, title }: { resultId?: string | null; data?: unknown; title?: string | null }) {
  const [all, setAll] = useState(false);
  return (
    <WithResult block="offering-table" resultId={resultId} data={data} skeletonRows={5}>
      {(value) => {
        const { rows, total, product, source } = parseOfferings(value);
        const heading = title ?? `${total} offering${total === 1 ? "" : "s"}${product ? ` · ${product.toLowerCase()}` : ""}`;
        if (!rows.length) return <BlockEmpty block="offering-table" title={heading} message="No offering in the catalog matches." />;
        const shown = all ? rows : rows.slice(0, OFFERING_TABLE_CAP);
        const note = `Cheapest first. Quoted unit prices exclude freight, duties and tooling. Source: ${source === "live" ? "data service (run_sql)" : "brake dataset CSVs"}.`;
        return (
          <BlockFrame block="offering-table" title={heading} note={note}>
            <div className={cn("-mx-4 overflow-x-auto", all && rows.length > 20 && "max-h-[28rem] overflow-y-auto")}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-subtle">
                    {COLUMNS.map((c, i) => (
                      <th key={c} scope="col" className={cn("whitespace-nowrap px-4 py-2 font-medium text-subtext", i === 0 ? "text-left" : "text-right")}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={`${r.id}-${i}`} className="group transition-colors hover:bg-hover">
                      <td className="max-w-64 px-4 py-2">
                        <span className="flex min-w-0 items-center gap-1">
                          <SupplierLink id={r.id} className="min-w-0 truncate">
                            {r.name}
                          </SupplierLink>
                          {r.prospect && <span className="shrink-0 text-subtext">· Prospect</span>}
                          <PinButton supplierId={r.id} reveal className="ml-auto" />
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Num>{price(r.price)}</Num>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Num>{int(r.lead)}</Num>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Num>{int(r.capacity)}</Num>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Num>{int(r.moq)}</Num>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          {r.triLevel && <Dot fill={LEVEL_STYLE[r.triLevel].fill} label={r.triLevel} />}
                          <Num>{int(r.tri)}</Num>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > OFFERING_TABLE_CAP && <MoreButton onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${rows.length}`}</MoreButton>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const OfferingTableBlock: ComponentRenderer<BlockProps<"OfferingTable">> = ({ props }) => <OfferingTableView resultId={props.resultId} title={props.title} />;
