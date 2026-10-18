"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Button, InlineCode, TBody, THead, Table, Td, Th, Tr } from "@/design-system/react";
import { FIELD_META, asLevel, formatValue, labelOf, num, str } from "./fields";
import { BlockEmpty, BlockFrame, LevelChip, Num, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/** run_sql { columns, rows } with rows as arrays or objects; otherwise the first array of records in the result. */
export function toTable(data: unknown): { columns: string[]; rows: unknown[][]; query: string | null; truncated: boolean } {
  const d = (data && typeof data === "object" ? data : {}) as Rec;
  const query = str(d.query) ?? str(d.sql);
  if (Array.isArray(d.columns) && Array.isArray(d.rows)) {
    const columns = (d.columns as unknown[]).map((c) => (typeof c === "string" ? c : str((c as Rec)?.name) ?? String(c)));
    const rows = (d.rows as unknown[]).map((r) => (Array.isArray(r) ? r : r && typeof r === "object" ? columns.map((c) => (r as Rec)[c]) : [r]));
    return { columns, rows, query, truncated: d.truncated === true };
  }
  const list = Array.isArray(data)
    ? data
    : ((Object.values(d).find((v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x))) as unknown[] | undefined) ?? []);
  const recs = list.filter((r): r is Rec => !!r && typeof r === "object");
  const columns: string[] = [];
  for (const r of recs) for (const [k, v] of Object.entries(r)) if (!columns.includes(k) && (v === null || typeof v !== "object")) columns.push(k);
  return { columns, rows: recs.map((r) => columns.map((c) => r[c])), query, truncated: false };
}

function Cell({ column, value }: { column: string; value: unknown }) {
  const level = asLevel(value);
  if (level) return <LevelChip level={level} />;
  if (value === null || value === undefined) return <span className="text-tertiary">–</span>;
  if (typeof value === "number") return <Num>{FIELD_META[column] ? formatValue(column, value) : value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</Num>;
  if (typeof value === "boolean") return <span>{value ? "yes" : "no"}</span>;
  return <span>{String(value)}</span>;
}

export function TableView({ resultId, data, title, maxRows }: { resultId?: string | null; data?: unknown; title?: string | null; maxRows?: number | null }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [all, setAll] = useState(false);
  return (
    <WithResult block="table" resultId={resultId} data={data} skeletonRows={5}>
      {(value) => {
        const { columns, rows, query, truncated } = toTable(value);
        if (!columns.length) return <BlockEmpty block="table" title={title ?? "Table"} message="This result has no rows." />;
        const sorted = sort
          ? [...rows].sort((a, b) => {
              const x = a[sort.col];
              const y = b[sort.col];
              const nx = num(x);
              const ny = num(y);
              return (nx !== null && ny !== null ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""))) * sort.dir;
            })
          : rows;
        const cap = maxRows && maxRows > 0 ? maxRows : 25;
        const shown = all ? sorted : sorted.slice(0, cap);
        const numeric = columns.map((_, i) => rows.some((r) => typeof r[i] === "number"));
        return (
          <BlockFrame block="table" title={title ?? `${rows.length} row${rows.length === 1 ? "" : "s"}`} subtitle={query ? <InlineCode className="text-2xs">{query}</InlineCode> : undefined}>
            <div className="-mx-3 -mt-3 max-h-96 overflow-auto">
              <Table className="text-sm">
                <THead sticky>
                  <tr>
                    {columns.map((c, i) => (
                      <Th key={c} className={cn("px-3 py-1.5 text-2xs", numeric[i] && "text-right")} aria-sort={sort?.col === i ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                        <button
                          type="button"
                          className="uppercase tracking-wide hover:text-ink"
                          onClick={() => setSort((s) => (s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 }))}
                        >
                          {FIELD_META[c] ? labelOf(c) : c}
                          {sort?.col === i && (sort.dir === 1 ? " ↑" : " ↓")}
                        </button>
                      </Th>
                    ))}
                  </tr>
                </THead>
                <TBody>
                  {shown.map((r, ri) => (
                    <Tr key={ri}>
                      {columns.map((c, ci) => (
                        <Td key={c} className={cn("px-3 py-1.5", numeric[ci] && "text-right")}>
                          <Cell column={c} value={r[ci]} />
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
            <div className="mt-1 flex items-center justify-between text-2xs text-tertiary">
              <span>{truncated ? "Truncated at 200 rows by the data service." : ""}</span>
              {rows.length > cap && (
                <Button variant="link" size="sm" className="text-xs" onClick={() => setAll((v) => !v)}>
                  {all ? "Show fewer" : `Show all ${rows.length}`}
                </Button>
              )}
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const TableBlock: ComponentRenderer<BlockProps<"Table">> = ({ props }) => <TableView resultId={props.resultId} title={props.title} maxRows={props.maxRows} />;
