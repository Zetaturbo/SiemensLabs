"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import type { Level } from "@/lib/data-api/types";
import { asLevel, labelOf, levelOf, num, signed, str, supplierLabel } from "./fields";
import { BlockEmpty, BlockFrame, LevelDot, Num, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

interface Step {
  label: string;
  range: [number, number];
  delta: number;
  kind: "start" | "up" | "down" | "end";
  value?: number | null;
  level?: Level | null;
  weight?: number | null;
  percentile?: number | null;
}

/** Risk colours for the movers, graphite for the two anchors. */
const FILL: Record<Step["kind"], string> = {
  up: "bg-[var(--risk-critical)]",
  down: "bg-[var(--risk-low)]",
  start: "bg-strong",
  end: "bg-ink",
};

/** explain_supplier { dataset_mean, total_risk_index, contributions[] } to waterfall steps. */
export function buildWaterfall(data: unknown, limit: number) {
  const d = (data ?? {}) as Rec;
  const contributions = (Array.isArray(d.contributions) ? d.contributions : [])
    .filter((c): c is Rec => !!c && typeof c === "object" && typeof (c as Rec).field === "string" && num((c as Rec).contribution_vs_mean) !== null)
    .map((c) => ({
      field: c.field as string,
      delta: num(c.contribution_vs_mean)!,
      value: num(c.value),
      level: asLevel(c.level) ?? levelOf(num(c.value)),
      weight: num(c.weight),
      percentile: num(c.percentile),
    }))
    .sort((a, b) => b.delta - a.delta);
  const mean = num(d.dataset_mean) ?? 50;
  const tri = num(d.total_risk_index);

  // Keep the largest movers by size; fold the rest into one step.
  const keep = new Set(
    [...contributions]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, limit)
      .map((c) => c.field),
  );
  const rest = contributions.filter((c) => !keep.has(c.field));

  const steps: Step[] = [{ label: "Dataset mean", range: [0, mean], delta: mean, kind: "start", value: mean }];
  let run = mean;
  const push = (label: string, delta: number, extra: Partial<Step> = {}) => {
    const next = run + delta;
    steps.push({ label, range: delta >= 0 ? [run, next] : [next, run], delta, kind: delta >= 0 ? "up" : "down", ...extra });
    run = next;
  };
  for (const c of contributions.filter((c) => keep.has(c.field))) push(labelOf(c.field), c.delta, { value: c.value, level: c.level, weight: c.weight, percentile: c.percentile });
  if (rest.length) push(`${rest.length} other field${rest.length === 1 ? "" : "s"}`, rest.reduce((a, c) => a + c.delta, 0));
  steps.push({ label: "Total risk index", range: [0, run], delta: run, kind: "end", value: tri ?? run });
  return { steps, mean, tri, hasData: contributions.length > 0 };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function stepTitle(s: Step): string {
  if (s.kind === "start" || s.kind === "end") return `${s.label}: ${fmt(s.value ?? s.delta)}`;
  const parts = [`${s.label}: ${signed(s.delta, 2)} vs the mean`];
  if (s.value != null) parts.push(`value ${s.value}`);
  if (s.weight != null) parts.push(`weight ${s.weight}`);
  if (s.percentile != null) parts.push(`percentile ${Math.round(s.percentile)}`);
  return parts.join(", ");
}

export function ContributionWaterfallView({ resultId, data, limit }: { resultId?: string | null; data?: unknown; limit?: number | null }) {
  return (
    <WithResult block="contribution-waterfall" resultId={resultId} data={data} skeletonRows={8}>
      {(value) => {
        const d = (value ?? {}) as Rec;
        const { steps, mean, tri, hasData } = buildWaterfall(value, limit && limit > 0 ? limit : 8);
        if (!hasData) return <BlockEmpty block="contribution-waterfall" title="Score breakdown" message="This result has no contribution breakdown." />;
        const level = asLevel(d.total_risk_level ?? d.total_risk_index_level) ?? levelOf(tri);
        const percentile = num(d.percentile);
        const max = Math.max(100, ...steps.map((s) => s.range[1]));
        const pct = (n: number) => `${(Math.max(0, n) / max) * 100}%`;
        const profile = str(d.profile_id);
        const note = [
          `From the dataset mean (${mean.toFixed(1)}) to the total risk index. Each step is a field's weight times its distance from the field mean; red adds risk, green removes it.`,
          percentile !== null && `Riskier than ${percentile.toFixed(0)}% of suppliers.`,
          profile && profile !== "default" && `Weights from the ${profile.replace(/_/g, " ")} profile.`,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <BlockFrame block="contribution-waterfall" title={`Why ${supplierLabel(d)} scores ${tri ?? "–"}`} note={note} actions={<LevelDot level={level} />}>
            <ol className="-mx-2">
              {steps.map((s, i) => {
                const anchor = s.kind === "start" || s.kind === "end";
                return (
                  <li key={`${s.label}-${i}`} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover @md:grid-cols-[11rem_minmax(0,1fr)_3.5rem]" title={stepTitle(s)}>
                    <span className={cn("truncate text-sm", anchor ? "font-medium text-ink" : "text-subtext")}>{s.label}</span>
                    <span className="relative h-4" aria-hidden>
                      <span className="absolute -inset-y-1 border-l border-dashed border-line" style={{ left: pct(mean) }} />
                      <span className={cn("absolute inset-y-0.5 min-w-0.5 rounded-sm", FILL[s.kind])} style={{ left: pct(s.range[0]), width: pct(s.range[1] - s.range[0]) }} />
                    </span>
                    <Num className={cn("text-right text-sm", anchor ? "font-semibold text-ink" : "text-subtext")}>{anchor ? fmt(s.value ?? s.delta) : signed(s.delta, 1)}</Num>
                  </li>
                );
              })}
            </ol>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const ContributionWaterfallBlock: ComponentRenderer<BlockProps<"ContributionWaterfall">> = ({ props }) => (
  <ContributionWaterfallView resultId={props.resultId} limit={props.limit} />
);
