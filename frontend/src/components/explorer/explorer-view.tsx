"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCases } from "@/lib/cases/store";
import { ensureStage, pinToShortlist, requirementsTouched, setHardRequirements } from "@/lib/cases/actions";
import type { FilterCondition } from "@/lib/data-api/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { useCurrentCase, useMetadata, useProfiles } from "@/components/case/case-context";
import { profileKnockouts, scoreFields, type FilterResult, type RankResult, type SupplierRow } from "@/components/case/domain";
import { Empty, ErrorNote, MockBadge, Spinner, cx, ui } from "@/components/case/primitives";
import { CURRENT_USER, useCaseUi } from "@/components/case/ui-store";
import { FilterSidebar } from "./filter-sidebar";
import { KraljicMatrix } from "./kraljic-matrix";
import { ResultsTable, type ResultRow, type SortSpec } from "./results-table";

const PAGE = 25;
const RANK_LIMIT = 50;
const MAX_SHORTLIST = 20;

/** Long list: hard requirements (filter sidebar), results table with sort or profile ranking, Kraljic matrix. */
export function ExplorerView() {
  const c = useCurrentCase();
  const caseId = c?.id ?? "";
  const { meta } = useMetadata();
  const { profiles, loading: profilesLoading } = useProfiles();
  const profile = profiles.find((p) => p.profile_id === c?.profileId);
  const selected = useCaseUi((s) => s.selectedSupplier);
  const openSupplier = useCaseUi((s) => s.openSupplier);
  const [sort, setSort] = useState<SortSpec>({ field: "total_risk_index", order: "asc" });
  const [ranked, setRanked] = useState(false);
  const conditions: FilterCondition[] = useMemo(() => c?.hardRequirements ?? [], [c?.hardRequirements]);
  const condKey = JSON.stringify([conditions, sort]); // page resets when filters or sort change
  const [page, setPage] = useState<{ key: string; offset: number }>({ key: condKey, offset: 0 });
  const offset = page.key === condKey ? page.offset : 0;

  // The profile's knock-out rules preset the filters when the case has none yet.
  useEffect(() => {
    if (profilesLoading || !caseId) return;
    const cur = useCases.getState().cases[caseId];
    if (!cur || requirementsTouched(cur)) return;
    const preset = profileKnockouts(profile, cur.profileId);
    if (preset.length) setHardRequirements(caseId, preset, CURRENT_USER.name, `preset from ${cur.profileId} knock-outs`);
  }, [caseId, profilesLoading, profile]);

  // key scores: the active profile's heaviest risk scores
  const keyFields = useMemo(() => {
    const sf = scoreFields(meta).map((f) => f.field);
    const w = profile?.weights ?? {};
    const byWeight = sf.filter((f) => (w[f] ?? 0) > 0).sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0) || sf.indexOf(a) - sf.indexOf(b));
    const picked = byWeight.length ? byWeight : ["financial_health", "quality_risk", "compliance_risk", "operational_resilience"];
    return picked.slice(0, 4);
  }, [meta, profile]);

  const fields = useMemo(
    () => [
      "supplier_name",
      "total_risk_index",
      "total_risk_index_level",
      ...keyFields.flatMap((f) => [f, `${f}_level`]),
      "delivery_rating",
      "order_change_rate",
      "po_volume_eur",
      "sourcing_risk_level",
    ],
    [keyFields],
  );

  const count = useDataTool<FilterResult>("filter_suppliers", c ? { conditions, limit: 1, fields: ["supplier_id"] } : null);
  const list = useDataTool<FilterResult>("filter_suppliers", c && !ranked ? { conditions, sort_by: [sort], fields, limit: PAGE, offset } : null);
  const rank = useDataTool<RankResult>("rank_with_profile", c && ranked ? { conditions, profile_id: c.profileId, limit: RANK_LIMIT } : null);
  const rankIds = useMemo(() => (rank.data?.ranking ?? []).map((r) => r.supplier_id), [rank.data]);
  const rankRows = useDataTool<{ suppliers?: SupplierRow[] }>("get_suppliers", ranked && rankIds.length ? { ids: rankIds, fields } : null);

  const rows: ResultRow[] = useMemo(() => {
    if (!ranked) return (list.data?.suppliers ?? []).filter((r) => r && typeof r.supplier_id === "string");
    const byId = new Map((rankRows.data?.suppliers ?? []).map((r) => [r.supplier_id, r]));
    return (rank.data?.ranking ?? []).map((e) => ({ ...(byId.get(e.supplier_id) ?? { supplier_id: e.supplier_id, total_risk_index: e.total_risk_index }), _rank: e }));
  }, [ranked, list.data, rank.data, rankRows.data]);

  const total = typeof count.data?.total_matching === "number" ? count.data.total_matching : null;
  const names = useMemo(() => Object.fromEntries(rows.map((r) => [r.supplier_id, typeof r.supplier_name === "string" ? r.supplier_name : r.supplier_id])), [rows]);

  if (!c) return null;
  const pinned = new Set(c.shortlist);
  const canPin = c.shortlist.length < MAX_SHORTLIST;
  const active = ranked ? rank : list;
  const listTotal = ranked ? rows.length : total;

  return (
    <div className="flex h-full min-h-0">
      <FilterSidebar
        meta={meta}
        conditions={conditions}
        onChange={(next) => setHardRequirements(caseId, next, CURRENT_USER.name)}
        total={total}
        loading={count.loading}
        profileLabel={profile?.label ?? c.profileId}
        onApplyProfile={() => setHardRequirements(caseId, profileKnockouts(profile, c.profileId), CURRENT_USER.name, `${c.profileId} knock-outs`)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Long list</h2>
          <div className="ml-2 inline-flex rounded-md border border-zinc-300 p-0.5 text-[11px] dark:border-zinc-700" role="group" aria-label="Order">
            <button type="button" aria-pressed={!ranked} className={cx("rounded px-2 py-0.5", !ranked && "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900")} onClick={() => setRanked(false)}>
              Sort by column
            </button>
            <button
              type="button"
              aria-pressed={ranked}
              className={cx("rounded px-2 py-0.5", ranked && "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900")}
              onClick={() => setRanked(true)}
              title={profile?.description}
            >
              Rank by {profile?.label ?? c.profileId}
            </button>
          </div>
          {active.loading && <Spinner />}
          <MockBadge meta={active.meta} />
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className={ui.muted}>
              <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{c.shortlist.length}</span>/{MAX_SHORTLIST} shortlisted
            </span>
            <Link href={`/cases/${c.id}/shortlist`} className={ui.btnPrimary} onClick={() => c.shortlist.length && ensureStage(c.id, "shortlist", CURRENT_USER.name)}>
              Shortlist board →
            </Link>
          </div>
        </div>

        <ErrorNote error={count.error} what="filter_suppliers" />
        <ErrorNote error={active.error} what={ranked ? "rank_with_profile" : "filter_suppliers"} />

        <div className={cx(ui.panel, "overflow-x-auto", active.stale && "opacity-60 transition-opacity")}>
          {rows.length ? (
            <ResultsTable
              meta={meta}
              rows={rows}
              keyFields={keyFields}
              sort={sort}
              onSort={(field) => setSort((s) => (s.field === field ? { field, order: s.order === "asc" ? "desc" : "asc" } : { field, order: field === "delivery_rating" || field === "po_volume_eur" ? "desc" : "asc" }))}
              ranked={ranked}
              offset={offset}
              pinned={pinned}
              canPin={canPin}
              onPin={(id) => pinToShortlist(c.id, id, CURRENT_USER.name)}
              onOpen={(id) => openSupplier(id)}
              selectedId={selected}
            />
          ) : active.loading ? (
            <div className="flex items-center gap-2 p-6 text-xs">
              <Spinner /> Loading suppliers…
            </div>
          ) : (
            <div className="p-4">
              <Empty>No supplier meets these requirements. Loosen a rule in the sidebar.</Empty>
            </div>
          )}
          <div className={cx("flex items-center justify-between border-t px-3 py-1.5 text-[11px]", ui.border, ui.muted)}>
            {ranked ? (
              <span>
                Top {rows.length} by profile score (lower is better). ▲▼ = rank change vs default weights.
                {typeof (rank.data as { total_matching?: number } | null)?.total_matching === "number" ? ` Ranked among ${(rank.data as { total_matching: number }).total_matching.toLocaleString("en-US")}.` : ""}
              </span>
            ) : (
              <>
                <span>
                  {listTotal ? `${offset + 1}–${Math.min(offset + PAGE, listTotal)} of ${listTotal.toLocaleString("en-US")}` : "–"}
                </span>
                <span className="flex gap-1">
                  <button type="button" className={ui.btn} disabled={offset === 0} onClick={() => setPage({ key: condKey, offset: Math.max(0, offset - PAGE) })}>
                    ← Prev
                  </button>
                  <button type="button" className={ui.btn} disabled={!listTotal || offset + PAGE >= listTotal} onClick={() => setPage({ key: condKey, offset: offset + PAGE })}>
                    Next →
                  </button>
                </span>
              </>
            )}
          </div>
        </div>

        <KraljicMatrix ids={rows.map((r) => r.supplier_id)} names={names} pinned={pinned} onOpen={(id) => openSupplier(id)} />
      </div>
    </div>
  );
}
