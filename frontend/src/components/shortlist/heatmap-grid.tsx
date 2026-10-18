"use client";
import { ArrowRight, Trash2 } from "lucide-react";
import { Checkbox, IconButton, Tooltip } from "@/design-system/react";
import { cn } from "@/lib/utils";
import { fieldLabel, fmtEur, fmtNum, num, type Metadata, type PerField, type RankEntry, type SupplierRow } from "@/components/case/domain";
import { LevelChip, ScoreCell } from "@/components/case/primitives";
import { RankChange } from "@/components/explorer/results-table";

export interface HeatmapColumn {
  id: string;
  row: SupplierRow | null;
  rank: RankEntry | null;
  finalist: boolean;
}

const OPS_FMT: Record<string, (v: number | null) => string> = {
  delivery_rating: (v) => `${fmtNum(v, 1)}%`,
  order_confirmation_rate: (v) => `${fmtNum(v, 1)}%`,
  order_change_rate: (v) => `${fmtNum(v, 1)}%`,
  po_volume_eur: (v) => fmtEur(v),
};

/** Suppliers as columns, dimensions as rows, cells filled by risk level; best/worst outlined from per_field. */
export function HeatmapGrid({
  meta,
  fields,
  columns,
  perField,
  radarIds,
  onToggleRadar,
  onOpen,
  onAdvance,
  onDrop,
}: {
  meta: Metadata;
  fields: string[];
  columns: HeatmapColumn[];
  perField: Map<string, PerField>;
  radarIds: string[];
  onToggleRadar: (id: string) => void;
  onOpen: (id: string) => void;
  onAdvance: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="sticky left-0 z-20 min-w-44 border-b border-subtle bg-surface px-3 py-2 text-left align-bottom text-xs font-medium uppercase tracking-wide text-tertiary">Dimension</th>
            {columns.map((col) => {
              const name = typeof col.row?.supplier_name === "string" ? col.row.supplier_name : col.id;
              const onRadar = radarIds.includes(col.id);
              return (
                <th key={col.id} className="min-w-28 max-w-36 border-b border-l border-subtle px-2 py-2 text-left align-top font-normal">
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-ink">
                      {col.rank ? `#${col.rank.rank}` : "–"}
                      {col.rank && <RankChange change={col.rank.rank_change} />}
                    </span>
                    <Tooltip label={onRadar ? "Remove from radar" : radarIds.length >= 3 ? "Radar shows up to 3" : "Show on radar"} side="bottom">
                      <Checkbox size="sm" checked={onRadar} disabled={!onRadar && radarIds.length >= 3} onCheckedChange={() => onToggleRadar(col.id)} aria-label={`Radar ${name}`} />
                    </Tooltip>
                  </div>
                  <button type="button" className="mt-1 block w-full truncate text-left text-sm font-medium text-ink hover:underline" title={name} onClick={() => onOpen(col.id)}>
                    {name}
                  </button>
                  <div className="font-mono text-2xs text-tertiary">{col.id}</div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <LevelChip score={num(col.row?.total_risk_index)} level={col.row?.total_risk_index_level} />
                    <span className="flex">
                      <Tooltip label={col.finalist ? "Already a finalist" : "Advance to finalists"} side="bottom">
                        <IconButton aria-label="Advance to finalists" size="sm" disabled={col.finalist} onClick={() => onAdvance(col.id)}>
                          <ArrowRight />
                        </IconButton>
                      </Tooltip>
                      <Tooltip label="Drop with reason" side="bottom">
                        <IconButton aria-label="Drop with reason" size="sm" onClick={() => onDrop(col.id)}>
                          <Trash2 />
                        </IconButton>
                      </Tooltip>
                    </span>
                  </div>
                  {col.finalist && <div className="mt-1 text-2xs font-medium text-subtext">Finalist</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const pf = perField.get(f);
            const isOps = f in OPS_FMT;
            return (
              <tr key={f} className="group">
                <th scope="row" className="sticky left-0 z-[5] border-b border-subtle bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-surface-hover">
                  <div className="text-sm text-ink">{fieldLabel(meta, f)}</div>
                  {pf && typeof pf.spread === "number" && (
                    <div className="font-mono text-2xs text-tertiary" title="max - min across the shortlist">
                      spread {isOps && f === "po_volume_eur" ? fmtEur(pf.spread) : fmtNum(pf.spread, 1)}
                    </div>
                  )}
                </th>
                {columns.map((col) => {
                  const v = col.row?.[f];
                  const emphasis = pf?.best === col.id ? "best" : pf?.worst === col.id ? "worst" : undefined;
                  return (
                    <td key={col.id} className="border-b border-l border-subtle px-2 py-1.5 text-center group-hover:bg-surface-hover">
                      {isOps ? (
                        <span
                          className={cn(
                            "inline-flex min-w-[3.5rem] justify-center rounded-md px-1 py-0.5 font-mono text-xs tabular-nums",
                            emphasis === "best" && "ring-1 ring-inset ring-[var(--risk-low)]",
                            emphasis === "worst" && "ring-1 ring-inset ring-[var(--risk-critical)]",
                          )}
                          title={emphasis ? `${emphasis} in comparison` : undefined}
                        >
                          {OPS_FMT[f](num(v))}
                        </span>
                      ) : (
                        <ScoreCell value={v} level={col.row?.[`${f}_level`]} label={fieldLabel(meta, f)} emphasis={emphasis} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
