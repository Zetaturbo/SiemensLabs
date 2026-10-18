"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button, SearchInput, Skeleton } from "@/design-system/react";
import { setHardRequirements } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import type { FilterCondition } from "@/lib/data-api/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { useSupplierSearch } from "@/lib/hooks/use-supplier-search";
import { cn } from "@/lib/utils";
import { profileKnockouts, shortFieldLabel, weightedFields, type FilterResult, type Metadata, type Profile, type SupplierRow } from "@/components/case/domain";
import { FilterChips } from "@/components/case/filter-chips";
import { CURRENT_USER } from "@/components/case/ui-store";
import { Dot, LEVEL_STYLE, Num, PinButton } from "@/components/ui-blocks/primitives";
import { asLevel, formatValue, labelOf, num } from "@/components/ui-blocks/fields";
import { FilterPopover } from "./filter-popover";
import { KraljicMatrix } from "./kraljic-matrix";

const PAGE = 25;
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

function ScoreCell({ row, field }: { row: SupplierRow; field: string }) {
  const v = num(row[field]);
  if (v === null) return <span className="text-tertiary">–</span>;
  const level = asLevel(row[`${field}_level`]);
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {level && <Dot fill={LEVEL_STYLE[level].fill} label={level} />}
      <Num className="text-ink">{formatValue(field, v)}</Num>
    </span>
  );
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
    <section aria-label="Candidates" data-board-candidates className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Candidates</h2>
          <span className="text-sm text-subtext" aria-live="polite" data-matching-count>
            <Num className="text-ink">{total === null ? "–" : total.toLocaleString("en-US")}</Num> {search.active ? "found" : "matching"}
          </span>
        </div>
        <FilterChips c={c} layout="inline">
          <FilterPopover
            meta={meta}
            conditions={conditions}
            onChange={(next) => write(next)}
            onProfileKnockouts={() => write(profileKnockouts(profile, c.profileId), `${c.profileId} knock-outs`)}
          />
        </FilterChips>
        <SearchInput inputSize="sm" placeholder="Search name or id" aria-label="Search suppliers by name or id" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        {rows.length > 0 ? (
          <table className={cn("w-full table-fixed border-collapse text-sm", stale && "opacity-60 transition-opacity")}>
            <colgroup>
              <col />
              <col className="w-[3.5rem]" />
              {weighted.map((f) => (
                <col key={f} className="w-[4.5rem]" />
              ))}
              <col className="w-8" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-subtle">
                <th scope="col" className="py-2 pr-2 text-left font-medium text-subtext">
                  Supplier
                </th>
                <th scope="col" className="px-1.5 py-2 text-right font-medium text-subtext" title="Total Risk Index, 0 = no risk, 100 = max; lower is better">
                  TRI
                </th>
                {weighted.map((f) => (
                  <th key={f} scope="col" className="truncate pl-1.5 pr-1 py-2 text-right font-medium text-subtext" title={`${labelOf(f)}, weighted by the profile; lower is better`}>
                    {shortFieldLabel(meta, f)}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Pin</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplier_id} data-candidate={r.supplier_id} className={cn("group transition-colors hover:bg-hover", pinned.has(r.supplier_id) && "bg-sunken/60")}>
                  <td className="min-w-0 py-2 pr-2">
                    <div className="truncate text-ink" title={typeof r.supplier_name === "string" ? r.supplier_name : undefined}>
                      {r.supplier_name ?? r.supplier_id}
                    </div>
                    <Num className="text-sm text-tertiary">{r.supplier_id}</Num>
                  </td>
                  <td className="px-1.5 py-2 text-right">
                    <ScoreCell row={r} field="total_risk_index" />
                  </td>
                  {weighted.map((f) => (
                    <td key={f} className="pl-1.5 pr-1 py-2 text-right">
                      <Num className="text-ink">{formatValue(f, r[f])}</Num>
                    </td>
                  ))}
                  <td className="py-2 text-right">
                    <PinButton supplierId={r.supplier_id} reveal />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : loading ? (
          <div className="flex flex-col gap-2 pt-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <p className="pt-3 text-sm text-subtext">{empty}</p>
        )}

        {canMore && (
          <Button size="sm" variant="ghost" className="mt-2 text-subtext" onClick={() => setMore({ key: pageKey, n: shown + PAGE })}>
            Show more
          </Button>
        )}

        <div className="mt-4 border-t border-subtle pt-3">
          <button
            type="button"
            aria-expanded={portfolio}
            onClick={() => setPortfolio((o) => !o)}
            className="flex items-center gap-1.5 rounded-md text-sm font-medium text-ink outline-none hover:text-subtext focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
          >
            <ChevronRight className={cn("size-4 text-tertiary transition-transform", portfolio && "rotate-90")} />
            Portfolio view
          </button>
          {portfolio && (
            <div className="mt-3">
              <KraljicMatrix ids={rows.map((r) => r.supplier_id)} names={names} pinned={pinned} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
