"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Card, SegmentedControl, buttonVariants } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import { ensureStage, pinToShortlist, requirementsTouched, setHardRequirements } from "@/lib/cases/actions";
import type { FilterCondition } from "@/lib/data-api/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { cn } from "@/lib/utils";
import { useCurrentCase, useMetadata, useProfiles } from "@/components/case/case-context";
import { profileKnockouts, scoreFields, type FilterResult, type RankResult, type SupplierRow } from "@/components/case/domain";
import { Empty, ErrorNote, MockBadge, Spinner } from "@/components/case/primitives";
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
  const [mode, setMode] = useState<"sort" | "rank">("sort");
  const ranked = mode === "rank";
  const conditions = useMemo(() => (c?.hardRequirements ?? []) as FilterCondition[], [c?.hardRequirements]);
  const pageKey = JSON.stringify([conditions, sort]); // page resets when filters or sort change
  const [page, setPage] = useState<{ key: string; offset: number }>({ key: pageKey, offset: 0 });
  const offset = page.key === pageKey ? page.offset : 0;

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
    return (byWeight.length ? byWeight : ["financial_health", "quality_risk", "compliance_risk", "operational_resilience"]).slice(0, 4);
  }, [meta, profile]);

  const fields = useMemo(
    () => ["supplier_name", "total_risk_index", "total_risk_index_level", ...keyFields.flatMap((f) => [f, `${f}_level`]), "delivery_rating", "order_change_rate", "po_volume_eur", "sourcing_risk_level"],
    [keyFields],
  );

  const count = useDataTool<FilterResult>("filter_suppliers", c ? { conditions, limit: 1, fields: ["supplier_id"] } : null);
  const list = useDataTool<FilterResult>("filter_suppliers", c && !ranked ? { conditions, sort_by: [sort], fields, limit: PAGE, offset } : null);
  const rank = useDataTool<RankResult & { total_matching?: number }>("rank_with_profile", c && ranked ? { conditions, profile_id: c.profileId, limit: RANK_LIMIT } : null);
  const rankIds = useMemo(() => (rank.data?.ranking ?? []).map((r) => r.supplier_id), [rank.data]);
  const rankRows = useDataTool<{ suppliers?: SupplierRow[] }>("get_suppliers", ranked && rankIds.length ? { ids: rankIds, fields } : null);

  const rows: ResultRow[] = useMemo(() => {
    if (!ranked) return (list.data?.suppliers ?? []).filter((r) => r && typeof r.supplier_id === "string");
    const byId = new Map((rankRows.data?.suppliers ?? []).map((r) => [r.supplier_id, r]));
    return (rank.data?.ranking ?? []).map((e) => ({ ...(byId.get(e.supplier_id) ?? { supplier_id: e.supplier_id, supplier_name: (e as { supplier_name?: string }).supplier_name, total_risk_index: e.total_risk_index }), _rank: e }));
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
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Long list</h2>
          <SegmentedControl
            size="sm"
            aria-label="Order"
            value={mode}
            onValueChange={setMode}
            items={[
              { value: "sort", label: "Sort by column" },
              { value: "rank", label: `Rank by ${profile?.label ?? c.profileId}` },
            ]}
          />
          {active.loading && <Spinner />}
          <MockBadge meta={active.meta} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-subtext">
              <span className="font-mono font-medium tabular-nums text-ink">{c.shortlist.length}</span>
              <span className="font-mono tabular-nums">/{MAX_SHORTLIST}</span> shortlisted
            </span>
            <Link
              href={`/cases/${c.id}/shortlist`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
              onClick={() => c.shortlist.length && ensureStage(c.id, "shortlist", CURRENT_USER.name)}
            >
              Shortlist board <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <ErrorNote error={count.error} what="filter_suppliers" />
        <ErrorNote error={active.error} what={ranked ? "rank_with_profile" : "filter_suppliers"} />

        <Card className={cn("overflow-hidden", active.stale && "opacity-60 transition-opacity")}>
          <div className="overflow-x-auto">
            {rows.length ? (
              <ResultsTable
                meta={meta}
                rows={rows}
                keyFields={keyFields}
                sort={sort}
                onSort={(field) =>
                  setSort((s) => (s.field === field ? { field, order: s.order === "asc" ? "desc" : "asc" } : { field, order: field === "delivery_rating" || field === "po_volume_eur" ? "desc" : "asc" }))
                }
                ranked={ranked}
                offset={offset}
                pinned={pinned}
                canPin={canPin}
                onPin={(id) => pinToShortlist(c.id, id, CURRENT_USER.name)}
                onOpen={(id) => openSupplier(id)}
                selectedId={selected}
              />
            ) : active.loading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-subtext">
                <Spinner /> Loading suppliers
              </div>
            ) : (
              <div className="p-4">
                <Empty>No supplier meets these requirements. Loosen a rule in the sidebar.</Empty>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-subtle px-3 py-2 text-xs text-subtext">
            {ranked ? (
              <span>
                Top <span className="font-mono">{rows.length}</span> by profile score (lower is better); arrows show the rank change against the default weights.
                {typeof rank.data?.total_matching === "number" ? (
                  <>
                    {" "}
                    Ranked among <span className="font-mono">{rank.data.total_matching.toLocaleString("en-US")}</span>.
                  </>
                ) : null}
              </span>
            ) : (
              <>
                <span className="font-mono tabular-nums">{listTotal ? `${offset + 1}–${Math.min(offset + PAGE, listTotal)} of ${listTotal.toLocaleString("en-US")}` : "–"}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7" leading={<ChevronLeft />} disabled={offset === 0} onClick={() => setPage({ key: pageKey, offset: Math.max(0, offset - PAGE) })}>
                    Prev
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" trailing={<ChevronRight />} disabled={!listTotal || offset + PAGE >= listTotal} onClick={() => setPage({ key: pageKey, offset: offset + PAGE })}>
                    Next
                  </Button>
                </span>
              </>
            )}
          </div>
        </Card>

        <KraljicMatrix ids={rows.map((r) => r.supplier_id)} names={names} pinned={pinned} onOpen={(id) => openSupplier(id)} />
      </div>
    </div>
  );
}
