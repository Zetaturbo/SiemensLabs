"use client";
import { Fragment, useMemo } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { Button, IconButton, Select, Tooltip } from "@/design-system/react";
import { advanceToFinalists, setProfile } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { cn } from "@/lib/utils";
import { MIN_PINNED } from "@/components/case/board-step";
import { weightedFields, type CompareResult, type Metadata, type Profile, type SupplierRow } from "@/components/case/domain";
import { CURRENT_USER } from "@/components/case/ui-store";
import { Dot, Num } from "@/components/ui-blocks/primitives";
import { formatValue, labelOf, num } from "@/components/ui-blocks/fields";
import type { ShortlistRanking } from "./ranking";

type Better = "lower" | "higher" | null;
interface Metric {
  field: string;
  label: string;
  better: Better;
}

/** Category fields compared by their order (lower is better). */
const CATEGORY_ORDER: Record<string, string[]> = {
  sourcing_risk_level: ["Low", "Medium", "High", "Critical"],
  supply_chain_complexity: ["Simple", "Moderate", "Complex"],
};

const PROFILE_ORDER = ["safety_critical", "strategic_system", "commodity", "lksg_due_diligence"];

function groups(meta: Metadata, profile: Profile | undefined): Array<{ title: string; metrics: Metric[] }> {
  const m = (field: string, better: Better, label = labelOf(field)): Metric => ({ field, label, better });
  return [
    {
      title: "Risk",
      metrics: [m("profile_score", "lower", "Profile score"), m("total_risk_index", "lower"), ...weightedFields(meta, profile, 4).map((f) => m(f, "lower"))],
    },
    { title: "Delivery", metrics: [m("delivery_rating", "higher"), m("order_confirmation_rate", "higher"), m("order_change_rate", "lower")] },
    { title: "Procurement", metrics: [m("po_volume_eur", null), m("sourcing_risk_level", "lower"), m("supply_chain_complexity", "lower", "Complexity")] },
  ];
}

function comparable(field: string, v: unknown): number | null {
  const order = CATEGORY_ORDER[field];
  if (order) {
    const i = typeof v === "string" ? order.indexOf(v) : -1;
    return i < 0 ? null : i;
  }
  return num(v);
}

/** The one best column of a row, direction-aware; null on a tie, for context rows, or with fewer than two values. */
function bestOf(metric: Metric, ids: string[], value: (id: string) => unknown): string | null {
  if (!metric.better) return null;
  const vals = ids.map((id) => ({ id, v: comparable(metric.field, value(id)) })).filter((x): x is { id: string; v: number } => x.v !== null);
  if (vals.length < 2) return null;
  const sorted = [...vals].sort((a, b) => (metric.better === "higher" ? b.v - a.v : a.v - b.v));
  return sorted[0].v === sorted[1].v ? null : sorted[0].id;
}

function display(field: string, v: unknown): string {
  if (field === "profile_score") return typeof v === "number" ? v.toFixed(2) : "–";
  return formatValue(field, v);
}

/**
 * The board's right pane, "Shortlist": the pinned suppliers as a comparison grid in the minimal CompareGrid style
 * (dimensions as rows grouped risk, delivery, procurement; suppliers as columns; a dot marks the best value per row,
 * lower or higher is better per metric). The profile selector re-ranks the columns (and sets the case's profile, so
 * the chat ranks the same way). With three or more pinned each column can advance to the finalists; finalists get
 * a Research action, which opens the case chat with the question (the existing research flow).
 */
export function ShortlistPane({
  c,
  meta,
  profiles,
  ranking,
  onResearch,
}: {
  c: SourcingCase;
  meta: Metadata;
  profiles: Profile[];
  ranking: ShortlistRanking;
  onResearch: (id: string, name: string) => void;
}) {
  const profile = profiles.find((p) => p.profile_id === c.profileId);
  const sortedIds = useMemo(() => [...c.shortlist].sort(), [c.shortlist]);
  const compare = useDataTool<CompareResult>("compare_suppliers", sortedIds.length ? { ids: sortedIds, profile_id: c.profileId } : null);
  const rowById = useMemo(() => new Map<string, SupplierRow>((compare.data?.suppliers ?? []).map((r) => [r.supplier_id, r])), [compare.data]);
  const unpin = useCases((s) => s.unpin);

  const late = c.stage === "finalists" || c.stage === "awarded";
  // Columns in profile rank; once finalists are chosen they lead.
  const ids = late ? [...ranking.order.filter((id) => c.finalists.includes(id)), ...ranking.order.filter((id) => !c.finalists.includes(id))] : ranking.order;
  const rankNo = (id: string) => ranking.byId.get(id)?.rank;
  const value = (id: string, field: string) => (field === "profile_score" ? (ranking.byId.get(id)?.profile_score ?? rowById.get(id)?.profile_score) : rowById.get(id)?.[field]);
  const nameOf = (id: string) => {
    const n = rowById.get(id)?.supplier_name;
    return typeof n === "string" && n ? n : id;
  };
  const canAdvance = c.shortlist.length >= MIN_PINNED && c.stage !== "awarded";

  const options = [...profiles]
    .filter((p) => PROFILE_ORDER.includes(p.profile_id) || p.profile_id === c.profileId)
    .sort((a, b) => PROFILE_ORDER.indexOf(a.profile_id) - PROFILE_ORDER.indexOf(b.profile_id))
    .map((p) => ({ value: p.profile_id, label: p.label }));

  return (
    <section aria-label="Shortlist" data-board-shortlist className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-base font-semibold text-ink">Shortlist</h2>
          <span className="text-sm text-subtext">
            <Num className="text-ink">{c.shortlist.length}</Num> pinned
          </span>
        </div>
        <Select size="sm" aria-label="Weight profile" options={options} value={c.profileId} onValueChange={(p) => setProfile(c.id, p, CURRENT_USER.name)} className="max-w-[16rem] font-normal" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-5">
        {ids.length === 0 ? (
          <p className="px-5 pt-3 text-sm text-subtext">Pin suppliers from the candidates to compare them here.</p>
        ) : (
          <table data-compare className={cn("w-full min-w-max border-collapse text-sm", (compare.stale || ranking.loading) && "opacity-70 transition-opacity")}>
            <thead>
              <tr className="border-b border-subtle">
                <th scope="col" className="sticky left-0 z-10 bg-surface py-2 pl-5 pr-3 text-left align-bottom font-medium text-subtext">
                  <span className="sr-only">Dimension</span>
                </th>
                {ids.map((id) => {
                  const finalist = c.finalists.includes(id);
                  const awarded = c.awardedSupplier === id;
                  return (
                    <th key={id} scope="col" data-column={id} className="group w-[7.5rem] max-w-[7.5rem] px-2.5 py-2 text-right align-bottom font-normal">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="flex items-center gap-1">
                          {!finalist && (
                            <Tooltip label="Unpin" side="top" className="text-sm">
                              <IconButton
                                aria-label={`Unpin ${nameOf(id)}`}
                                size="sm"
                                variant="ghost"
                                className="size-6 text-tertiary opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                                onClick={() => unpin(c.id, id, CURRENT_USER.name)}
                              >
                                <X />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Num className="text-tertiary">{rankNo(id) ? `#${rankNo(id)}` : ""}</Num>
                        </span>
                        <span className="block max-w-[6.5rem] truncate font-medium text-ink" title={nameOf(id)}>
                          {nameOf(id)}
                        </span>
                        <Num className="text-tertiary">{id}</Num>
                        <span className="mt-1.5 flex h-8 items-center">
                          {awarded ? (
                            <span className="inline-flex items-center gap-1.5 text-ink">
                              <Dot fill="var(--risk-low)" /> Awarded
                            </span>
                          ) : finalist ? (
                            c.stage === "finalists" ? (
                              <Button size="sm" variant="secondary" leading={<Search />} onClick={() => onResearch(id, nameOf(id))} title={`Research ${nameOf(id)} in public records (opens the case chat)`}>
                                Research
                              </Button>
                            ) : (
                              <span className="text-subtext">Finalist</span>
                            )
                          ) : canAdvance ? (
                            <Button size="sm" variant="ghost" trailing={<ArrowRight />} onClick={() => advanceToFinalists(c.id, id, CURRENT_USER.name)} title="Advance to finalists">
                              Advance
                            </Button>
                          ) : null}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {groups(meta, profile).map((g) => (
              <Fragment key={g.title}>
                <tbody>
                  <tr>
                    <th scope="rowgroup" colSpan={ids.length + 1} className="sticky left-0 bg-surface pb-1 pl-5 pt-4 text-left font-medium text-tertiary">
                      {g.title}
                    </th>
                  </tr>
                  {g.metrics.map((metric) => {
                    const best = bestOf(metric, ids, (id) => value(id, metric.field));
                    return (
                      <tr key={metric.field} className="group transition-colors hover:bg-hover">
                        <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 text-left font-normal text-subtext group-hover:bg-surface-hover">
                          {metric.label}
                          {metric.better && (
                            <span className="ml-1.5 text-tertiary" title={metric.better === "lower" ? "Lower is better" : "Higher is better"} aria-label={metric.better === "lower" ? "lower is better" : "higher is better"}>
                              {metric.better === "lower" ? "↓" : "↑"}
                            </span>
                          )}
                        </th>
                        {ids.map((id) => {
                          const isBest = best === id;
                          return (
                            <td key={id} className="whitespace-nowrap px-2.5 py-2 text-right">
                              <span className="inline-flex items-center justify-end gap-2">
                                {isBest && <Dot fill="var(--risk-low)" label="Best" />}
                                <Num className={cn("text-ink", isBest && "font-semibold")}>{display(metric.field, value(id, metric.field))}</Num>
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </Fragment>
            ))}
          </table>
        )}
      </div>
    </section>
  );
}
