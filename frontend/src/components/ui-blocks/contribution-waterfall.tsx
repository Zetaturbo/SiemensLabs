"use client";
import { defineComponent } from "@openuidev/react-lang";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { z } from "zod/v4";
import { asLevel, labelOf, levelOf, num, signed, str, supplierLabel } from "./fields";
import { BlockEmpty, BlockFrame, LevelChip, WithResult } from "./primitives";
import type { Level } from "@/lib/data-api/types";

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
  count?: number;
}

const COLORS = { up: "#ef4444", down: "#10b981", start: "#a1a1aa", end: "#0ea5e9" } as const;

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

  // Keep the largest movers by size; fold the rest into one "other" step.
  const bySize = [...contributions].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const keep = new Set(bySize.slice(0, limit).map((c) => c.field));
  const kept = contributions.filter((c) => keep.has(c.field));
  const rest = contributions.filter((c) => !keep.has(c.field));

  const steps: Step[] = [{ label: "Dataset mean", range: [0, mean], delta: mean, kind: "start", value: mean }];
  let run = mean;
  const push = (label: string, delta: number, extra: Partial<Step> = {}) => {
    const next = run + delta;
    steps.push({ label, range: delta >= 0 ? [run, next] : [next, run], delta, kind: delta >= 0 ? "up" : "down", ...extra });
    run = next;
  };
  for (const c of kept) push(labelOf(c.field), c.delta, { value: c.value, level: c.level, weight: c.weight, percentile: c.percentile });
  if (rest.length) push(`${rest.length} other fields`, rest.reduce((a, c) => a + c.delta, 0), { count: rest.length });
  steps.push({ label: "Total risk index", range: [0, run], delta: run, kind: "end", value: tri ?? run });
  return { steps, mean, tri, end: run, hasData: contributions.length > 0 };
}

function StepShape(props: BarShapeProps) {
  const step = props.payload as Step | undefined;
  const fill = step ? COLORS[step.kind] : COLORS.start;
  const { x, y, width, height } = props;
  if (![x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))) return <g />;
  return <rect x={x} y={y} width={Math.max(1, width)} height={height} rx={2} fill={fill} fillOpacity={step?.kind === "start" ? 0.5 : 0.9} />;
}

function StepTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Step }> }) {
  const s = payload?.[0]?.payload;
  if (!active || !s) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-semibold">{s.label}</p>
      {s.kind === "start" || s.kind === "end" ? (
        <p className="font-mono tabular-nums">{(s.value ?? s.delta).toFixed(2)}</p>
      ) : (
        <>
          <p className="font-mono tabular-nums">{signed(s.delta, 2)} vs mean</p>
          {s.value != null && (
            <p className="text-zinc-500">
              value {s.value}
              {s.weight != null && ` · weight ${s.weight}`}
              {s.percentile != null && ` · p${Math.round(s.percentile)}`}
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
        const height = steps.length * 24 + 36;
        const movers = steps.filter((s) => s.kind === "up" || s.kind === "down");
        return (
          <BlockFrame
            block="contribution-waterfall"
            title={
              <span className="flex items-center gap-2">
                Why {supplierLabel(d)} scores {tri ?? "–"} <LevelChip level={level} />
              </span>
            }
            subtitle={`From the dataset mean (${mean.toFixed(1)}) to the total risk index: weight × (value − field mean)${percentile !== null ? `. Riskier than ${percentile.toFixed(0)}% of suppliers.` : "."}`}
          >
            <div className="text-zinc-500 dark:text-zinc-400" style={{ height }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={steps} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={4}>
                  <XAxis type="number" domain={[0, Math.ceil(max / 10) * 10]} tick={{ fill: "currentColor", fontSize: 10 }} stroke="currentColor" strokeOpacity={0.3} />
                  <YAxis type="category" dataKey="label" width={140} tick={{ fill: "currentColor", fontSize: 11 }} stroke="currentColor" strokeOpacity={0.3} interval={0} />
                  <ReferenceLine x={mean} stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.5} />
                  <Tooltip content={<StepTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} />
                  <Bar dataKey="range" shape={StepShape} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
              {movers.slice(0, 6).map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {s.label}
                    {s.value != null && <span className="ml-1 font-mono text-zinc-400">{s.value}</span>}
                  </span>
                  <span className={`font-mono tabular-nums ${s.delta >= 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{signed(s.delta, 2)}</span>
                </li>
              ))}
            </ul>
            {Array.isArray(d.critical_fields) && d.critical_fields.length > 0 && (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-red-700 dark:text-red-300">{d.critical_fields.length} Critical:</span>{" "}
                {(d.critical_fields as unknown[]).filter((f): f is string => typeof f === "string").map((f) => labelOf(f).toLowerCase()).join(", ")}
              </p>
            )}
            {str(d.profile_id) && str(d.profile_id) !== "default" && <p className="mt-1 text-[10px] text-zinc-400">Weights from profile {str(d.profile_id)}.</p>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const ContributionWaterfall = defineComponent({
  name: "ContributionWaterfall",
  description:
    "Waterfall explaining one supplier's total risk index: each field's weighted contribution versus the dataset mean, sorted, red up and green down. " +
    "Use for explain_supplier results (why is this score high).",
  props: z.object({
    resultId: z.string().describe("Handle of an explain_supplier result"),
    limit: z.number().optional().describe("Number of largest contributions shown before grouping the rest (default 8)"),
  }),
  component: ({ props }) => <ContributionWaterfallView resultId={props.resultId} limit={props.limit} />,
});
