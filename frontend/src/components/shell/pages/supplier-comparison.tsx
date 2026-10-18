"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button, SearchInput, Tooltip } from "@/design-system/react";
import { fmtEur } from "@/components/case/domain";
import { BOARD_PAGE, BodyRow, Cell, HeadCell, LevelScore, NameCell, PinToggle, ShowMore, boardHeadClass, boardTableClass } from "@/components/explorer/board-table";
import { CompareTable, type CompareColumn, type CompareGroup, type CompareMetric } from "@/components/shortlist/compare-table";
import { LevelDot, Num } from "@/components/ui-blocks/primitives";
import { comparisonMetrics, getBestSupplierIds, searchSuppliers, updateShortlist, type Metric, type Supplier } from "@/lib/brake-suppliers/suppliers";

/** Companies side by side at most, so the grid fits its pane. */
const MAX_COMPARE = 3;
/** The brake case's chat, where Research runs (the research flow with entity choice and sources). */
const BRAKE_CASE = "case_brake_system";

const GROUP_TITLE: Record<Metric["group"], string> = { "Risk score": "Risk", "Delivery performance": "Delivery", "Procurement context": "Procurement" };

const GROUPS: CompareGroup[] = (Object.keys(GROUP_TITLE) as Metric["group"][]).map((group) => ({
  title: GROUP_TITLE[group],
  metrics: comparisonMetrics.filter((m) => m.group === group).map((m) => ({ key: m.key, label: m.label, better: m.better })),
}));
const METRIC = new Map(comparisonMetrics.map((m) => [m.key as string, m]));

function valueCell(s: Supplier, metric: Metric): ReactNode {
  const v = s[metric.key];
  if (v === undefined || v === null) return "–";
  if (metric.format === "level" && typeof v === "string") return <LevelDot level={v as Supplier["sourcingRiskLevel"]} />;
  if (typeof v === "string") return <span className="text-ink">{v}</span>;
  if (typeof v !== "number") return "–";
  if (metric.format === "currency") return fmtEur(v);
  if (metric.format === "percent") return `${v.toFixed(1)}%`;
  return v.toFixed(0);
}

/**
 * The real brake manufacturers (real names, simulated scores) on the Suppliers page, on the same table and comparison
 * primitives as the board above it: a searchable list (name, country, segments, status, Total Risk Index with its level),
 * a pin per row that adds the company to the comparison (up to three), and the comparison grid (risk, delivery,
 * procurement; best value per row marked, lower or higher is better per metric). Research hands off to the brake
 * case's chat (`/cases/case_brake_system?ask=Research <name>`), where the research flow runs.
 */
export function SupplierComparison({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => searchSuppliers(suppliers, "").slice(0, 2).map((s) => s.id));
  const [more, setMore] = useState<{ query: string; n: number }>({ query: "", n: BOARD_PAGE });
  const shown = more.query === query ? more.n : BOARD_PAGE;

  const byId = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const matches = useMemo(() => searchSuppliers(suppliers, query, suppliers.length), [suppliers, query]);
  const rows = matches.slice(0, shown);
  const selected = selectedIds.map((id) => byId.get(id)).filter((s): s is Supplier => s !== undefined);
  const full = selectedIds.length >= MAX_COMPARE;

  const toggle = (id: string) => setSelectedIds((ids) => updateShortlist(ids, id, MAX_COMPARE).ids);
  const research = (name: string) => router.push(`/cases/${BRAKE_CASE}?ask=${encodeURIComponent(`Research ${name}`)}`);

  const columns: CompareColumn[] = selected.map((s) => ({
    id: s.id,
    name: s.name,
    sub: s.country ?? <Num>{s.id}</Num>,
    pin: { label: `Remove ${s.name} from the comparison`, onToggle: () => toggle(s.id) },
    action: (
      <Tooltip label="Opens the brake case chat with the question" side="bottom" className="text-sm font-normal">
        <Button size="sm" variant="secondary" leading={<Search />} onClick={() => research(s.name)} aria-label={`Research ${s.name}`}>
          Research
        </Button>
      </Tooltip>
    ),
  }));

  const best = (m: CompareMetric): ReadonlySet<string> => {
    const metric = METRIC.get(m.key);
    if (!metric || selected.length < 2) return new Set();
    const ids = getBestSupplierIds(selected, metric);
    return ids.size === selected.length ? new Set() : ids;
  };

  return (
    <section data-brake-comparison aria-labelledby="brake-title" className="px-8 pb-10">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 id="brake-title" className="text-base font-semibold text-ink">
          Real brake manufacturers
        </h2>
        <span className="text-sm text-subtext">Real names, simulated scores</span>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-subtle bg-surface">
        <div aria-label="Companies" className="flex min-w-0 flex-col">
          <div className="flex shrink-0 flex-col gap-3 px-4 pb-4 pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-ink">Companies</h3>
              <span className="text-sm text-subtext" aria-live="polite">
                <Num className="text-ink">{matches.length}</Num> {query.trim() ? "found" : "listed"}
              </span>
            </div>
            <SearchInput inputSize="sm" placeholder="Search name or id" aria-label="Search brake manufacturers" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="border-t border-subtle pb-4">
            {rows.length > 0 ? (
              <table className={boardTableClass} aria-label="Brake manufacturers">
                <colgroup>
                  <col />
                  <col className="w-[6.5rem]" />
                  <col className="w-[8.5rem]" />
                  <col className="w-[3.25rem]" />
                </colgroup>
                <thead className={boardHeadClass}>
                  <tr>
                    <HeadCell>Company</HeadCell>
                    <HeadCell hint="Where the scores come from">Status</HeadCell>
                    <HeadCell align="right" hint="Total Risk Index, 0 = no risk, 100 = max; lower is better">
                      Total risk
                    </HeadCell>
                    <HeadCell align="right">
                      <span className="sr-only">Compare</span>
                    </HeadCell>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const on = selectedIds.includes(s.id);
                    const sub = [s.country, s.segments.join(", ")].filter(Boolean).join(" · ");
                    return (
                      <BodyRow key={s.id} data-brake-supplier={s.id} marked={on}>
                        <Cell>
                          <NameCell name={s.name} sub={<span title={sub}>{sub || s.id}</span>} />
                        </Cell>
                        <Cell>
                          <span className="text-subtext">{s.status ?? "–"}</span>
                        </Cell>
                        <Cell align="right">
                          <LevelScore value={s.totalRiskIndex} level={s.totalRiskLevel} />
                        </Cell>
                        <Cell align="right">
                          <PinToggle
                            on={on}
                            label={on ? `Remove ${s.name} from the comparison` : `Compare ${s.name}`}
                            disabled={!on && full}
                            reason={`Compare at most ${MAX_COMPARE}; remove one first`}
                            onToggle={() => toggle(s.id)}
                          />
                        </Cell>
                      </BodyRow>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-4 pt-4 text-sm text-subtext">No company is named like “{query.trim()}”.</p>
            )}
            {matches.length > rows.length && (
              <div className="px-4">
                <ShowMore count={matches.length - rows.length} onClick={() => setMore({ query, n: matches.length })} />
              </div>
            )}
          </div>
        </div>

        <div data-brake-compare aria-label="Comparison" className="flex min-w-0 flex-col border-l border-subtle">
          <div className="flex h-[3.75rem] shrink-0 items-center justify-between gap-3 px-4 pt-1">
            <div className="flex items-baseline gap-3">
              <h3 className="text-base font-semibold text-ink">Comparison</h3>
              <span className="text-sm text-subtext">
                <Num className="text-ink">{selected.length}</Num> of <Num className="text-ink">{MAX_COMPARE}</Num>
              </span>
            </div>
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" leading={<X />} onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            )}
          </div>
          {selected.length === 0 ? (
            <p className="border-t border-subtle px-4 pt-4 text-sm text-subtext">Pin up to {MAX_COMPARE} companies to compare them here.</p>
          ) : (
            <div className="overflow-x-auto border-t border-subtle pb-4">
              <CompareTable
                ariaLabel="Brake manufacturers compared"
                columns={columns}
                groups={GROUPS}
                best={best}
                cell={(m, id) => {
                  const s = byId.get(id);
                  const metric = METRIC.get(m.key);
                  return s && metric ? valueCell(s, metric) : "–";
                }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
