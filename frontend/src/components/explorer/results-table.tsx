"use client";
import { ArrowDown, ArrowUp, Check, Plus } from "lucide-react";
import { Button, TBody, THead, Table, Td, Th, Tr } from "@/design-system/react";
import { cn } from "@/lib/utils";
import { fieldLabel, fmtEur, fmtNum, num, shortFieldLabel, type Metadata, type RankEntry, type SupplierRow } from "@/components/case/domain";
import { LevelChip, ScoreCell } from "@/components/case/primitives";

export interface SortSpec {
  field: string;
  order: "asc" | "desc";
}

export type ResultRow = SupplierRow & { _rank?: RankEntry };

export function RankChange({ change }: { change: number | undefined | null }) {
  if (change === undefined || change === null || change === 0) return <span className="font-mono text-2xs text-tertiary">=</span>;
  return (
    <span
      className="inline-flex items-center font-mono text-2xs tabular-nums"
      style={{ color: change > 0 ? "var(--risk-low)" : "var(--risk-critical)" }}
      title={change > 0 ? `${change} places higher than under the default weights` : `${-change} places lower than under the default weights`}
    >
      {change > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(change)}
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
      <Th key={field} className={cn("whitespace-nowrap px-2", align === "right" && "text-right")} aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : undefined} title={title}>
        {ranked ? (
          label
        ) : (
          <button type="button" className={cn("inline-flex items-center gap-0.5 uppercase hover:text-ink", active && "text-ink")} onClick={() => onSort(field)}>
            {label}
            {active ? sort.order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <span className="w-3" />}
          </button>
        )}
      </Th>
    );
  };

  return (
    <Table className="text-sm">
      <THead sticky>
        <tr>
          <Th className="w-12 px-2 text-right">{ranked ? "Rank" : "#"}</Th>
          {header("supplier_name", "Supplier")}
          {header("total_risk_index", "TRI", "left", "Total Risk Index (0 = no risk, 100 = max)")}
          {ranked && (
            <Th className="px-2 text-right" title="Profile score, lower is better">
              Score
            </Th>
          )}
          {keyFields.map((f) => header(f, shortFieldLabel(meta, f), "left", `${fieldLabel(meta, f)}: ${meta.fields.find((x) => x.field === f)?.description ?? ""}`))}
          {header("delivery_rating", "Delivery", "right", "Delivery rating, higher is better")}
          {header("order_change_rate", "Changes", "right", "Order change rate, higher is worse")}
          {header("po_volume_eur", "Volume", "right", "Purchase order volume (exposure)")}
          {header("sourcing_risk_level", "Sourcing")}
          <Th className="w-28 px-2">
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((r, i) => {
          const isPinned = pinned.has(r.supplier_id);
          return (
            <Tr key={r.supplier_id} className={cn("cursor-pointer", selectedId === r.supplier_id && "bg-selected")} onClick={() => onOpen(r.supplier_id)}>
              <Td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-tertiary">
                {ranked ? (
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="text-ink">{r._rank?.rank ?? i + 1}</span>
                    <RankChange change={r._rank?.rank_change} />
                  </span>
                ) : (
                  offset + i + 1
                )}
              </Td>
              <Td className="px-2 py-2">
                <div className="whitespace-nowrap font-medium">{r.supplier_name ?? r.supplier_id}</div>
                <div className="font-mono text-2xs text-tertiary">{r.supplier_id}</div>
              </Td>
              <Td className="px-2 py-2">
                <LevelChip score={num(r.total_risk_index)} level={r.total_risk_index_level} />
              </Td>
              {ranked && <Td className="px-2 py-2 text-right font-mono tabular-nums">{fmtNum(num(r._rank?.profile_score), 1)}</Td>}
              {keyFields.map((f) => (
                <Td key={f} className="px-2 py-2">
                  <ScoreCell value={r[f]} level={r[`${f}_level`]} label={fieldLabel(meta, f)} />
                </Td>
              ))}
              <Td className="px-2 py-2 text-right font-mono tabular-nums">{fmtNum(num(r.delivery_rating), 1)}%</Td>
              <Td className="px-2 py-2 text-right font-mono tabular-nums">{fmtNum(num(r.order_change_rate), 1)}%</Td>
              <Td className="px-2 py-2 text-right font-mono tabular-nums">{fmtEur(num(r.po_volume_eur))}</Td>
              <Td className="px-2 py-2 text-subtext">{typeof r.sourcing_risk_level === "string" ? r.sourcing_risk_level : "–"}</Td>
              <Td className="px-2 py-2 text-right">
                <Button
                  size="sm"
                  variant={isPinned ? "subtle" : "secondary"}
                  disabled={isPinned || !canPin}
                  className={cn("h-7 px-2", isPinned && "disabled:opacity-100")}
                  title={isPinned ? "On the shortlist. Drop it on the shortlist board, with a reason." : canPin ? "Add to shortlist" : "Shortlist is full (20)"}
                  leading={isPinned ? <Check /> : <Plus />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(r.supplier_id);
                  }}
                >
                  {isPinned ? "Shortlisted" : "Shortlist"}
                </Button>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
