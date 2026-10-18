"use client";
import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Tooltip } from "@/design-system/react";
import { cn } from "@/lib/utils";
import { PinToggle } from "@/components/explorer/board-table";
import { Dot, Num } from "@/components/ui-blocks/primitives";

export type Better = "lower" | "higher" | null;

export interface CompareMetric {
  key: string;
  label: string;
  better: Better;
}

export interface CompareGroup {
  title: string;
  metrics: CompareMetric[];
}

export interface CompareColumn {
  id: string;
  name: string;
  /** Quiet second line under the name (id, country). */
  sub?: ReactNode;
  /** Rank or similar, top right of the header. */
  rank?: string;
  /** The column's pin: filled while the supplier is on the list; click removes it unless `locked` says why not. */
  pin?: { label: string; onToggle: () => void; locked?: string };
  /** One action under the name (Advance, Research, a status). */
  action?: ReactNode;
}

/**
 * The comparison grid on the Suppliers page (the board's shortlist and the real brake manufacturers): suppliers as
 * columns with a proper header row (name, id, pin state, one action), dimensions as rows grouped (risk, delivery,
 * procurement), each row saying whether lower or higher is better. The best value per row gets a dot in a fixed slot
 * right of the number, so the dots line up down a column; numbers right aligned in Geist Mono. The label column and the header stay put
 * while the pane scrolls; an empty last column takes the spare width, so rules and row hover span the pane.
 */
export function CompareTable({
  columns,
  groups,
  cell,
  best,
  stale,
  ariaLabel,
}: {
  columns: CompareColumn[];
  groups: CompareGroup[];
  /** The rendered value of one metric for one column; a string is set in Geist Mono. */
  cell: (metric: CompareMetric, id: string) => ReactNode;
  /** Ids holding the best value of a row (empty when there is no direction or a tie on a single value). */
  best: (metric: CompareMetric) => ReadonlySet<string>;
  stale?: boolean;
  ariaLabel: string;
}) {
  return (
    <table data-compare aria-label={ariaLabel} className={cn("w-full min-w-max border-separate border-spacing-0 text-sm", stale && "opacity-70 transition-opacity")}>
      <thead>
        <tr>
          <th scope="col" className="sticky left-0 top-0 z-20 w-[11rem] min-w-[11rem] border-b border-subtle bg-surface pl-4 pr-3 text-left align-bottom">
            <span className="sr-only">Dimension</span>
          </th>
          {columns.map((col) => (
            <th key={col.id} scope="col" data-column={col.id} className="sticky top-0 z-10 w-[8rem] min-w-[8rem] max-w-[8rem] border-b border-subtle bg-surface px-3 pb-3 pt-2 text-right align-bottom font-normal">
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex h-7 w-full items-center justify-between gap-1">
                  <Num className="text-sm text-tertiary">{col.rank ?? ""}</Num>
                  {col.pin && <PinToggle on onToggle={col.pin.onToggle} label={col.pin.label} disabled={Boolean(col.pin.locked)} reason={col.pin.locked} />}
                </div>
                <div className="flex w-full justify-end [&>span]:max-w-full">
                  <Tooltip label={col.name} side="top" className="text-sm font-normal">
                    <span className="min-w-0 truncate font-medium text-ink">{col.name}</span>
                  </Tooltip>
                </div>
                {col.sub && <span className="max-w-full truncate text-sm text-tertiary">{col.sub}</span>}
                {col.action !== undefined && <div className="mt-2 flex h-8 items-center justify-end">{col.action}</div>}
              </div>
            </th>
          ))}
          <th aria-hidden className="sticky top-0 z-10 border-b border-subtle bg-surface" />
        </tr>
      </thead>
      {groups.map((g) => (
        <Fragment key={g.title}>
          <tbody>
            <tr>
              <th scope="rowgroup" className="sticky left-0 z-[5] bg-surface pb-1 pl-4 pr-3 pt-4 text-left text-sm font-medium text-ink">
                {g.title}
              </th>
              <td colSpan={columns.length + 1} className="bg-surface" />
            </tr>
            {g.metrics.map((metric) => {
              const winners = best(metric);
              return (
                <tr key={metric.key} className="group">
                  <th scope="row" className="sticky left-0 z-[5] h-9 whitespace-nowrap bg-surface pl-4 pr-3 text-left font-normal text-subtext transition-colors group-hover:bg-surface-hover">
                    <span className="inline-flex items-center gap-1.5">
                      {metric.label}
                      {metric.better && <Direction better={metric.better} />}
                    </span>
                  </th>
                  {columns.map((col) => {
                    const isBest = winners.has(col.id);
                    const v = cell(metric, col.id);
                    return (
                      <td key={col.id} className="h-9 whitespace-nowrap px-3 transition-colors group-hover:bg-surface-hover">
                        <span className="grid grid-cols-[minmax(0,1fr)_0.5rem] items-center gap-2">
                          <span className={cn("text-right text-ink", isBest && "font-semibold")}>{typeof v === "string" ? <Num>{v}</Num> : v}</span>
                          <span className="flex">{isBest && <Dot fill="var(--risk-low)" label="Best value" />}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td aria-hidden className="transition-colors group-hover:bg-surface-hover" />
                </tr>
              );
            })}
          </tbody>
        </Fragment>
      ))}
    </table>
  );
}

function Direction({ better }: { better: "lower" | "higher" }) {
  const text = better === "lower" ? "Lower is better" : "Higher is better";
  return (
    <Tooltip label={text} side="right" className="text-sm font-normal">
      <span tabIndex={0} aria-label={text} className="flex cursor-help rounded-sm text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]">
        {better === "lower" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
      </span>
    </Tooltip>
  );
}
