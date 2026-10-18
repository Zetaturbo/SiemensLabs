"use client";
import { useState } from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { FIELD_META, asLevel, formatValue, labelOf, num, str } from "./fields";
import { BlockEmpty, BlockFrame, LevelChip, WithResult } from "./primitives";

type Rec = Record<string, unknown>;

/** run_sql { columns, rows } with rows as arrays or objects; otherwise the first array of records found in the result. */
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
    : (Object.values(d).find((v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x))) as unknown[] | undefined) ?? [];
  const recs = list.filter((r): r is Rec => !!r && typeof r === "object");
  const columns: string[] = [];
  for (const r of recs) for (const [k, v] of Object.entries(r)) if (!columns.includes(k) && (v === null || typeof v !== "object")) columns.push(k);
  return { columns, rows: recs.map((r) => columns.map((c) => r[c])), query, truncated: false };
}

function Cell({ column, value }: { column: string; value: unknown }) {
  const level = asLevel(value);
  if (level) return <LevelChip level={level} />;
  if (value === null || value === undefined) return <span className="text-zinc-400">–</span>;
  if (typeof value === "number") return <span className="font-mono tabular-nums">{FIELD_META[column] ? formatValue(column, value) : value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</span>;
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
              const c = nx !== null && ny !== null ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""));
              return c * sort.dir;
            })
          : rows;
        const cap = maxRows && maxRows > 0 ? maxRows : 25;
        const shown = all ? sorted : sorted.slice(0, cap);
        const numeric = columns.map((_, i) => rows.some((r) => typeof r[i] === "number"));
        return (
          <BlockFrame block="table" title={title ?? `${rows.length} row${rows.length === 1 ? "" : "s"}`} subtitle={query ? <code className="font-mono text-[10px]">{query}</code> : undefined}>
            <div className="-mx-3 max-h-96 overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                  <tr>
                    {columns.map((c, i) => (
                      <th key={c} className={`border-b border-zinc-200 px-3 py-1 font-medium text-zinc-500 dark:border-zinc-800 ${numeric[i] ? "text-right" : "text-left"}`}>
                        <button
                          type="button"
                          className="hover:text-zinc-900 dark:hover:text-zinc-100"
                          onClick={() => setSort((s) => (s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 }))}
                        >
                          {FIELD_META[c] ? labelOf(c) : c}
                          {sort?.col === i && (sort.dir === 1 ? " ↑" : " ↓")}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, ri) => (
                    <tr key={ri} className="odd:bg-zinc-50/60 dark:odd:bg-zinc-800/30">
                      {columns.map((c, ci) => (
                        <td key={c} className={`px-3 py-1 ${numeric[ci] ? "text-right" : ""}`}>
                          <Cell column={c} value={r[ci]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
              <span>{truncated ? "Truncated at 200 rows by the data service." : ""}</span>
              {rows.length > cap && (
                <button type="button" className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400" onClick={() => setAll((v) => !v)}>
                  {all ? "Show fewer" : `Show all ${rows.length}`}
                </button>
              )}
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const Table = defineComponent({
  name: "Table",
  description: "Generic sortable table of columns and rows. Use for run_sql results and any tabular answer no other block fits.",
  props: z.object({
    resultId: z.string().describe("Handle of a run_sql result (columns + rows) or any result holding a list of records"),
    title: z.string().optional().describe("Optional heading"),
    maxRows: z.number().optional().describe("Rows shown before 'Show all' (default 25)"),
  }),
  component: ({ props }) => <TableView resultId={props.resultId} title={props.title} maxRows={props.maxRows} />,
});
