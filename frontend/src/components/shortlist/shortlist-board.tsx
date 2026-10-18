"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, Card, CardHeader, SegmentedControl, Skeleton, Tabs, buttonVariants } from "@/design-system/react";
import { advanceToFinalists } from "@/lib/cases/actions";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { cn } from "@/lib/utils";
import { useCurrentCase, useMetadata, useProfiles } from "@/components/case/case-context";
import { DERIVED_FIELD_LABELS, familiesOf, familyShort, fieldLabel, fmtNum, num, scoreFields, type CompareResult, type PerField, type RankResult } from "@/components/case/domain";
import { FamilyRadar } from "@/components/case/family-radar";
import { Empty, ErrorNote, MockBadge, Spinner, ui } from "@/components/case/primitives";
import { CURRENT_USER, useCaseUi } from "@/components/case/ui-store";
import { RankChange } from "@/components/explorer/results-table";
import { DropDialog } from "./drop-dialog";
import { HeatmapGrid, type HeatmapColumn } from "./heatmap-grid";
import { WeightSliders } from "./weight-sliders";

const OPS_FIELDS = ["delivery_rating", "order_confirmation_rate", "order_change_rate", "po_volume_eur"];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function normalize(points: Record<string, number>): Record<string, number> | null {
  const total = Object.values(points).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return Object.fromEntries(Object.entries(points).filter(([, p]) => p > 0).map(([f, p]) => [f, Math.round((p / total) * 10000) / 10000]));
}

/** Shortlist board: heatmap by dimension, family radar, live re-rank with weight sliders, advance or drop. */
export function ShortlistBoard() {
  const c = useCurrentCase();
  const { meta } = useMetadata();
  const { profiles } = useProfiles();
  const profile = profiles.find((p) => p.profile_id === c?.profileId);
  const openSupplier = useCaseUi((s) => s.openSupplier);
  const [tab, setTab] = useState<string>("all");
  const [order, setOrder] = useState<"rank" | "pinned">("rank");
  const [radarPick, setRadarPick] = useState<string[] | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ profileId: string; points: Record<string, number> } | null>(null);

  const ids = useMemo(() => c?.shortlist ?? [], [c?.shortlist]);
  const sortedIds = useMemo(() => [...ids].sort(), [ids]);
  const profileId = c?.profileId ?? "default";
  const profilePoints = useMemo(() => Object.fromEntries(Object.entries(profile?.weights ?? {}).filter(([, w]) => w > 0).map(([f, w]) => [f, Math.round(w * 100)])), [profile]);
  const points = draft && draft.profileId === profileId ? draft.points : profilePoints;
  const dirty = !!draft && draft.profileId === profileId;
  const appliedPoints = useDebounced(points, 250);
  const custom = dirty ? normalize(appliedPoints) : null;

  const compare = useDataTool<CompareResult>("compare_suppliers", sortedIds.length ? { ids: sortedIds, profile_id: profileId } : null);
  const rank = useDataTool<RankResult>("rank_with_profile", sortedIds.length ? { ids: sortedIds, ...(custom ? { custom_weights: custom } : { profile_id: profileId }), limit: 20 } : null);

  const rowById = useMemo(() => new Map((compare.data?.suppliers ?? []).map((r) => [r.supplier_id, r])), [compare.data]);
  const famById = useMemo(() => new Map((compare.data?.family_scores ?? []).map((r) => [r.supplier_id, r])), [compare.data]);
  const rankById = useMemo(() => new Map((rank.data?.ranking ?? []).map((r) => [r.supplier_id, r])), [rank.data]);
  const perField = useMemo(() => new Map<string, PerField>((compare.data?.per_field ?? []).map((p) => [p.field, p])), [compare.data]);

  if (!c) return null;

  const families = familiesOf(meta);
  const sf = scoreFields(meta);
  const fields = tab === "all" ? ["total_risk_index", ...sf.map((f) => f.field)] : tab === "operations" ? OPS_FIELDS : sf.filter((f) => f.family === tab).map((f) => f.field);
  const orderedIds = order === "rank" && rankById.size ? [...ids].sort((a, b) => (rankById.get(a)?.rank ?? 99) - (rankById.get(b)?.rank ?? 99)) : ids;
  const columns: HeatmapColumn[] = orderedIds.map((id) => ({ id, row: rowById.get(id) ?? null, rank: rankById.get(id) ?? null, finalist: c.finalists.includes(id) }));
  const defaultRadar = orderedIds.slice(0, 3);
  const radarIds = (radarPick ?? defaultRadar).filter((id) => ids.includes(id)).slice(0, 3);
  const nameOf = (id: string) => {
    const n = rowById.get(id)?.supplier_name;
    return typeof n === "string" ? n : id;
  };
  const addable = [...sf.map((f) => f.field), ...Object.keys(DERIVED_FIELD_LABELS)].filter((f) => !(f in points));
  const setPoints = (next: Record<string, number>) => setDraft({ profileId, points: next });

  if (!ids.length) {
    return (
      <div className="p-6">
        <Empty>
          The shortlist is empty. Add up to 20 suppliers from the{" "}
          <Link className="text-ink underline underline-offset-2" href={`/cases/${c.id}`}>
            long list
          </Link>
          .
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Shortlist</h2>
        <span className="font-mono text-sm tabular-nums text-subtext">{ids.length}/20</span>
        {(compare.loading || rank.loading) && <Spinner />}
        <MockBadge meta={compare.meta} />
        <div className="ml-auto flex items-center gap-2">
          <SegmentedControl
            size="sm"
            aria-label="Column order"
            value={order}
            onValueChange={setOrder}
            items={[
              { value: "rank", label: "By rank" },
              { value: "pinned", label: "As pinned" },
            ]}
          />
          <Link href={`/cases/${c.id}/finalists`} className={buttonVariants({ variant: "primary", size: "sm" })}>
            Finalists ({c.finalists.length}) <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <ErrorNote error={compare.error} what="compare_suppliers" />
      <ErrorNote error={rank.error} what="rank_with_profile" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle px-3 pt-2">
            <Tabs
              variant="underline"
              value={tab}
              onValueChange={setTab}
              items={[{ value: "all", label: "All" }, ...families.map((f) => ({ value: f, label: familyShort(f, meta) })), { value: "operations", label: "Operations" }]}
            />
          </div>
          {!!compare.data?.largest_differences?.length && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-subtle px-3 py-2 text-xs">
              <span className={ui.eyebrow}>Largest differences</span>
              {compare.data.largest_differences.map((f) => (
                <Badge key={f} size="sm" tone="outline">
                  {fieldLabel(meta, f)}
                  {typeof perField.get(f)?.spread === "number" && <span className="font-mono">{fmtNum(perField.get(f)!.spread!, 0)}</span>}
                </Badge>
              ))}
              <span className="ml-auto flex items-center gap-3 text-2xs text-subtext">
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2.5 rounded-sm ring-1 ring-inset ring-[var(--risk-low)]" /> best
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2.5 rounded-sm ring-1 ring-inset ring-[var(--risk-critical)]" /> worst
                </span>
              </span>
            </div>
          )}
          {compare.data ? (
            <HeatmapGrid
              meta={meta}
              fields={fields}
              columns={columns}
              perField={perField}
              radarIds={radarIds}
              onToggleRadar={(id) => {
                const cur = radarIds;
                setRadarPick(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 3));
              }}
              onOpen={(id) => openSupplier(id)}
              onAdvance={(id) => advanceToFinalists(c.id, id, CURRENT_USER.name)}
              onDrop={(id) => setDropId(id)}
            />
          ) : (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Weights"
              description={dirty ? "Custom weights. Ranks update live." : `${profile?.label ?? profileId} weights. Drag to re-rank.`}
              action={rank.loading ? <Spinner /> : undefined}
            />
            <div className="px-4 pb-3">
              <WeightSliders
                meta={meta}
                weights={points}
                onChange={(f, p) => setPoints({ ...points, [f]: p })}
                onRemove={(f) => {
                  const next = { ...points };
                  delete next[f];
                  setPoints(next);
                }}
                onAdd={(f) => setPoints({ ...points, [f]: 10 })}
                onReset={() => setDraft(null)}
                addable={addable}
                dirty={dirty}
              />
            </div>
            <div className="border-t border-subtle">
              <div className="grid grid-cols-[2rem_1fr_3rem_3.5rem] gap-1 px-4 py-1.5 text-2xs font-medium uppercase tracking-wide text-tertiary">
                <span>#</span>
                <span>Supplier</span>
                <span className="text-right">Score</span>
                <span className="text-right" title="Rank under default weights, and the change">
                  Default
                </span>
              </div>
              <ol className={cn("max-h-80 overflow-auto pb-2", rank.stale && "opacity-60")}>
                {(rank.data?.ranking ?? []).map((r) => (
                  <li key={r.supplier_id}>
                    <button type="button" onClick={() => openSupplier(r.supplier_id)} className="grid w-full grid-cols-[2rem_1fr_3rem_3.5rem] items-center gap-1 px-4 py-1 text-left text-sm hover:bg-hover">
                      <span className="font-mono tabular-nums text-ink">{r.rank}</span>
                      <span className="truncate">{nameOf(r.supplier_id)}</span>
                      <span className="text-right font-mono tabular-nums">{fmtNum(num(r.profile_score), 1)}</span>
                      <span className="flex items-center justify-end gap-1 font-mono text-xs tabular-nums text-subtext">
                        {r.default_rank ?? "–"}
                        <RankChange change={r.rank_change} />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          <Card>
            <CardHeader title="Family radar" description="Up to three suppliers; tick them in the column headers." />
            <div className="px-4 pb-4">
              {radarIds.length ? (
                <FamilyRadar meta={meta} families={families} series={radarIds.map((id) => ({ id, name: nameOf(id), scores: famById.get(id) ?? {} }))} />
              ) : (
                <p className="text-sm text-subtext">Tick suppliers in the heatmap to compare their risk families.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <DropDialog caseId={c.id} supplierId={dropId} supplierName={dropId ? nameOf(dropId) : ""} onClose={() => setDropId(null)} />
    </div>
  );
}
