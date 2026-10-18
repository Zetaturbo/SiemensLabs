"use client";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fieldLabel, fmtNum, num, type ExplainResult, type Metadata } from "./domain";
import { useChartTheme } from "./chart-theme";
import { ui } from "./primitives";

interface Step {
  name: string;
  base: number;
  value: number;
  delta: number;
  kind: "start" | "up" | "down" | "end";
  detail: string;
}

const TOP = 8;

/**
 * Waterfall from the dataset mean to this supplier's score: each bar is one field's
 * weight x (value - dataset mean). Red raises risk, blue lowers it.
 */
export function ContributionWaterfall({ meta, explain, endLabel }: { meta: Metadata; explain: ExplainResult & { profile_score?: number }; endLabel: string }) {
  const theme = useChartTheme();
  const contribs = (explain.contributions ?? []).filter((c) => typeof c.contribution_vs_mean === "number");
  const mean = num(explain.dataset_mean);
  if (!contribs.length || mean === null) return <p className={`text-xs ${ui.muted}`}>No contribution breakdown in this response.</p>;

  const sorted = [...contribs].sort((a, b) => Math.abs(b.contribution_vs_mean!) - Math.abs(a.contribution_vs_mean!));
  const top = sorted.slice(0, TOP).sort((a, b) => b.contribution_vs_mean! - a.contribution_vs_mean!);
  const rest = sorted.slice(TOP);
  const restSum = rest.reduce((s, c) => s + c.contribution_vs_mean!, 0);
  const sumAll = contribs.reduce((s, c) => s + c.contribution_vs_mean!, 0);
  // the profile's dataset-mean score is not in the response; for the default profile it equals the TRI mean
  const end = mean + sumAll;
  const reported = num(explain.profile_score) ?? num(explain.total_risk_index);

  const steps: Step[] = [];
  let run = mean;
  const points: number[] = [mean];
  const push = (name: string, delta: number, detail: string) => {
    const base = delta >= 0 ? run : run + delta;
    steps.push({ name, base, value: Math.abs(delta), delta, kind: delta >= 0 ? "up" : "down", detail });
    run += delta;
    points.push(run);
  };
  for (const c of top) {
    push(fieldLabel(meta, c.field), c.contribution_vs_mean!, `value ${fmtNum(num(c.value), 1)} · weight ${fmtNum(num(c.weight), 2)} · p${fmtNum(num(c.percentile), 0)}`);
  }
  if (rest.length) push(`${rest.length} other fields`, restSum, rest.map((c) => fieldLabel(meta, c.field)).join(", "));
  points.push(end);
  const lo = Math.max(0, Math.floor(Math.min(...points) - 4));
  const hi = Math.min(100, Math.ceil(Math.max(...points) + 4));
  const data: Step[] = [
    { name: "Dataset mean", base: lo, value: mean - lo, delta: mean, kind: "start", detail: "mean over all suppliers" },
    ...steps,
    { name: endLabel, base: lo, value: end - lo, delta: end, kind: "end", detail: reported !== null ? `reported ${fmtNum(reported, 1)}` : "" },
  ];
  const fill = (s: Step) => (s.kind === "up" ? theme.increase : s.kind === "down" ? theme.decrease : theme.neutral);

  return (
    <div style={{ height: 28 + data.length * 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={theme.grid} strokeDasharray="2 4" />
          <XAxis type="number" domain={[lo, hi]} allowDataOverflow tick={{ fontSize: 10, fill: theme.textMuted }} stroke={theme.axis} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: theme.text }} stroke={theme.axis} interval={0} />
          <ReferenceLine x={mean} stroke={theme.axis} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ fill: theme.grid, fillOpacity: 0.4 }}
            content={({ active, payload }) => {
              const s = active && payload?.[0]?.payload ? (payload[0].payload as Step) : null;
              if (!s) return null;
              return (
                <div className="max-w-64 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="font-medium">{s.name}</div>
                  <div className="tabular-nums">
                    {s.kind === "start" || s.kind === "end" ? fmtNum(s.delta, 2) : `${s.delta >= 0 ? "+" : "−"}${fmtNum(Math.abs(s.delta), 2)} points`}
                  </div>
                  {s.detail && <div className={ui.muted}>{s.detail}</div>}
                </div>
              );
            }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" isAnimationActive={false} radius={2}>
            {data.map((s, i) => (
              <Cell key={i} fill={fill(s)} />
            ))}
            <LabelList
              dataKey="delta"
              position="right"
              style={{ fontSize: 10, fill: theme.textMuted }}
              formatter={(v: unknown) => {
                const n = typeof v === "number" ? v : Number(v);
                return Number.isFinite(n) ? (Math.abs(n) > 20 ? fmtNum(n, 1) : `${n >= 0 ? "+" : "−"}${fmtNum(Math.abs(n), 1)}`) : "";
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
