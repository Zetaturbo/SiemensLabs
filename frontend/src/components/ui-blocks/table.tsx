"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { FIELD_META, asLevel, formatValue, labelOf, num, str } from "./fields";
import { BlockEmpty, BlockFrame, LEVEL_STYLE, LevelDot, MoreButton, Num, SupplierLink, WithResult, Dot, cn } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/** Visible limits: the rest sits behind "More columns" and "Show all". */
export const TABLE_MAX_COLUMNS = 6;
export const TABLE_MAX_ROWS = 8;

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

/**
 * Display columns: a `<field>_level` column next to its score folds into that score (dot before the number),
 * and supplier_id folds into supplier_name (the name opens the supplier).
 */
interface DisplayColumn {
  key: string;
  index: number;
  levelIndex: number | null;
  idIndex: number | null;
  numeric: boolean;
}

function displayColumns(columns: string[], rows: unknown[][]): DisplayColumn[] {
  const idx = (c: string) => columns.indexOf(c);
  const folded = new Set<number>();
  const out: DisplayColumn[] = [];
  columns.forEach((c, i) => {
    const levelIndex = idx(`${c}_level`) >= 0 ? idx(`${c}_level`) : c === "total_risk_index" && idx("total_risk_level") >= 0 ? idx("total_risk_level") : null;
    if (levelIndex !== null) folded.add(levelIndex);
    const idIndex = c === "supplier_name" && idx("supplier_id") >= 0 ? idx("supplier_id") : null;
    if (idIndex !== null) folded.add(idIndex);
    out.push({ key: c, index: i, levelIndex, idIndex, numeric: rows.some((r) => typeof r[i] === "number") });
  });
  return out.filter((c) => !folded.has(c.index));
}

const header = (c: string) => (FIELD_META[c] ? labelOf(c) : c.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()));

function Cell({ col, row }: { col: DisplayColumn; row: unknown[] }) {
  const value = row[col.index];
  const level = asLevel(value);
  if (level) return <LevelDot level={level} />;
  if (value === null || value === undefined || value === "") return <span className="text-tertiary">–</span>;
  if (col.idIndex !== null && typeof row[col.idIndex] === "string")
    return (
      <SupplierLink id={row[col.idIndex] as string} className="block max-w-56">
        {String(value)}
      </SupplierLink>
    );
  if (typeof value === "number") {
    const lv = col.levelIndex !== null ? asLevel(row[col.levelIndex]) : null;
    return (
      <span className="inline-flex items-center justify-end gap-2">
        {lv && <Dot fill={LEVEL_STYLE[lv].fill} label={lv} />}
        <Num>{FIELD_META[col.key] ? formatValue(col.key, value) : value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</Num>
      </span>
    );
  }
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span className="block max-w-64 truncate">{String(value)}</span>;
}

export function TableView({ resultId, data, title, maxRows }: { resultId?: string | null; data?: unknown; title?: string | null; maxRows?: number | null }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [allRows, setAllRows] = useState(false);
  const [allCols, setAllCols] = useState(false);
  return (
    <WithResult block="table" resultId={resultId} data={data} skeletonRows={5}>
      {(value) => {
        const { columns, rows, query, truncated } = toTable(value);
        const heading = title ?? `${rows.length} row${rows.length === 1 ? "" : "s"}`;
        if (!columns.length || !rows.length) return <BlockEmpty block="table" title={title ?? "Table"} message="This result has no rows." />;
        const sorted = sort
          ? [...rows].sort((a, b) => {
              const x = a[sort.col];
              const y = b[sort.col];
              const nx = num(x);
              const ny = num(y);
              return (nx !== null && ny !== null ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""))) * sort.dir;
            })
          : rows;
        const cap = Math.min(maxRows && maxRows > 0 ? maxRows : TABLE_MAX_ROWS, TABLE_MAX_ROWS);
        const shown = allRows ? sorted : sorted.slice(0, cap);
        const cols = displayColumns(columns, rows);
        const visible = allCols ? cols : cols.slice(0, TABLE_MAX_COLUMNS);
        const hiddenCols = cols.length - visible.length;
        const note = [query && `Query: ${query}`, truncated && "Truncated at 200 rows by the data service."].filter(Boolean).join(" ") || undefined;
        return (
          <BlockFrame block="table" title={heading} note={note}>
            <div className={cn("-mx-4 overflow-x-auto", allRows && rows.length > 20 && "max-h-[28rem] overflow-y-auto")}>
              <table className="w-full border-collapse text-sm">
                <thead className={cn(allRows && "sticky top-0 z-10 bg-surface")}>
                  <tr className="border-b border-subtle">
                    {visible.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={cn("whitespace-nowrap px-4 py-2 font-medium text-subtext", c.numeric ? "text-right" : "text-left")}
                        aria-sort={sort?.col === c.index ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                      >
                        <button
                          type="button"
                          className="rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
                          onClick={() => setSort((s) => (s?.col === c.index ? (s.dir === 1 ? { col: c.index, dir: -1 } : null) : { col: c.index, dir: 1 }))}
                        >
                          {header(c.key)}
                          {sort?.col === c.index && (sort.dir === 1 ? " ↑" : " ↓")}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, ri) => (
                    <tr key={ri} className="transition-colors hover:bg-hover">
                      {visible.map((c) => (
                        <td key={c.key} className={cn("whitespace-nowrap px-4 py-2 text-ink", c.numeric && "text-right")}>
                          <Cell col={c} row={r} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(rows.length > cap || cols.length > TABLE_MAX_COLUMNS) && (
              <div className="flex flex-wrap gap-x-4">
                {rows.length > cap && <MoreButton onClick={() => setAllRows((v) => !v)}>{allRows ? "Show fewer" : `Show all ${rows.length}`}</MoreButton>}
                {cols.length > TABLE_MAX_COLUMNS && (
                  <MoreButton onClick={() => setAllCols((v) => !v)}>{allCols ? "Fewer columns" : `${hiddenCols} more column${hiddenCols === 1 ? "" : "s"}`}</MoreButton>
                )}
              </div>
            )}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const TableBlock: ComponentRenderer<BlockProps<"Table">> = ({ props }) => <TableView resultId={props.resultId} title={props.title} maxRows={props.maxRows} />;
