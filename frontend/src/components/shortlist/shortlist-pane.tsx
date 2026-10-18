"use client";
import { useMemo, type ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button, Select, Tooltip } from "@/design-system/react";
import { advanceToFinalists, setProfile } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { MIN_PINNED } from "@/components/case/board-step";
import { weightedFields, type CompareResult, type Metadata, type Profile, type SupplierRow } from "@/components/case/domain";
import { CURRENT_USER } from "@/components/case/ui-store";
import { Dot, LevelDot, Num } from "@/components/ui-blocks/primitives";
import { asLevel, formatValue, labelOf, num } from "@/components/ui-blocks/fields";
import { CompareTable, type Better, type CompareColumn, type CompareGroup, type CompareMetric } from "./compare-table";
import type { ShortlistRanking } from "./ranking";


/** Category fields compared by their order (lower is better). */
const CATEGORY_ORDER: Record<string, string[]> = {
  sourcing_risk_level: ["Low", "Medium", "High", "Critical"],
  supply_chain_complexity: ["Simple", "Moderate", "Complex"],
};

const PROFILE_ORDER = ["safety_critical", "strategic_system", "commodity", "lksg_due_diligence"];

function groups(meta: Metadata, profile: Profile | undefined): CompareGroup[] {
  const m = (key: string, better: Better, label = labelOf(key)): CompareMetric => ({ key, label, better });
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
function bestOf(metric: CompareMetric, ids: string[], value: (id: string) => unknown): string | null {
  if (!metric.better) return null;
  const vals = ids.map((id) => ({ id, v: comparable(metric.key, value(id)) })).filter((x): x is { id: string; v: number } => x.v !== null);
  if (vals.length < 2) return null;
  const sorted = [...vals].sort((a, b) => (metric.better === "higher" ? b.v - a.v : a.v - b.v));
  return sorted[0].v === sorted[1].v ? null : sorted[0].id;
}

function display(field: string, v: unknown): string {
  if (field === "profile_score") return typeof v === "number" ? v.toFixed(2) : "–";
  return formatValue(field, v);
}

/**
 * The board's right pane, "Shortlist": the pinned suppliers on the shared comparison grid (`compare-table.tsx`:
 * dimensions as rows grouped risk, delivery, procurement; suppliers as columns with their pin; a dot marks the best
 * value per row, lower or higher is better per metric). The profile selector re-ranks the columns (and sets the case's
 * profile, so the chat ranks the same way). Each column's filled pin unpins it (finalists stay). With three or more
 * pinned each column can advance to the finalists (disabled before, with the reason as a tooltip); finalists get a
 * Research action, which opens the case chat with the question (the existing research flow).
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

  const columns: CompareColumn[] = ids.map((id) => {
    const finalist = c.finalists.includes(id);
    const awarded = c.awardedSupplier === id;
    const name = nameOf(id);
    let action: ReactNode = null;
    if (awarded)
      action = (
        <span className="inline-flex items-center gap-1.5 text-sm text-ink">
          <Dot fill="var(--risk-low)" /> Awarded
        </span>
      );
    else if (finalist)
      action =
        c.stage === "finalists" ? (
          <Tooltip label="Research in public records (opens the case chat)" side="bottom" className="text-sm font-normal">
            <Button size="sm" variant="secondary" leading={<Search />} onClick={() => onResearch(id, name)} aria-label={`Research ${name}`}>
              Research
            </Button>
          </Tooltip>
        ) : (
          <span className="text-sm text-subtext">Finalist</span>
        );
    else if (c.stage !== "awarded")
      action = (
        <Tooltip label={canAdvance ? "Advance to finalists" : `Pin at least ${MIN_PINNED} suppliers to advance`} side="bottom" className="text-sm font-normal">
          <Button size="sm" variant="secondary" trailing={<ArrowRight />} disabled={!canAdvance} onClick={() => advanceToFinalists(c.id, id, CURRENT_USER.name)} aria-label={`Advance ${name} to finalists`}>
            Advance
          </Button>
        </Tooltip>
      );
    return {
      id,
      name,
      sub: <Num>{id}</Num>,
      rank: rankNo(id) ? `#${rankNo(id)}` : undefined,
      pin: { label: `Unpin ${name}`, onToggle: () => unpin(c.id, id, CURRENT_USER.name), locked: finalist ? "Finalists stay on the shortlist" : undefined },
      action,
    };
  });

  return (
    <section aria-label="Shortlist" data-board-shortlist className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-base font-semibold text-ink">Shortlist</h2>
          <span className="text-sm text-subtext">
            <Num className="text-ink">{c.shortlist.length}</Num> pinned
          </span>
        </div>
        <Select size="sm" aria-label="Weight profile" options={options} value={c.profileId} onValueChange={(p) => setProfile(c.id, p, CURRENT_USER.name)} className="max-w-[16rem] font-normal" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto border-t border-subtle pb-4">
        {ids.length === 0 ? (
          <p className="px-4 pt-4 text-sm text-subtext">Pin suppliers from the candidates to compare them here.</p>
        ) : (
          <CompareTable
            ariaLabel="Shortlist comparison"
            columns={columns}
            groups={groups(meta, profile)}
            stale={compare.stale || ranking.loading}
            best={(m) => {
              const b = bestOf(m, ids, (id) => value(id, m.key));
              return new Set(b ? [b] : []);
            }}
            cell={(m, id) => {
              const v = value(id, m.key);
              const lv = m.key === "sourcing_risk_level" ? asLevel(v) : null;
              return lv ? <LevelDot level={lv} /> : display(m.key, v);
            }}
          />
        )}
      </div>
    </section>
  );
}
