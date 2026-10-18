"use client";
import { fieldLabel, fmtEur, fmtNum, num, type Metadata, type RankEntry, type SupplierRow } from "@/components/case/domain";
import { LevelChip, ScoreCell, cx, ui } from "@/components/case/primitives";

export interface SortSpec {
  field: string;
  order: "asc" | "desc";
}

export type ResultRow = SupplierRow & { _rank?: RankEntry };

function RankChange({ change }: { change: number | undefined }) {
  if (change === undefined || change === 0) return <span className={ui.faint}>=</span>;
  return change > 0 ? (
    <span className="text-emerald-700 dark:text-emerald-400" title={`${change} places higher than under the default weights`}>
      ▲{change}
    </span>
  ) : (
    <span className="text-red-700 dark:text-red-400" title={`${-change} places lower than under the default weights`}>
      ▼{-change}
    </span>
  );
}

export function ResultsTable({
  meta,
  rows,
  keyFields,
  sort,
  onSort,
  ranked,
  offset,
  pinned,
  canPin,
  onPin,
  onOpen,
  selectedId,
}: {
  meta: Metadata;
  rows: ResultRow[];
  keyFields: string[];
  sort: SortSpec;
  onSort: (field: string) => void;
  ranked: boolean;
  offset: number;
  pinned: Set<string>;
  canPin: boolean;
  onPin: (id: string) => void;
  onOpen: (id: string) => void;
  selectedId: string | null;
}) {
  const header = (field: string, label: string, align: "left" | "right" = "left", title?: string) => {
    const active = !ranked && sort.field === field;
    return (
      <th className={cx(ui.th, align === "right" && "text-right")} aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : undefined} title={title}>
        {ranked ? (
          label
        ) : (
          <button type="button" className={cx("inline-flex items-center gap-0.5 uppercase hover:text-zinc-900 dark:hover:text-zinc-100", active && "text-zinc-900 dark:text-zinc-100")} onClick={() => onSort(field)}>
            {label}
            <span aria-hidden className="w-2">
              {active ? (sort.order === "asc" ? "↑" : "↓") : ""}
            </span>
          </button>
        )}
      </th>
    );
  };

  return (
    <table className="w-full border-separate border-spacing-0 text-xs">
      <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
        <tr>
          <th className={cx(ui.th, "w-10 text-right")}>{ranked ? "Rank" : "#"}</th>
          {header("supplier_name", "Supplier")}
          {header("total_risk_index", "TRI", "left", "Total Risk Index (0 = no risk, 100 = max)")}
          {ranked && <th className={cx(ui.th, "text-right")} title="Profile score, lower is better">Score</th>}
          {keyFields.map((f) => header(f, fieldLabel(meta, f).replace(/ Risk$/, ""), "left", meta.fields.find((x) => x.field === f)?.description))}
          {header("delivery_rating", "Delivery", "right", "Delivery rating, higher is better")}
          {header("order_change_rate", "Changes", "right", "Order change rate, higher is worse")}
          {header("po_volume_eur", "Volume", "right", "Purchase order volume (exposure)")}
          {header("sourcing_risk_level", "Sourcing")}
          <th className={cx(ui.th, "w-24")}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isPinned = pinned.has(r.supplier_id);
          return (
            <tr
              key={r.supplier_id}
              className={cx("cursor-pointer border-b hover:bg-blue-50/60 dark:hover:bg-blue-500/5", selectedId === r.supplier_id && "bg-blue-50 dark:bg-blue-500/10")}
              onClick={() => onOpen(r.supplier_id)}
            >
              <td className={cx(ui.td, "border-b text-right tabular-nums", ui.border, ui.muted)}>
                {ranked ? (
                  <span className="flex items-center justify-end gap-1">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{r._rank?.rank ?? i + 1}</span>
                    <RankChange change={r._rank?.rank_change} />
                  </span>
                ) : (
                  offset + i + 1
                )}
              </td>
              <td className={cx(ui.td, "border-b", ui.border)}>
                <div className="font-medium">{r.supplier_name ?? r.supplier_id}</div>
                <div className={cx("font-mono text-[10px]", ui.faint)}>{r.supplier_id}</div>
              </td>
              <td className={cx(ui.td, "border-b", ui.border)}>
                <LevelChip score={num(r.total_risk_index)} level={r.total_risk_index_level} />
              </td>
              {ranked && <td className={cx(ui.td, "border-b text-right tabular-nums font-medium", ui.border)}>{fmtNum(num(r._rank?.profile_score), 1)}</td>}
              {keyFields.map((f) => (
                <td key={f} className={cx(ui.td, "border-b", ui.border)}>
                  <ScoreCell value={r[f]} level={r[`${f}_level`]} label={fieldLabel(meta, f)} />
                </td>
              ))}
              <td className={cx(ui.td, "border-b text-right tabular-nums", ui.border)}>{fmtNum(num(r.delivery_rating), 1)}%</td>
              <td className={cx(ui.td, "border-b text-right tabular-nums", ui.border)}>{fmtNum(num(r.order_change_rate), 1)}%</td>
              <td className={cx(ui.td, "border-b text-right tabular-nums", ui.border)}>{fmtEur(num(r.po_volume_eur))}</td>
              <td className={cx(ui.td, "border-b", ui.border, ui.muted)}>{typeof r.sourcing_risk_level === "string" ? r.sourcing_risk_level : "–"}</td>
              <td className={cx(ui.td, "border-b text-right", ui.border)}>
                <button
                  type="button"
                  className={isPinned ? cx(ui.btn, "border-blue-500 text-blue-700 disabled:opacity-100 dark:text-blue-300") : ui.btnPrimary}
                  disabled={isPinned || !canPin}
                  title={isPinned ? "On the shortlist. Drop it on the shortlist board, with a reason." : canPin ? "Add to shortlist" : "Shortlist is full (20)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(r.supplier_id);
                  }}
                >
                  {isPinned ? "✓ Shortlisted" : "+ Shortlist"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
