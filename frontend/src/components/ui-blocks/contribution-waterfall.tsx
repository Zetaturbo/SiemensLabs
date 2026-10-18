"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import type { Level } from "@/lib/data-api/types";
import { asLevel, labelOf, levelOf, num, signed, str, supplierLabel } from "./fields";
import { BETTER, BlockEmpty, BlockFrame, LevelChip, Num, WORSE, WithResult, cn } from "./primitives";
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

/** Risk colors for movers, graphite for the anchors. */
const FILL: Record<Step["kind"], string> = {
  up: "var(--risk-critical)",
  down: "var(--risk-low)",
  start: "var(--lw-gray-300)",
  end: "var(--lw-text-primary)",
};
const AXIS = { fill: "var(--lw-text-tertiary)", fontSize: 11 };

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
  if (rest.length) push(`${rest.length} other fields`, rest.reduce((a, c) => a + c.delta, 0));
  steps.push({ label: "Total risk index", range: [0, run], delta: run, kind: "end", value: tri ?? run });
  return { steps, mean, tri, hasData: contributions.length > 0 };
}

function StepShape(props: BarShapeProps) {
  const step = props.payload as Step | undefined;
  const { x, y, width, height } = props;
  if (![x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))) return <g />;
  return <rect x={x} y={y} width={Math.max(1, width)} height={height} rx={2} style={{ fill: FILL[step?.kind ?? "start"] }} />;
}

function StepTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Step }> }) {
  const s = payload?.[0]?.payload;
  if (!active || !s) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink shadow-md">
      <p className="font-semibold">{s.label}</p>
      {s.kind === "start" || s.kind === "end" ? (
        <Num>{(s.value ?? s.delta).toFixed(2)}</Num>
      ) : (
        <>
          <Num className={s.delta >= 0 ? WORSE : BETTER}>{signed(s.delta, 2)} vs mean</Num>
          {s.value != null && (
            <p className="text-subtext">
              value <Num>{s.value}</Num>
              {s.weight != null && (
                <>
                  {" "}
                  · weight <Num>{s.weight}</Num>
                </>
              )}
              {s.percentile != null && (
                <>
                  {" "}
                  · p<Num>{Math.round(s.percentile)}</Num>
                </>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
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
        const movers = steps.filter((s) => s.kind === "up" || s.kind === "down");
        const critical = (Array.isArray(d.critical_fields) ? d.critical_fields : []).filter((f): f is string => typeof f === "string");
        return (
          <BlockFrame
            block="contribution-waterfall"
            title={
              <span className="flex items-center gap-2">
                Why {supplierLabel(d)} scores <Num>{tri ?? "–"}</Num> <LevelChip level={level} />
              </span>
            }
            subtitle={
              <>
                From the dataset mean (<Num>{mean.toFixed(1)}</Num>) to the total risk index; each step is weight × (value − field mean).
                {percentile !== null && (
                  <>
                    {" "}
                    Riskier than <Num>{percentile.toFixed(0)}</Num>% of suppliers.
                  </>
                )}
              </>
            }
          >
            <div style={{ height: steps.length * 24 + 36 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={steps} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }} barCategoryGap={4}>
                  <XAxis type="number" domain={[0, Math.ceil(max / 10) * 10]} tick={AXIS} stroke="var(--lw-border)" />
                  <YAxis type="category" dataKey="label" width={140} tick={AXIS} stroke="var(--lw-border)" interval={0} />
                  <ReferenceLine x={mean} stroke="var(--lw-border-strong)" strokeDasharray="3 3" />
                  <Tooltip content={<StepTooltip />} cursor={{ fill: "var(--lw-hover)" }} />
                  <Bar dataKey="range" shape={StepShape} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
              {movers.slice(0, 6).map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">
                    {s.label}
                    {s.value != null && <Num className="ml-1 text-tertiary">{s.value}</Num>}
                  </span>
                  <Num className={cn(s.delta >= 0 ? WORSE : BETTER)}>{signed(s.delta, 2)}</Num>
                </li>
              ))}
            </ul>
            {critical.length > 0 && (
              <p className="mt-2 text-xs text-subtext">
                <span className="font-semibold text-[var(--risk-critical)]">
                  Critical on <Num>{critical.length}</Num>:
                </span>{" "}
                {critical.map((f) => labelOf(f).toLowerCase()).join(", ")}
              </p>
            )}
            {str(d.profile_id) && str(d.profile_id) !== "default" && <p className="mt-1 text-2xs text-tertiary">Weights from profile {str(d.profile_id)}.</p>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const ContributionWaterfallBlock: ComponentRenderer<BlockProps<"ContributionWaterfall">> = ({ props }) => (
  <ContributionWaterfallView resultId={props.resultId} limit={props.limit} />
);
