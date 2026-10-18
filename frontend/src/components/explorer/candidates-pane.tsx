"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button, SearchInput, Skeleton } from "@/design-system/react";
import { pinToShortlist, setHardRequirements } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import type { FilterCondition } from "@/lib/data-api/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { useSupplierSearch } from "@/lib/hooks/use-supplier-search";
import { cn } from "@/lib/utils";
import { profileKnockouts, shortFieldLabel, weightedFields, type FilterResult, type Metadata, type Profile, type SupplierRow } from "@/components/case/domain";
import { CURRENT_USER } from "@/components/case/ui-store";
import { Num } from "@/components/ui-blocks/primitives";
import { asLevel, formatValue, labelOf, num } from "@/components/ui-blocks/fields";
import { BOARD_PAGE, BodyRow, Cell, HeadCell, LevelScore, NameCell, PinToggle, ShowMore, boardHeadClass, boardTableClass } from "./board-table";
import { BoardFilterChips } from "./filter-chips";
import { FilterPopover } from "./filter-popover";
import { KraljicMatrix } from "./kraljic-matrix";

const PAGE = BOARD_PAGE;
/** The store caps a shortlist at 20. */
const MAX_PINNED = 20;
/** The data tools return at most 500 rows per call. */
const MAX_ROWS = 500;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The board's left pane, "Candidates": the case's filters as chips with an "Edit filters" popover, a search by name
 * or id, the matching suppliers (lowest Total Risk Index first) with the profile's two heaviest scores and a pin per
 * row, "show more" paging, and the portfolio view (Kraljic matrix) folded away under the table. Filters and pins
 * write to the case store, so the chat's chips and the shortlist follow.
 */
export function CandidatesPane({ c, meta, profile }: { c: SourcingCase; meta: Metadata; profile: Profile | undefined }) {
  const conditions = c.hardRequirements as FilterCondition[];
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 250);
  const [portfolio, setPortfolio] = useState(false);
  const weighted = useMemo(() => weightedFields(meta, profile, 2), [meta, profile]);
  const fields = useMemo(
    () => ["supplier_id", "supplier_name", "total_risk_index", "total_risk_index_level", ...weighted.flatMap((f) => [f, `${f}_level`])],
    [weighted],
  );
  const pageKey = JSON.stringify([conditions, q]); // "show more" starts over when the filters or the search change
  const [more, setMore] = useState<{ key: string; n: number }>({ key: pageKey, n: PAGE });
  const shown = more.key === pageKey ? more.n : PAGE;

  const count = useDataTool<FilterResult>("filter_suppliers", { conditions, limit: 1, fields: ["supplier_id"] });
  const search = useSupplierSearch(q, conditions);
  const list = useDataTool<FilterResult>(
    "filter_suppliers",
    search.active ? null : { conditions, sort_by: [{ field: "total_risk_index", order: "asc" }], fields, limit: Math.min(shown, MAX_ROWS), offset: 0 },
  );
  const hitIds = useMemo(() => (search.ids ?? []).slice(0, shown), [search.ids, shown]);
  const hits = useDataTool<{ suppliers?: SupplierRow[] }>("get_suppliers", search.active && hitIds.length ? { ids: hitIds, fields } : null);

  const rows: SupplierRow[] = useMemo(() => {
    if (!search.active) return (list.data?.suppliers ?? []).filter((r) => r && typeof r.supplier_id === "string");
    const byId = new Map((hits.data?.suppliers ?? []).map((r) => [r.supplier_id, r]));
    return hitIds.map((id) => byId.get(id)).filter((r): r is SupplierRow => !!r);
  }, [search.active, list.data, hits.data, hitIds]);

  const total = search.active ? (search.ids?.length ?? null) : typeof count.data?.total_matching === "number" ? count.data.total_matching : null;
  const loading = search.active ? search.loading || hits.loading : list.loading;
  const stale = search.active ? hits.stale : list.stale;
  const canMore = total !== null && rows.length < Math.min(total, MAX_ROWS) && rows.length >= Math.min(shown, MAX_ROWS);
  const pinned = useMemo(() => new Set(c.shortlist), [c.shortlist]);
  const full = c.shortlist.length >= MAX_PINNED;
  const unpin = useCases((s) => s.unpin);
  const names = useMemo(() => Object.fromEntries(rows.map((r) => [r.supplier_id, typeof r.supplier_name === "string" ? r.supplier_name : r.supplier_id])), [rows]);
  const write = (next: FilterCondition[], note?: string) => setHardRequirements(c.id, next, CURRENT_USER.name, note);

  const empty = search.active
    ? search.byId
      ? `No supplier ${search.ids?.[0]} in the data.`
      : search.error
        ? "The search could not run; try again."
        : `No matching supplier is named like “${q.trim()}”.`
    : "No supplier meets these filters; remove one to widen the pool.";

  return (
    <section aria-label="Candidates" data-board-candidates className="@container flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-4 pb-4 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Candidates</h2>
          <span className="text-sm text-subtext" aria-live="polite" data-matching-count>
            <Num className="text-ink">{total === null ? "–" : total.toLocaleString("en-US")}</Num> {search.active ? "found" : "matching"}
          </span>
        </div>
        <BoardFilterChips c={c}>
          <FilterPopover
            meta={meta}
            conditions={conditions}
            onChange={(next) => write(next)}
            onProfileKnockouts={() => write(profileKnockouts(profile, c.profileId), `${c.profileId} knock-outs`)}
          />
        </BoardFilterChips>
        <SearchInput inputSize="sm" placeholder="Search name or id" aria-label="Search suppliers by name or id" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-subtle pb-4">
        {rows.length > 0 ? (
          <table className={cn(boardTableClass, stale && "opacity-60 transition-opacity")}>
            <colgroup>
              <col />
              <col className="w-[8.5rem]" />
              {weighted.map((f, i) => (
                <col key={f} className={cn("w-[5.5rem]", i > 0 && "@max-[33rem]:hidden")} />
              ))}
              <col className="w-[3.25rem]" />
            </colgroup>
            <thead className={boardHeadClass}>
              <tr>
                <HeadCell>Supplier</HeadCell>
                <HeadCell align="right" hint="Total Risk Index, 0 = no risk, 100 = max; lower is better">
                  Total risk
                </HeadCell>
                {weighted.map((f, i) => (
                  <HeadCell key={f} align="right" hint={`${labelOf(f)}, weighted by the profile; lower is better`} className={cn(i > 0 && "@max-[33rem]:hidden")}>
                    {shortFieldLabel(meta, f)}
                  </HeadCell>
                ))}
                <HeadCell align="right">
                  <span className="sr-only">Pin</span>
                </HeadCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = typeof r.supplier_name === "string" && r.supplier_name ? r.supplier_name : r.supplier_id;
                const on = pinned.has(r.supplier_id);
                return (
                  <BodyRow key={r.supplier_id} data-candidate={r.supplier_id} marked={on}>
                    <Cell>
                      <NameCell name={name} sub={<Num>{r.supplier_id}</Num>} />
                    </Cell>
                    <Cell align="right">
                      <LevelScore value={num(r.total_risk_index)} level={asLevel(r.total_risk_index_level)} />
                    </Cell>
                    {weighted.map((f, i) => (
                      <Cell key={f} align="right" className={cn(i > 0 && "@max-[33rem]:hidden")}>
                        <Num className="text-ink">{formatValue(f, r[f])}</Num>
                      </Cell>
                    ))}
                    <Cell align="right">
                      <PinToggle
                        on={on}
                        label={on ? `Unpin ${name}` : `Pin ${name} to the shortlist`}
                        disabled={!on && full}
                        reason={`The shortlist is full (${MAX_PINNED}); unpin one first`}
                        onToggle={() => (on ? unpin(c.id, r.supplier_id, CURRENT_USER.name) : pinToShortlist(c.id, r.supplier_id, CURRENT_USER.name))}
                      />
                    </Cell>
                  </BodyRow>
                );
              })}
            </tbody>
          </table>
        ) : loading ? (
          <div className="flex flex-col gap-2 px-4 pt-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <p className="px-4 pt-4 text-sm text-subtext">{empty}</p>
        )}

        <div className="flex flex-col items-start gap-3 px-4">
          {canMore && <ShowMore count={PAGE} onClick={() => setMore({ key: pageKey, n: shown + PAGE })} />}
          <div className="w-full border-t border-subtle pt-3">
            <Button size="sm" variant="ghost" aria-expanded={portfolio} onClick={() => setPortfolio((o) => !o)} leading={<ChevronRight className={cn("transition-transform", portfolio && "rotate-90")} />} className="-ml-2">
              Portfolio view
            </Button>
            {portfolio && (
              <div className="mt-3">
                <KraljicMatrix ids={rows.map((r) => r.supplier_id)} names={names} pinned={pinned} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
